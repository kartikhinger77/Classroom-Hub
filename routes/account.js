const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const controller = require('../controllers/accountController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const asyncRoute = require('../middleware/asyncRoute');

const router = express.Router();
const email = z.string().email().max(254).transform((value) => value.trim().toLowerCase());
const password = z.string().min(8).max(128).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/);
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } }).single('avatar');

router.use(authenticate);
router.get('/me', asyncRoute(controller.me));
router.patch('/me', validate(z.object({ name: z.string().trim().min(1).max(100).optional(), email: email.optional(), bio: z.string().max(500).optional() }).strict()), asyncRoute(controller.updateMe));
router.post('/avatar', avatarUpload, asyncRoute(controller.uploadAvatar));
router.get('/avatar/:file', asyncRoute(controller.readAvatar));
router.post('/verify-email-change', validate(z.object({ token: z.string().min(20).max(200) }).strict()), asyncRoute(controller.verifyPendingEmail));
router.patch('/password', validate(z.object({ currentPassword: z.string().min(1).max(128), password }).strict()), asyncRoute(controller.changePassword));
router.get('/sessions', asyncRoute(controller.sessions));
router.delete('/sessions/:id', validate(z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict(), 'params'), asyncRoute(controller.revokeSession));
router.post('/logout-all', asyncRoute(controller.logoutAll));
router.get('/export', asyncRoute(controller.exportData));
router.post('/delete', validate(z.object({ password: z.string().min(1).max(128) }).strict()), asyncRoute(controller.requestDeletion));
router.post('/delete/cancel', validate(z.object({ password: z.string().min(1).max(128) }).strict()), asyncRoute(controller.cancelDeletion));

module.exports = router;
