const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { passwordRule } = require('../config/constants');

// A random, per-process dummy hash makes unknown-email login attempts pay the
// same bcrypt cost without placing any usable credential in source control.
let dummyHashPromise;
function getDummyHash() {
  if (!dummyHashPromise) dummyHashPromise = bcrypt.hash(crypto.randomBytes(48).toString('hex'), 12);
  return dummyHashPromise;
}

function validatePassword(password) {
  return typeof password === 'string' && passwordRule.test(password);
}

async function hashPassword(password) {
  if (!validatePassword(password)) throw new Error('Password must have 8–128 characters, including uppercase, lowercase, and a number.');
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, storedHash) {
  return bcrypt.compare(password, storedHash || await getDummyHash());
}

module.exports = { validatePassword, hashPassword, verifyPassword };
