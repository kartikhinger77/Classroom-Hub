const pino = require('pino');

// Keep application logs structured and redact common credential-bearing keys.
module.exports = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['password', 'passwordHash', 'token', 'refreshToken', 'authorization', 'cookie', 'email', 'req.headers.authorization', 'req.headers.cookie'],
    censor: '[REDACTED]'
  },
  base: { service: 'classroom-hub' }
});
