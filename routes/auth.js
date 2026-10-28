const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const asyncRoute = require('../middleware/asyncRoute');

const router = express.Router();
const email = z.string().email().max(254).transform((value) => value.trim().toLowerCase());
const password = z.string().min(8).max(128).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/);

router.post('/register', authLimiter, validate(z.object({
  name: z.string().trim().min(1).max(100), email, password,
  role: z.enum(['student', 'teacher']), policyAccepted: z.literal(true)
}).strict()), asyncRoute(controller.register));
router.post('/verify-email', authLimiter, validate(z.object({ token: z.string().min(20).max(200) }).strict()), asyncRoute(controller.verifyEmail));
router.post('/login', authLimiter, validate(z.object({ email, password: z.string().min(1).max(128) }).strict()), asyncRoute(controller.login));
router.post('/verify-2fa', authLimiter, validate(z.object({ challenge: z.string().min(30).max(3000), code: z.string().regex(/^\d{6}$/) }).strict()), asyncRoute(controller.verifyTwoFactor));
router.post('/refresh', authLimiter, asyncRoute(controller.refresh));
router.post('/logout', optionalAuthenticate, asyncRoute(controller.logout));
router.post('/forgot-password', authLimiter, validate(z.object({ email }).strict()), asyncRoute(controller.forgotPassword));
router.post('/reset-password', authLimiter, validate(z.object({ token: z.string().min(20).max(200), password }).strict()), asyncRoute(controller.resetPassword));
router.post('/2fa/setup', authenticate, validate(z.object({ password, enabled: z.literal(true) }).strict()), asyncRoute(controller.verifyChallenge));
router.post('/2fa/disable', authenticate, validate(z.object({ password, enabled: z.literal(false) }).strict()), asyncRoute(controller.verifyChallenge));
router.post('/2fa/enable', authenticate, validate(z.object({ code: z.string().regex(/^\d{6}$/) }).strict()), asyncRoute(controller.enableTwoFactor));

module.exports = router;
