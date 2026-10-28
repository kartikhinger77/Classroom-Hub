const multer = require('multer');
const logger = require('../utils/logger');
const { fail } = require('../utils/response');
const { captureError } = require('../services/errorTracking');

function notFound(_req, res) {
  return fail(res, 404, 'NOT_FOUND', 'The requested page or resource was not found.');
}

function errorHandler(error, req, res, _next) {
  if ((error.statusCode || error.status || 500) >= 500) captureError(error);
  const status = error instanceof multer.MulterError ? (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : (error.statusCode || (error.status === 400 || error.type === 'entity.parse.failed' ? 400 : 500));
  logger.error({ event: 'request_error', requestId: req.id, status, code: error.code || error.name }, 'Request failed');
  const message = status >= 500 ? 'An unexpected error occurred.' : (error.type === 'entity.parse.failed' ? 'The request could not be parsed.' : (error.message || 'The request could not be completed.'));
  return fail(res, status, status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED', message);
}

module.exports = { notFound, errorHandler };
