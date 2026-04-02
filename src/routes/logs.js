const express = require('express');
const router = express.Router();
const { logsDb } = require('../database/db');

router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const logs = logsDb.findAll(limit);
    const summary = {
      total: logs.length,
      sent: logs.filter((l) => l.status === 'sent').length,
      failed: logs.filter((l) => l.status === 'failed').length,
      pending: logs.filter((l) => l.status === 'pending').length,
    };
    res.json({ summary, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
