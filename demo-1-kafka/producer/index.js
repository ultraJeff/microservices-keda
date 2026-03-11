const express = require('express');
const { Kafka } = require('kafkajs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'my-cluster-kafka-bootstrap:9092').split(',');
const TOPIC = process.env.KAFKA_TOPIC || 'orders';

const kafka = new Kafka({ clientId: 'order-producer', brokers: KAFKA_BROKERS });
const producer = kafka.producer();

function generateMessages(count) {
  return Array.from({ length: count }, (_, i) => ({
    key: `order-${Date.now()}-${i}`,
    value: JSON.stringify({
      orderId: `${Date.now()}-${i}`,
      item: `item-${Math.floor(Math.random() * 100)}`,
      quantity: Math.floor(Math.random() * 10) + 1,
      timestamp: new Date().toISOString(),
    }),
  }));
}

app.post('/produce', async (req, res) => {
  const count = req.body.count || 100;
  const messages = generateMessages(count);
  await producer.send({ topic: TOPIC, messages });
  console.log(`Produced ${count} messages to ${TOPIC}`);
  res.json({ produced: count, topic: TOPIC });
});

app.get('/burst/:count', async (req, res) => {
  const count = parseInt(req.params.count, 10) || 100;
  const messages = generateMessages(count);
  await producer.send({ topic: TOPIC, messages });
  console.log(`Burst: produced ${count} messages to ${TOPIC}`);
  res.json({ produced: count, topic: TOPIC });
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

async function start() {
  await producer.connect();
  console.log('Producer connected to Kafka');
  app.listen(PORT, () => console.log(`Producer API listening on port ${PORT}`));
}

start().catch(console.error);
