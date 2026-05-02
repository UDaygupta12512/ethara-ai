require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('-------------------------------------------------------------------');
  console.warn('[WARNING] JWT_SECRET is not set. Using a temporary fallback.');
  console.warn('This is INSECURE for production. Please set JWT_SECRET in Railway.');
  console.warn('-------------------------------------------------------------------');
  process.env.JWT_SECRET = 'temporary-fallback-secret-please-change';
}

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const authLimiter   = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please try again in 15 minutes.' }
});

app.use('/api/', globalLimiter);
app.use('/api/auth/login',  authLimiter);
app.use('/api/auth/signup', authLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ 
  status: 'ok', 
  timestamp: new Date().toISOString(),
  env: process.env.NODE_ENV || 'development'
}));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/projects/:projectId/tasks', require('./routes/tasks'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.use('/api/*', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));

app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Ethara running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

module.exports = app;