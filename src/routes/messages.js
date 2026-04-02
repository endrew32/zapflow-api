const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { instancesDb, bulkDb } = require('../database/db');
const { enqueue, enqueueBulk, selectBestInstance, queueSize } = require('../whatsapp/messageQueue');
const logger = require('../utils/logger');

router.post('/send', async (req, res) => {
  try {
    const { to, message } = req.body;
    let { instance_id } = req.body;
    if (!to || !message) return res.status(400).json({ error: 'Campos "to" e "message" são obrigatórios' });
    if (!instance_id) {
      const best = selectBestInstance();
      if (!best) return res.status(503).json({ error: 'Nenhuma instância disponível.' });
      instance_id = best.id;
    } else {
      const inst = instancesDb.findById(instance_id);
      if (!inst) return res.status(404).json({ error: 'Instância não encontrada' });
      if (inst.status !== 'connected') return res.status(409).json({ error: `Instância não conectada` });
    }
    const result = await enqueue(instance_id, to, message);
    res.json({ success: true, instance_id, to, queue_position: queueSize(), ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  try {
    const { recipients, message, job_name } = req.body;
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: '"recipients" deve ser um array não vazio' });
    if (!message) return res.status(400).json({ error: '"message" é obrigatório' });
    const jobId = uuidv4();
    bulkDb.create({ id: jobId, name: job_name || `Bulk ${new Date().toLocaleString('pt-BR')}`, total: recipients.length, status: 'running' });
    res.status(202).json({ message: 'Job iniciado', job_id: jobId, total: recipients.length });
    enqueueBulk(recipients, message, jobId).then((results) => {
      bulkDb.update(jobId, { sent: results.sent, failed: results.failed, status: 'finished', finished_at: new Date().toISOString() });
    }).catch((err) => bulkDb.update(jobId, { status: 'error' }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/queue', (_req, res) => res.json({ queue_size: queueSize() }));

router.get('/bulk', (_req, res) => {
  try {
    res.json({ total: bulkDb.findAll().length, jobs: bulkDb.findAll() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
