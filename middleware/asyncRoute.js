// Express 4 does not forward rejected async route promises unless they are wrapped.
module.exports = function asyncRoute(handler) {
  return function asyncHandler(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
};
