const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BFF_URL = process.env.BFF_URL || 'http://notification-bff:3000';

app.use(express.static(path.join(__dirname, 'public')));

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
      const [statsRes, recentRes] = await Promise.all([
        fetch(`${BFF_URL}/api/queue-stats`),
        fetch(`${BFF_URL}/api/recent`),
      ]);
      const stats = await statsRes.json();
      const recent = await recentRes.json();
      res.write(`data: ${JSON.stringify({ stats, recent })}\n\n`);
    } catch { /* keep alive */ }
  };

  send();
  const interval = setInterval(send, 2000);
  req.on('close', () => clearInterval(interval));
});

app.post('/api/send', async (req, res) => {
  try {
    const resp = await fetch(`${BFF_URL}/api/notify`, {
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

app.listen(PORT, () => console.log(`Notification MFE listening on port ${PORT}`));
