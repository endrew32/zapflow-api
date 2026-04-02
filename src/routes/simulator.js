const express = require('express');
const router = express.Router();

router.post('/', (req, res) => {
  const { messages_per_day, level = 'moderate' } = req.body;
  if (!messages_per_day || messages_per_day < 1) return res.status(400).json({ error: '"messages_per_day" deve ser positivo' });
  const limits = {
    conservative: { initial: 10, intermediate: 25, stable: 50 },
    moderate: { initial: 15, intermediate: 40, stable: 80 },
    aggressive: { initial: 20, intermediate: 60, stable: 120 }
  };
  const l = limits[level] || limits.moderate;
  const risk = { conservative: 'low', moderate: 'medium', aggressive: 'high' }[level];
  const stable = Math.ceil(messages_per_day / l.stable);
  res.json({
    input: { messages_per_day, level },
    recommendation: { numbers_needed: stable, messages_per_number: l.stable, avg_interval_minutes: 2, risk, total_messages: messages_per_day },
    phases: [
      { name: 'Inicial', days: '7 dias', range: `${l.initial} msgs/dia` },
      { name: 'Intermediário', days: '14 dias', range: `${l.intermediate} msgs/dia` },
      { name: 'Estável', days: 'indefinido', range: `${l.stable} msgs/dia` },
    ],
  });
});

module.exports = router;
