const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.DB_HOST || 'postgresql',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'demodb',
  user: process.env.DB_USER || 'demo',
  password: process.env.DB_PASSWORD || 'demo',
});

app.post('/jobs', async (req, res) => {
  const count = req.body.count || 10;
  const values = [];
  const placeholders = [];

  for (let i = 0; i < count; i++) {
    const payload = JSON.stringify({
      task: `task-${Date.now()}-${i}`,
      data: `sample-payload-${i}`,
    });
    values.push(payload);
    placeholders.push(`($${i + 1}, 'pending')`);
  }

  await pool.query(
    `INSERT INTO jobs (payload, status) VALUES ${placeholders.join(', ')}`,
    values
  );

  console.log(`Inserted ${count} jobs`);
  res.json({ inserted: count });
});

app.get('/jobs/status', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count FROM jobs GROUP BY status ORDER BY status`
  );
  res.json(rows);
});

app.delete('/jobs', async (_, res) => {
  const { rowCount } = await pool.query(`DELETE FROM jobs WHERE status = 'completed'`);
  console.log(`Cleaned up ${rowCount} completed jobs`);
  res.json({ deleted: rowCount });
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Job API listening on port ${PORT}`));
