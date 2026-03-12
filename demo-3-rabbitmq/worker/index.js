const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const QUEUE_NAME = process.env.QUEUE_NAME || 'notifications';
const PROCESSING_TIME_MS = parseInt(process.env.PROCESSING_TIME_MS || '2000', 10);
const PREFETCH = parseInt(process.env.PREFETCH || '3', 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let messageCount = 0;

async function start() {
  const conn = await amqp.connect(RABBITMQ_URL);
  const channel = await conn.createChannel();
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  channel.prefetch(PREFETCH);

  console.log(`Worker started | queue=${QUEUE_NAME} prefetch=${PREFETCH} delay=${PROCESSING_TIME_MS}ms`);

  channel.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return;
    const notification = JSON.parse(msg.content.toString());
    messageCount++;
    console.log(`[${messageCount}] Sending ${notification.type} to ${notification.recipient}`);
    await sleep(PROCESSING_TIME_MS);
    channel.ack(msg);
    console.log(`[${messageCount}] Delivered ${notification.type} to ${notification.recipient}`);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down worker...');
    await channel.close();
    await conn.close();
    process.exit(0);
  });
}

start().catch(console.error);
