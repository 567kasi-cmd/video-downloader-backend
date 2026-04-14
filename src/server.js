const express = require('express');
const cors = require('cors');
const { router: videoRouter } = require('./routes/video');
const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));
app.use(express.json({ limit: '1mb' }));
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'video-downloader-backend' });
});
app.use('/', videoRouter);
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Video downloader backend running on port ${port}`);
});
