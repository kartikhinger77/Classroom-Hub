const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/postsController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { uploadPdf } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validate');
const asyncRoute = require('../middleware/asyncRoute');
const { fail } = require('../utils/response');

const router = express.Router();
router.use(authenticate);
router.param('id', (req, res, next, id) => /^[a-f\d]{24}$/i.test(id) ? next() : fail(res, 400, 'INVALID_INPUT', 'The post id is invalid.'));
router.param('versionId', (req, res, next, id) => /^[a-f\d]{24}$/i.test(id) ? next() : fail(res, 400, 'INVALID_INPUT', 'The version id is invalid.'));
router.get('/', validateQueryPosts(), asyncRoute(controller.list));
router.get('/trash', requireRole('admin'), validateQueryPage(), asyncRoute(controller.trashList));
router.get('/notifications', asyncRoute(controller.notifications));
router.patch('/notifications/:id/read', asyncRoute(controller.markNotificationRead));
router.post('/', requireRole('teacher', 'admin'), uploadLimiter, uploadPdf, validate(createPostSchema()), asyncRoute(controller.create));
router.get('/:id/file', validateQueryDownload(), asyncRoute(controller.file));
router.get('/:id/history', asyncRoute(controller.history));
router.post('/:id/restore-version/:versionId', asyncRoute(controller.restoreVersion));
router.put('/:id/bookmark', asyncRoute(controller.bookmark));
router.delete('/:id/bookmark', asyncRoute(controller.unbookmark));
router.get('/:id', asyncRoute(controller.get));
router.patch('/:id', requireRole('teacher', 'admin'), uploadLimiter, uploadPdf, validate(updatePostSchema(), 'body'), requireUpdateContent, asyncRoute(controller.update));
router.delete('/:id', requireRole('teacher', 'admin'), asyncRoute(controller.trash));
router.post('/:id/restore', requireRole('admin'), asyncRoute(controller.restore));
router.delete('/:id/permanent', requireRole('admin'), asyncRoute(controller.permanentlyDelete));

module.exports = router;

function validateQueryPosts() {
  return require('../middleware/validate').validate(z.object({
    type: z.enum(['note', 'exercise']).optional(), subject: z.string().max(80).optional(), q: z.string().max(80).optional(),
    from: z.string().max(40).optional(), to: z.string().max(40).optional(),
    page: z.coerce.number().int().min(1).max(100000).optional(), limit: z.coerce.number().int().min(1).max(50).optional(),
    saved: z.enum(['true', 'false']).optional()
  }).strict(), 'query');
}

function validateQueryPage() {
  return require('../middleware/validate').validate(z.object({
    page: z.coerce.number().int().min(1).max(100000).optional(), limit: z.coerce.number().int().min(1).max(50).optional()
  }).strict(), 'query');
}

function validateQueryDownload() {
  return require('../middleware/validate').validate(z.object({ download: z.enum(['0', '1']).optional() }).strict(), 'query');
}

function createPostSchema() {
  return z.object({
    type: z.enum(['note', 'exercise']),
    title: z.string().trim().min(1).max(180),
    subject: z.string().trim().min(1).max(80),
    contentHtml: z.string().max(200000).optional()
  }).strict();
}

function updatePostSchema() {
  return z.object({
    title: z.string().trim().min(1).max(180).optional(),
    subject: z.string().trim().min(1).max(80).optional(),
    contentHtml: z.string().max(200000).optional()
  }).strict();
}

function requireUpdateContent(req, res, next) {
  if (req.file || Object.keys(req.body || {}).length) return next();
  return fail(res, 400, 'INVALID_INPUT', 'Provide at least one post change or a replacement PDF.');
}
