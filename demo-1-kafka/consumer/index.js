const { Kafka } = require('kafkajs');

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'my-cluster-kafka-bootstrap:9092').split(',');
const TOPIC = process.env.KAFKA_TOPIC || 'orders';
const GROUP_ID = process.env.KAFKA_GROUP_ID || 'order-processors';
const PROCESSING_TIME_MS = parseInt(process.env.PROCESSING_TIME_MS || '500', 10);

const kafka = new Kafka({ clientId: 'order-consumer', brokers: KAFKA_BROKERS });
const consumer = kafka.consumer({ groupId: GROUP_ID });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let messageCount = 0;

async function start() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  console.log(`Consumer started | group=${GROUP_ID} topic=${TOPIC} delay=${PROCESSING_TIME_MS}ms`);

  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      const order = JSON.parse(message.value.toString());
      messageCount++;
      console.log(`[${messageCount}] Processing order ${order.orderId} (partition ${partition})`);
      await sleep(PROCESSING_TIME_MS);
      console.log(`[${messageCount}] Completed order ${order.orderId}`);
    },
  });
}

async function shutdown() {
  console.log('Shutting down consumer...');
  await consumer.disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch(console.error);
