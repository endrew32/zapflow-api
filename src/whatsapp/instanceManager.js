const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const { instancesDb } = require('../database/db');
const logger = require('../utils/logger');
const { sleep, typingDelay, formatPhone, parseSpintax } = require('../utils/helpers');

const activeSockets = new Map();
const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');

function sessionPath(id) {
  return path.join(SESSIONS_DIR, id);
}

async function connectInstance(instanceId) {
  const instance = instancesDb.findById(instanceId);
  if (!instance) throw new Error('Instância não encontrada');
  const sessDir = sessionPath(instanceId);
  if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessDir);
  const { version } = await fetchLatestBaileysVersion();
  const baileysLogger = pino({ level: 'silent' });
  const socket = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLogger) },
    printQRInTerminal: false,
    logger: baileysLogger,
    browser: ['Chrome (Linux)', 'Chrome', '121.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });
  activeSockets.set(instanceId, { socket, retries: 0 });

  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      try {
        const qrBase64 = await qrcode.toDataURL(qr);
        instancesDb.update(instanceId, { qr_code: qrBase64, status: 'waiting_qr' });
        logger.info('QR Code gerado para ' + instanceId);
      } catch (err) {
        logger.error('Erro QR: ' + err.message);
      }
    }
    if (connection === 'open') {
      const entry = activeSockets.get(instanceId);
      if (entry) entry.retries = 0;
      instancesDb.update(instanceId, { status: 'connected', qr_code: null, last_seen: new Date().toISOString() });
      logger.info(instanceId + ' conectado!');
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output ? lastDisconnect.error.output.statusCode : 0;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      instancesDb.update(instanceId, { status: 'disconnected' });
      const entry = activeSockets.get(instanceId);
      if (shouldReconnect && entry && entry.retries < 5) {
        entry.retries += 1;
        const delay = Math.min(5000 * entry.retries, 30000);
        await sleep(delay);
        connectInstance(instanceId).catch(function(e) { logger.error('Reconexão falhou: ' + e.message); });
      } else {
        activeSockets.delete(instanceId);
      }
    }
  });

  socket.ev.on('creds.update', saveCreds);
  return socket;
}

async function disconnectInstance(instanceId) {
  const entry = activeSockets.get(instanceId);
  if (entry) {
    try { await entry.socket.logout(); } catch (e) {}
    activeSockets.delete(instanceId);
  }
  const sessDir = sessionPath(instanceId);
  if (fs.existsSync(sessDir)) fs.rmSync(sessDir, { recursive: true, force: true });
}

function getSocket(instanceId) {
  const entry = activeSockets.get(instanceId);
  return entry ? entry.socket : null;
}

async function sendTextMessage(instanceId, to, text) {
  const socket = getSocket(instanceId);
  if (!socket) throw new Error('Instância ' + instanceId + ' não conectada');
  const jid = formatPhone(to);
  const finalText = parseSpintax(text);
  const delay = typingDelay(finalText);
  await socket.sendPresenceUpdate('composing', jid);
  await sleep(delay);
  await socket.sendPresenceUpdate('paused', jid);
  await socket.sendMessage(jid, { text: finalText });
  return finalText;
}

module.exports = { connectInstance, disconnectInstance, getSocket, sendTextMessage };
