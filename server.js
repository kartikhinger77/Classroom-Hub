const env = require('./config/env');
const app = require('./app');
const logger = require('./utils/logger');
const { connectDatabase, mongoose } = require('./config/db');
const { ensureUploadDirectory } = require('./services/fileService');
const { startRetentionScheduler } = require('./services/retentionService');
const User = require('./models/User');

async function start() {
  await connectDatabase(env.MONGODB_URI);
  if (!await User.exists({ role: 'admin' })) throw new Error('No administrator account exists. Run the seed script before starting the web server.');
  await ensureUploadDirectory();
  const server = app.listen(env.PORT, () => logger.info({ event: 'server_started', port: env.PORT, environment: env.NODE_ENV }, 'Classroom Hub listening'));
  const retention = startRetentionScheduler();

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ event: 'shutdown_started', signal }, 'Graceful shutdown started');
    retention.stop();
    server.close(async (error) => {
      if (error) logger.error({ event: 'http_close_failed', errorName: error.name }, 'HTTP server close failed');
      await mongoose.disconnect();
      logger.info({ event: 'shutdown_complete' }, 'Graceful shutdown complete');
      process.exitCode = error ? 1 : 0;
    });
    setTimeout(() => process.exit(1), 15000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

if (require.main === module) {
  start().catch((error) => {
    logger.error({ event: 'startup_failed', errorName: error.name }, 'Classroom Hub could not start');
    process.exit(1);
  });
}

module.exports = { start };
