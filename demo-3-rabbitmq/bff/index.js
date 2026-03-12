const express = require('express');
const amqp = require('amqplib');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const QUEUE_NAME = process.env.QUEUE_NAME || 'notifications';

let channel = null;
const recentNotifications = [];
const MAX_RECENT = 30;

async function connectRabbitMQ() {
  const conn = await amqp.connect(RABBITMQ_URL);
  channel = await conn.createChannel();
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  console.log(`BFF connected to RabbitMQ, queue "${QUEUE_NAME}" ready`);
}

app.post('/api/notify', async (req, res) => {
  const count = req.body.count || 20;
  const type = req.body.type || 'email';
  const sent = [];

  for (let i = 0; i < count; i++) {
    const notification = {
      id: `${Date.now()}-${i}`,
      type,
      recipient: `user-${Math.floor(Math.random() * 500)}@example.com`,
      subject: `Notification #${i + 1}`,
      timestamp: new Date().toISOString(),
    };
    channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(notification)), { persistent: true });
    sent.push(notification);
    recentNotifications.unshift({ ...notification, status: 'queued' });
  }

  if (recentNotifications.length > MAX_RECENT) recentNotifications.length = MAX_RECENT;
  console.log(`Queued ${count} ${type} notifications`);
  res.json({ queued: count, type });
});

app.get('/api/queue-stats', async (_req, res) => {
  try {
    const q = await channel.checkQueue(QUEUE_NAME);
    res.json({
      queue: QUEUE_NAME,
      messages: q.messageCount,
      consumers: q.consumerCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recent', (_req, res) => {
  res.json(recentNotifications);
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

async function start() {
  await connectRabbitMQ();
  app.listen(PORT, () => console.log(`Notification BFF listening on port ${PORT}`));
}

start().catch(console.error);
