const express = require('express');
const path = require('path');
const { Kafka } = require('kafkajs');
const { Pool } = require('pg');
const k8s = require('@kubernetes/client-node');

const app = express();
const PORT = process.env.PORT || 3000;

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'my-cluster-kafka-bootstrap:9092').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'orders';
const KAFKA_GROUP = process.env.KAFKA_GROUP || 'order-processors';
const NAMESPACE = process.env.NAMESPACE || 'keda-demo';
const PRODUCER_URL = process.env.PRODUCER_URL || 'http://kafka-producer:3000';
const JOB_API_URL = process.env.JOB_API_URL || 'http://job-api:3000';
const NOTIFICATION_BFF_URL = process.env.NOTIFICATION_BFF_URL || 'http://notification-bff:3000';
const NOTIFICATION_MFE_URL = process.env.NOTIFICATION_MFE_URL || '';

const kafka = new Kafka({ clientId: 'dashboard', brokers: KAFKA_BROKERS });
const admin = kafka.admin();
const monitor = kafka.consumer({ groupId: 'dashboard-monitor' });

const RECENT_ORDERS_MAX = 20;
const ORDER_TTL_MS = 30_000;
const recentOrders = [];

const pool = new Pool({
  host: process.env.DB_HOST || 'postgresql',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'demodb',
  user: process.env.DB_USER || 'demo',
  password: process.env.DB_PASSWORD || 'demo',
});

const kc = new k8s.KubeConfig();
kc.loadFromCluster();
const coreApi = kc.makeApiClient(k8s.CoreV1Api);
const appsApi = kc.makeApiClient(k8s.AppsV1Api);

app.use(express.static(path.join(__dirname, 'public')));

async function getKafkaLag() {
  try {
    const offsets = await admin.fetchTopicOffsets(KAFKA_TOPIC);
    const groupOffsets = await admin.fetchOffsets({ groupId: KAFKA_GROUP, topics: [KAFKA_TOPIC] });
    const partitionLags = offsets.map((p) => {
      const committed = groupOffsets[0]?.partitions.find((gp) => gp.partition === p.partition);
      const committedOffset = committed && committed.offset !== '-1' ? parseInt(committed.offset, 10) : parseInt(p.offset, 10);
      return Math.max(0, parseInt(p.offset, 10) - committedOffset);
    });
    return { total: partitionLags.reduce((a, b) => a + b, 0), perPartition: partitionLags };
  } catch {
    return { total: 0, perPartition: [] };
  }
}

async function getPodCount(labelSelector) {
  try {
    const res = await coreApi.listNamespacedPod({ namespace: NAMESPACE, labelSelector });
    return res.items.filter((p) => p.status.phase === 'Running' && p.metadata.deletionTimestamp == null).length;
  } catch {
    return 0;
  }
}

async function getJobStatus() {
  try {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM jobs GROUP BY status ORDER BY status`
    );
    const result = { pending: 0, processing: 0, completed: 0 };
    for (const r of rows) result[r.status] = r.count;
    return result;
  } catch {
    return { pending: 0, processing: 0, completed: 0 };
  }
}

async function getRecentJobs() {
  try {
    const { rows } = await pool.query(
      `SELECT id, payload->>'type' AS type, status, created_at, started_at, completed_at
       FROM jobs ORDER BY id DESC LIMIT 20`
    );
    return rows;
  } catch {
    return [];
  }
}

async function getRabbitMQStats() {
  try {
    const resp = await fetch(`${NOTIFICATION_BFF_URL}/api/queue-stats`);
    const data = await resp.json();
    return { messages: data.messages || 0, consumers: data.consumers || 0 };
  } catch {
    return { messages: 0, consumers: 0 };
  }
}

app.get('/api/config', (_req, res) => {
  res.json({ notificationMfeUrl: NOTIFICATION_MFE_URL });
});

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n');

  const send = async () => {
    try {
      const [lag, consumerPods, workerPods, jobs, recentJobs, rmqStats, notifPods] = await Promise.all([
        getKafkaLag(),
        getPodCount('app=kafka-consumer'),
        getPodCount('app=job-worker'),
        getJobStatus(),
        getRecentJobs(),
        getRabbitMQStats(),
        getPodCount('app=notification-worker'),
      ]);
      const data = {
        demo1: {
          pods: consumerPods, maxPods: 10, lag,
          recentOrders: recentOrders
            .filter((o) => Date.now() - o.receivedAt < ORDER_TTL_MS)
            .map(({ receivedAt, ...o }) => ({ ...o, age: Date.now() - receivedAt })),
        },
        demo2: { pods: workerPods, maxPods: 5, jobs, recentJobs },
        demo3: { pods: notifPods, maxPods: 8, queue: rmqStats },
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      /* keep stream alive */
    }
  };

  send();
  const interval = setInterval(send, 2000);

  req.on('close', () => clearInterval(interval));
});

app.post('/api/demo1/burst', async (_req, res) => {
  try {
    const resp = await fetch(`${PRODUCER_URL}/burst/500`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/demo2/jobs', async (_req, res) => {
  try {
    const resp = await fetch(`${JOB_API_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 50 }),
    });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/demo2/cleanup', async (_req, res) => {
  try {
    const resp = await fetch(`${JOB_API_URL}/jobs`, { method: 'DELETE' });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/demo3/notify', async (_req, res) => {
  try {
    const resp = await fetch(`${NOTIFICATION_BFF_URL}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 30, type: 'email' }),
    });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

async function start() {
  await admin.connect();
  console.log('Dashboard connected to Kafka admin');

  await monitor.connect();
  await monitor.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });
  await monitor.run({
    eachMessage: async ({ message }) => {
      try {
        const order = JSON.parse(message.value.toString());
        recentOrders.unshift({
          orderId: order.orderId,
          item: order.item,
          quantity: order.quantity,
          timestamp: order.timestamp,
          receivedAt: Date.now(),
        });
        if (recentOrders.length > RECENT_ORDERS_MAX) recentOrders.length = RECENT_ORDERS_MAX;
      } catch { /* skip malformed messages */ }
    },
  });
  console.log('Dashboard monitor consumer started');

  app.listen(PORT, () => console.log(`Dashboard listening on port ${PORT}`));
}

start().catch(console.error);
