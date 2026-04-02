const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./src/database/db');
const instanceRoutes = require('./src/routes/instances');
const messageRoutes = require('./src/routes/messages');
const logRoutes = require('./src/routes/logs');
const simulatorRoutes = require('./src/routes/simulator');
const logger = require('./src/utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

app.use('/instances', instanceRoutes);
app.use('/messages', messageRoutes);
app.use('/logs', logRoutes);
app.use('/simulator', simulatorRoutes);

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'WhatsApp Automation API', version: '1.0.0' });
});

app.use((err, _req, res, _next) => {
  logger.error(err);
  res.status(500).json({ error: 'Erro interno', detail: err.message });
});

async function bootstrap() {
  initDatabase();
  app.listen(PORT, () => {
    logger.info(`Servidor rodando na porta ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Falha ao iniciar:', err);
  process.exit(1);
});
