const env = require('../config/env');

let sentry = null;
if (env.SENTRY_DSN) {
  sentry = require('@sentry/node');
  sentry.init({
    dsn: env.SENTRY_DSN,
    sendDefaultPii: false,
    beforeSend(event) {
      // Forward only a generic error marker; avoid transmitting request data or exception text.
      return {
        event_id: event.event_id,
        timestamp: event.timestamp,
        platform: 'node',
        level: 'error',
        message: 'Classroom Hub server error',
        tags: { service: 'classroom-hub' }
      };
    }
  });
}

function captureError(error) {
  if (sentry) sentry.captureException(error);
}

module.exports = { captureError };
