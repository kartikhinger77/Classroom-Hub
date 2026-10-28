const crypto = require('node:crypto');
const LoginAttempt = require('../models/LoginAttempt');
const env = require('../config/env');
const logger = require('../utils/logger');

async function recordFailedLogin(req) {
  const key = crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(String(req.ip || 'unknown')).digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 1000);
  let attempt = await LoginAttempt.findOneAndUpdate({ key, expiresAt: { $gt: now } }, { $inc: { count: 1 }, $set: { expiresAt } }, { new: true });
  if (!attempt) {
    try {
      attempt = await LoginAttempt.findOneAndUpdate({ key }, { $set: { count: 1, expiresAt } }, { upsert: true, new: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      attempt = await LoginAttempt.findOneAndUpdate({ key }, { $inc: { count: 1 }, $set: { expiresAt } }, { new: true });
    }
  }
  if (attempt?.count >= 50) logger.warn({ event: 'login_failure_threshold', count: attempt.count }, 'High failed sign-in rate detected');
}

module.exports = { recordFailedLogin };
