const express = require('express');
const cors = require('cors');
const { router: videoRouter } = require('./routes/video');

const app = express();

const allowedOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const requestWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const maxRequestsPerWindow = Number(process.env.RATE_LIMIT_MAX || 40);
const requestBuckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = requestBuckets.get(ip) || { count: 0, resetAt: now + requestWindowMs };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + requestWindowMs;
  }

  bucket.count += 1;
  requestBuckets.set(ip, bucket);

  if (bucket.count > maxRequestsPerWindow) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a minute and try again.'
    });
  }

  res.setHeader('X-RateLimit-Limit', String(maxRequestsPerWindow));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequestsPerWindow - bucket.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(bucket.resetAt / 1000)));

  return next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of requestBuckets.entries()) {
    if (now > bucket.resetAt) {
      requestBuckets.delete(ip);
    }
  }
}, requestWindowMs).unref();

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
  });
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(Object.assign(new Error('CORS origin not allowed'), { status: 403 }));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));

app.use(express.json({ limit: '1mb' }));
app.use(rateLimit);

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'video-downloader-backend' });
});

app.use('/', videoRouter);

app.use((err, req, res, next) => {
  const status = err.status || 500;
  console.error('API error:', err.message);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`Video downloader backend running on port ${port}`);
});

server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS || 120_000);
server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS || 130_000);
