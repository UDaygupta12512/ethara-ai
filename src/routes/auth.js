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
const emailRules = body('email').isEmail().trim().toLowerCase().withMessage('Valid email address required');
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
  
  // Seed rich starter data so the dashboard always looks alive
  try {
    const today = new Date();
    const dt = (offsetDays) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offsetDays);
      return d.toISOString().slice(0, 10);
    };

    // Project 1 — an ongoing website redesign
    const p1 = db.prepare(
      'INSERT INTO projects (name, description, color, owner_id) VALUES (?,?,?,?)'
    ).run('Website Redesign', 'Full overhaul of the marketing site. Mobile-first, faster load times, new brand.', '#e87c3a', user.id);
    const pid1 = p1.lastInsertRowid;
    db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?,?,?)').run(pid1, user.id, 'admin');

    const webTasks = [
      { title: 'Audit current site for performance issues', status: 'done',        priority: 'high',   due: dt(-8)  },
      { title: 'Design new homepage mockups in Figma',      status: 'done',        priority: 'high',   due: dt(-4)  },
      { title: 'Migrate blog to new CMS',                   status: 'in_progress', priority: 'medium', due: dt(5)   },
      { title: 'Write copy for the Services page',          status: 'in_progress', priority: 'medium', due: dt(3)   },
      { title: 'Set up staging environment',                status: 'review',      priority: 'urgent', due: dt(2)   },
      { title: 'Fix broken links in footer',                status: 'todo',        priority: 'medium', due: dt(-2)  },
      { title: 'Final QA pass before go-live',              status: 'todo',        priority: 'urgent', due: dt(10)  },
    ];
    for (const t of webTasks) {
      db.prepare('INSERT INTO tasks (title, status, priority, project_id, creator_id, assignee_id, due_date) VALUES (?,?,?,?,?,?,?)')
        .run(t.title, t.status, t.priority, pid1, user.id, user.id, t.due);
    }

    // Project 2 — a feature sprint
    const p2 = db.prepare(
      'INSERT INTO projects (name, description, color, owner_id) VALUES (?,?,?,?)'
    ).run('Q3 Feature Sprint', 'Ship offline mode, push notifications, and a redesigned home screen before end of quarter.', '#6366f1', user.id);
    const pid2 = p2.lastInsertRowid;
    db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?,?,?)').run(pid2, user.id, 'admin');

    const sprintTasks = [
      { title: 'Offline data sync — design spec',       status: 'done',        priority: 'urgent', due: dt(-10) },
      { title: 'Implement offline SQLite layer',         status: 'done',        priority: 'high',   due: dt(-6)  },
      { title: 'Push notification service (FCM/APNs)',   status: 'in_progress', priority: 'high',   due: dt(4)   },
      { title: 'Redesign home screen layout',            status: 'in_progress', priority: 'medium', due: dt(6)   },
      { title: 'Write unit tests for sync logic',        status: 'todo',        priority: 'high',   due: dt(7)   },
      { title: 'Fix crash on low-memory devices',        status: 'todo',        priority: 'urgent', due: dt(-3)  },
      { title: 'App store listing and screenshots',      status: 'todo',        priority: 'medium', due: dt(14)  },
    ];
    for (const t of sprintTasks) {
      db.prepare('INSERT INTO tasks (title, status, priority, project_id, creator_id, assignee_id, due_date) VALUES (?,?,?,?,?,?,?)')
        .run(t.title, t.status, t.priority, pid2, user.id, user.id, t.due);
    }

    // Project 3 — a marketing campaign
    const p3 = db.prepare(
      'INSERT INTO projects (name, description, color, owner_id) VALUES (?,?,?,?)'
    ).run('Launch Campaign', 'Product Hunt launch + LinkedIn series + email drip targeting SMBs.', '#10b981', user.id);
    const pid3 = p3.lastInsertRowid;
    db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?,?,?)').run(pid3, user.id, 'admin');

    const mktTasks = [
      { title: 'Write 5-part LinkedIn content series',        status: 'done',        priority: 'medium', due: dt(-5) },
      { title: 'Design Product Hunt banner and gallery',      status: 'in_progress', priority: 'high',   due: dt(2)  },
      { title: 'Set up email drip campaign in Mailchimp',     status: 'in_progress', priority: 'high',   due: dt(5)  },
      { title: 'Update website with campaign landing page',   status: 'todo',        priority: 'urgent', due: dt(-1) },
      { title: 'Schedule launch day social posts',            status: 'todo',        priority: 'medium', due: dt(9)  },
    ];
    for (const t of mktTasks) {
      db.prepare('INSERT INTO tasks (title, status, priority, project_id, creator_id, assignee_id, due_date) VALUES (?,?,?,?,?,?,?)')
        .run(t.title, t.status, t.priority, pid3, user.id, user.id, t.due);
    }

    // Seed activity log so the activity feed looks alive
    const acts = [
      [pid1, user.id, 'completed', 'task', null, 'Audit current site for performance issues'],
      [pid1, user.id, 'completed', 'task', null, 'Design new homepage mockups in Figma'],
      [pid1, user.id, 'started',   'task', null, 'Migrate blog to new CMS'],
      [pid2, user.id, 'completed', 'task', null, 'Offline data sync — design spec'],
      [pid2, user.id, 'completed', 'task', null, 'Implement offline SQLite layer'],
      [pid2, user.id, 'started',   'task', null, 'Push notification service setup'],
      [pid3, user.id, 'completed', 'task', null, 'Write 5-part LinkedIn content series'],
      [pid3, user.id, 'started',   'task', null, 'Design Product Hunt banner'],
    ];
    for (const a of acts) {
      db.prepare('INSERT INTO activity_log (project_id, user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?,?)').run(...a);
    }

  } catch (seedErr) {
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
