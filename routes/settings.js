const express = require('express');
const { publicSettings } = require('../controllers/adminController');
const asyncRoute = require('../middleware/asyncRoute');
const router = express.Router();
router.get('/public', asyncRoute(publicSettings));
module.exports = router;
