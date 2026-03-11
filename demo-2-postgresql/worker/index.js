const { Pool } = require('pg');

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '2000', 10);
const PROCESSING_TIME_MS = parseInt(process.env.PROCESSING_TIME_MS || '3000', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '5', 10);

const pool = new Pool({
  host: process.env.DB_HOST || 'postgresql',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'demodb',
  user: process.env.DB_USER || 'demo',
  password: process.env.DB_PASSWORD || 'demo',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function processJobs() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `UPDATE jobs SET status = 'processing', started_at = NOW()
       WHERE id IN (
         SELECT id FROM jobs WHERE status = 'pending'
         ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED
       ) RETURNING *`,
      [BATCH_SIZE]
    );

    for (const job of rows) {
      console.log(`Processing job ${job.id}`);
      await sleep(PROCESSING_TIME_MS);
      await client.query(
        `UPDATE jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [job.id]
      );
      console.log(`Completed job ${job.id}`);
    }

    return rows.length;
  } finally {
    client.release();
  }
}

async function start() {
  console.log(`Worker started | poll=${POLL_INTERVAL_MS}ms processing=${PROCESSING_TIME_MS}ms batch=${BATCH_SIZE}`);

  while (true) {
    try {
      const processed = await processJobs();
      if (processed > 0) {
        console.log(`Batch complete: ${processed} jobs processed`);
      }
    } catch (err) {
      console.error('Error processing jobs:', err.message);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function shutdown() {
  console.log('Shutting down worker...');
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch(console.error);
