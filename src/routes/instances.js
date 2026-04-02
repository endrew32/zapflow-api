const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { instancesDb } = require('../database/db');
const { connectInstance, disconnectInstance } = require('../whatsapp/instanceManager');
const { scheduleDailyReset } = require('../whatsapp/messageQueue');
const logger = require('../utils/logger');

scheduleDailyReset();

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Campo "name" obrigatório' });
    const id = uuidv4();
    const instance = instancesDb.create({ id, name, status: 'connecting', daily_limit: 5, warmup_phase: 'initial' });
    connectInstance(id).catch((err) => logger.error(`[${id}] Erro ao conectar: ${err.message}`));
    res.status(201).json({ message: 'Instância criada. Aguarde o QR Code.', instance, qrcode_url: `/instances/${id}/qrcode` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', (_req, res) => {
  try {
    const instances = instancesDb.findAll().map((i) => ({ ...i, qr_code: i.qr_code ? '[disponível em /qrcode]' : null }));
    res.json({ total: instances.length, instances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/qrcode', (req, res) => {
  try {
    const instance = instancesDb.findById(req.params.id);
    if (!instance) return res.status(404).json({ error: 'Instância não encontrada' });
    if (instance.status === 'connected') return res.json({ message: 'Já conectada', status: 'connected' });
    if (!instance.qr_code) return res.json({ message: 'QR Code ainda não disponível. Tente em alguns segundos.', status: instance.status });
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.send(`<!DOCTYPE html><html><head><title>QR - ${instance.name}</title><meta http-equiv="refresh" content="15"><style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#f0f0f0}img{border:4px solid #25D366;border-radius:12px;padding:12px;background:#fff}h2{color:#128C7E}</style></head><body><h2>📱 ${instance.name}</h2><img src="${instance.qr_code}" width="300" height="300"/><p>Escaneie com WhatsApp • Atualiza a cada 15s</p><p>Status: <strong>${instance.status}</strong></p></body></html>`);
    }
    res.json({ qr_code: instance.qr_code, status: instance.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/status', (req, res) => {
  try {
    const instance = instancesDb.findById(req.params.id);
    if (!instance) return res.status(404).json({ error: 'Instância não encontrada' });
    res.json({ id: instance.id, name: instance.name, status: instance.status, sent_today: instance.sent_today, daily_limit: instance.daily_limit, warmup_phase: instance.warmup_phase, warmup_day: instance.warmup_day, last_seen: instance.last_seen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const instance = instancesDb.findById(req.params.id);
    if (!instance) return res.status(404).json({ error: 'Instância não encontrada' });
    await disconnectInstance(req.params.id);
    instancesDb.delete(req.params.id);
    res.json({ message: `Instância "${instance.name}" removida` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
