const { fail } = require('../utils/response');

function validate(schema, source = 'body') {
  return function validateInput(req, res, next) {
    const result = schema.safeParse(req[source]);
    if (!result.success) return fail(res, 400, 'INVALID_INPUT', 'Please check the submitted information.');
    req[source] = result.data;
    return next();
  };
}

module.exports = { validate };
