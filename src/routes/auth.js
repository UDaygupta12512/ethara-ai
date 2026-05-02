const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, query, validationResult } = require('express-validator');
const db = require('../models/database');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const AVATAR_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#8b5cf6','#ef4444','#06b6d4',
  '#14b8a6','#f97316','#84cc16','#a855f7',
];

// Validation helpers
const nameRules  = body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters');
const emailRules = body('email').isEmail().normalizeEmail().withMessage('Valid email address required');
const passRules  = body('password').isLength({ min: 6, max: 128 }).withMessage('Password must be 6–128 characters');

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
    return false;
  }
  return true;
}

// Signup route
router.post('/signup', [nameRules, emailRules, passRules], (req, res) => {
  if (!validate(req, res)) return;

  const { name, email, password } = req.body;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const hash  = bcrypt.hashSync(password, 12);
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  let result;
  try {
    result = db.prepare(
      'INSERT INTO users (name, email, password, avatar_color) VALUES (?, ?, ?, ?)'
    ).run(name, email, hash, color);
  } catch (err) {
    return res.status(500).json({ error: 'Could not create account. Please try again.' });
  }

  const user  = db.prepare('SELECT id, name, email, avatar_color, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  
  // Human Touch: Create a 'Welcome' project so the app isn't empty
  try {
    const proj = db.prepare(
      'INSERT INTO projects (name, description, color, owner_id) VALUES (?, ?, ?, ?)'
    ).run('🚀 Getting Started', 'Welcome to Ethara AI! Use this project to explore how tasks and status tracking works.', '#e87c3a', user.id);
    
    const pid = proj.lastInsertRowid;
    db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)')
      .run(pid, user.id, 'admin');

    const welcomeTasks = [
      { title: 'Explore the Dashboard', status: 'done', priority: 'medium' },
      { title: 'Create your first project', status: 'in_progress', priority: 'high' },
      { title: 'Invite a team member', status: 'todo', priority: 'low' }
    ];

    for (const t of welcomeTasks) {
      db.prepare('INSERT INTO tasks (title, status, priority, project_id, creator_id, assignee_id) VALUES (?,?,?,?,?,?)')
        .run(t.title, t.status, t.priority, pid, user.id, user.id);
    }
  } catch (seedErr) {
    // Silent fail for seeding, don't break signup
    console.error('Seed error:', seedErr);
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user });
});

// Login route
router.post('/login', [emailRules, passRules], (req, res) => {
  if (!validate(req, res)) return;

  const { email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    bcrypt.compareSync('dummy', '$2a$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXXXX');
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const { password: _, ...safeUser } = user;
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

  res.json({ token, user: safeUser });
});

// Get current user
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Update profile
router.patch('/me', authenticate, [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters'),
  body('avatar_color').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Invalid color format'),
], (req, res) => {
  if (!validate(req, res)) return;
  const { name, avatar_color } = req.body;
  db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      avatar_color = COALESCE(?, avatar_color),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name || null, avatar_color || null, req.user.id);

  const updated = db.prepare('SELECT id, name, email, avatar_color, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: updated });
});

// Change password
router.post('/change-password', authenticate, [
  body('current_password').notEmpty().withMessage('Current password required'),
  body('new_password').isLength({ min: 6, max: 128 }).withMessage('New password must be 6–128 characters'),
], (req, res) => {
  if (!validate(req, res)) return;
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);

  if (!bcrypt.compareSync(current_password, user.password)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Password changed successfully' });
});

// Search users
router.get('/users/search', authenticate, [
  query('q').trim().isLength({ min: 2, max: 100 }).withMessage('Query must be 2–100 characters'),
], (req, res) => {
  if (!validate(req, res)) return;
  const { q } = req.query;
  const users = db.prepare(
    "SELECT id, name, email, avatar_color FROM users WHERE (name LIKE ? OR email LIKE ?) AND id != ? LIMIT 10"
  ).all(`%${q}%`, `%${q}%`, req.user.id);
  res.json(users);
});

module.exports = router;
