const AuditLog = require('../models/AuditLog');

async function record(req, action, targetType = '', targetId = '', meta = {}) {
  const scrub = (value) => {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== 'object') return value;
    const clean = {};
    for (const [key, child] of Object.entries(value)) if (!/password|token|secret|email|cookie/i.test(key)) clean[key] = scrub(child);
    return clean;
  };
  await AuditLog.create({
    actor: req.user?._id || null,
    actorLabel: req.user?.name || 'system',
    action,
    targetType,
    targetId: String(targetId || ''),
    ip: String(req.ip || '').slice(0, 64),
    meta: scrub(meta)
  });
}

module.exports = { record };
