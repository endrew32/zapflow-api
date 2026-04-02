const { instancesDb, logsDb } = require('../database/db');
const { sendTextMessage } = require('./instanceManager');
const { sleep, getIntervalByPhase, advanceWarmup } = require('../utils/helpers');
const logger = require('../utils/logger');

let queue = [];
let isProcessing = false;
let consecutiveErrors = 0;
const MAX_ERRORS = 10;

function enqueue(instanceId, to, message) {
  return new Promise((resolve, reject) => {
    queue.push({ instanceId, to, message, resolve, reject });
    if (!isProcessing) processQueue();
  });
}

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  while (queue.length > 0) {
    if (consecutiveErrors >= MAX_ERRORS) {
      logger.error('[Queue] Muitos erros. Pausando 10min.');
      await sleep(600000);
      consecutiveErrors = 0;
    }
    const { instanceId, to, message, resolve, reject } = queue.shift();
    const instance = instancesDb.findById(instanceId);
    if (!instance || instance.status !== 'connected') {
      reject(new Error(`Instância ${instanceId} não conectada`));
      consecutiveErrors++;
      continue;
    }
    if (instance.sent_today >= instance.daily_limit) {
      reject(new Error('Limite diário atingido'));
      continue;
    }
    const logId = logsDb.insert({ instance_id: instanceId, recipient: to, message, status: 'pending' });
    try {
      const sentText = await sendTextMessage(instanceId, to, message);
      logsDb.updateStatus(logId, 'sent');
      instancesDb.update(instanceId, { sent_today: instance.sent_today + 1, last_seen: new Date().toISOString() });
      consecutiveErrors = 0;
      logger.info(`[Queue] ✅ Enviado para ${to}`);
      resolve({ success: true, logId, sentText });
    } catch (err) {
      logsDb.updateStatus(logId, 'failed', err.message);
      consecutiveErrors++;
      logger.error(`[Queue] ❌ Falha: ${err.message}`);
      reject(err);
    }
    if (queue.length > 0) {
      const interval = getIntervalByPhase(instance.warmup_phase);
      await sleep(interval);
    }
  }
  isProcessing = false;
}

function selectBestInstance() {
  const instances = instancesDb.findAll().filter(i => i.status === 'connected' && i.sent_today < i.daily_limit);
  if (instances.length === 0) return null;
  return instances.sort((a, b) => a.sent_today - b.sent_today)[0];
}

async function enqueueBulk(recipients, message) {
  const results = { sent: 0, failed: 0 };
  for (const to of recipients) {
    const instance = selectBestInstance();
    if (!instance) { results.failed++; continue; }
    try { await enqueue(instance.id, to, message); results.sent++; } catch { results.failed++; }
  }
  return results;
}

function queueSize() { return queue.length; }

function dailyReset() {
  const instances = instancesDb.findAll();
  for (const inst of instances) {
    const warmup = advanceWarmup(inst);
    instancesDb.update(inst.id, { sent_today: 0, ...warmup });
  }
  logger.info('[Reset] Contadores diários resetados');
}

function scheduleDailyReset() {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  setTimeout(() => {
    dailyReset();
    setInterval(dailyReset, 86400000);
  }, midnight - new Date());
}

module.exports = { enqueue, enqueueBulk, selectBestInstance, queueSize, dailyReset, scheduleDailyReset };
