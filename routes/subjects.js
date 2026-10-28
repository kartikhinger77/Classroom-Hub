const express = require('express');
const Subject = require('../models/Subject');
const { authenticate } = require('../middleware/auth');
const { ok } = require('../utils/response');
const asyncRoute = require('../middleware/asyncRoute');

const router = express.Router();
router.get('/', authenticate, asyncRoute(async (_req, res) => ok(res, await Subject.find({ active: true }).select('name').sort({ name: 1 }).lean())));
module.exports = router;
