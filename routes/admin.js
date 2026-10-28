const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const asyncRoute = require('../middleware/asyncRoute');

const router = express.Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const email = z.string().email().max(254).transform((value) => value.trim().toLowerCase());
router.use(authenticate, requireRole('admin'));
router.get('/users/export', asyncRoute(controller.exportUsers));
router.get('/users', validate(z.object({ q: z.string().max(80).optional(), role: z.enum(['student', 'teacher', 'admin']).optional(), status: z.enum(['active', 'suspended']).optional(), sort: z.enum(['name', 'email', 'role', 'status', 'lastLoginAt', 'createdAt']).optional(), direction: z.enum(['asc', 'desc']).optional(), page: z.coerce.number().int().min(1).max(100000).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }).strict(), 'query'), asyncRoute(controller.users));
router.post('/users', validate(z.object({ name: z.string().trim().min(1).max(100), email, role: z.enum(['student', 'teacher', 'admin']), password: z.string().min(8).max(128).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).optional() }).strict()), asyncRoute(controller.createUser));
router.patch('/users/:id/status', validate(z.object({ id: objectId }).strict(), 'params'), validate(z.object({ status: z.enum(['active', 'suspended']) }).strict()), asyncRoute(controller.setStatus));
router.post('/users/:id/reset-password', validate(z.object({ id: objectId }).strict(), 'params'), asyncRoute(controller.resetPassword));
router.post('/users/:id/verify-email', validate(z.object({ id: objectId }).strict(), 'params'), asyncRoute(controller.verifyUserEmail));
router.delete('/users/:id', validate(z.object({ id: objectId }).strict(), 'params'), asyncRoute(controller.removeUser));
router.get('/audit', validate(z.object({ page: z.coerce.number().int().min(1).max(100000).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }).strict(), 'query'), asyncRoute(controller.auditList));
router.get('/subjects', asyncRoute(controller.subjects));
router.post('/subjects', validate(z.object({ name: z.string().trim().min(1).max(80) }).strict()), asyncRoute(controller.createSubject));
router.patch('/subjects/:id', validate(z.object({ id: objectId }).strict(), 'params'), validate(z.object({ name: z.string().trim().min(1).max(80), active: z.boolean() }).strict()), asyncRoute(controller.updateSubject));
router.patch('/settings/:key', validate(z.object({ key: z.enum(['announcement', 'studentSignupEnabled']) }).strict(), 'params'), validate(z.object({ value: z.unknown() }).strict()), asyncRoute(controller.saveSetting));
router.get('/dashboard', asyncRoute(controller.dashboard));
router.get('/trash', asyncRoute(controller.trash));

module.exports = router;
