const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const compression = require('compression');
const env = require('./config/env');
const logger = require('./utils/logger');
const requestId = require('./middleware/requestId');
const { globalLimiter } = require('./middleware/rateLimit');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const postRoutes = require('./routes/posts');
const adminRoutes = require('./routes/admin');
const subjectRoutes = require('./routes/subjects');
const settingsRoutes = require('./routes/settings');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);

// Security headers are emitted before any application-controlled content.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'no-referrer' },
  permissionsPolicy: { features: { camera: [], microphone: [], geolocation: [] } }
}));
app.use(requestId);

// Only the configured application origin may make credentialed browser requests.
app.use(cors({
  origin(origin, callback) {
    return callback(null, !origin || origin === env.APP_ORIGIN);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
}));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && origin !== env.APP_ORIGIN) return res.status(403).json({ success: false, data: null, error: { code: 'ORIGIN_DENIED', message: 'Request origin is not allowed.' } });
  if (env.NODE_ENV === 'production' && !req.secure) return res.status(400).json({ success: false, data: null, error: { code: 'HTTPS_REQUIRED', message: 'HTTPS is required.' } });
  next();
});

app.use(express.json({ limit: '100kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 100 }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(hpp());
app.use(globalLimiter);
app.use((req, res, next) => {
  req._startedAt = Date.now();
  res.on('finish', () => logger.info({ event: 'http_request', requestId: req.id, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - req._startedAt, ip: req.ip }));
  next();
});
app.use(compression());

// Prevent browsers and shared proxies from caching authenticated API data.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' }, error: null }));
app.get('/ready', (_req, res) => {
  const ready = require('mongoose').connection.readyState === 1;
  return res.status(ready ? 200 : 503).json({ success: ready, data: { ready }, error: null });
});
app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/settings', settingsRoutes);

// The uploaded logo belongs in public/assets/school-logo.svg; private PDFs remain outside public/.
const publicDirectory = path.join(__dirname, 'public');
app.use(express.static(publicDirectory, {
  index: 'index.html',
  etag: true,
  maxAge: env.NODE_ENV === 'production' ? '7d' : 0,
  setHeaders(res, filePath) {
    if (/\.html$/i.test(filePath)) res.setHeader('Cache-Control', 'no-store');
    if (/\.(?:css|js|svg|webp|png)$/i.test(filePath)) res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.status(404).sendFile(path.join(publicDirectory, '404.html'));
});
app.use(notFound);
app.use(errorHandler);

module.exports = app;
