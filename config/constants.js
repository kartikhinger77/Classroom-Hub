module.exports = Object.freeze({
  roles: ['student', 'teacher', 'admin'],
  postTypes: ['note', 'exercise'],
  accessTokenTtl: '15m',
  refreshDays: 30,
  maxPdfBytes: 10 * 1024 * 1024,
  maxPageSize: 50,
  passwordRule: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/
});
