require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Security configs
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// Rate limits
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const authLimiter   = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please try again in 15 minutes.' }
});

app.use('/api/', globalLimiter);
app.use('/api/auth/login',  authLimiter);
app.use('/api/auth/signup', authLimiter);

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/projects/:projectId/tasks', require('./routes/tasks'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 for API routes
app.use('/api/*', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));

// Static files & SPA routing
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Ethara AI running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
