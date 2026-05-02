const jwt = require('jsonwebtoken');
const db = require('../models/database');

const JWT_SECRET = process.env.JWT_SECRET || 'taskflow-dev-secret-change-in-production';

const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(
      'SELECT id, name, email, avatar_color, created_at FROM users WHERE id = ?'
    ).get(decoded.id);

    if (!user) return res.status(401).json({ error: 'User account not found' });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const ROLE_RANK = { member: 0, admin: 1 };

const requireProjectRole = (minRole) => (req, res, next) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: 'Project ID missing' });

  const member = db.prepare(
    'SELECT id, role FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(projectId, req.user.id);

  if (!member) {
    return res.status(403).json({ error: "It looks like you're not a member of this project." });
  }

  if ((ROLE_RANK[member.role] ?? -1) < (ROLE_RANK[minRole] ?? 99)) {
    return res.status(403).json({
      error: `Sorry, this action requires a ${minRole} role. You are currently a ${member.role}.`
    });
  }

  req.projectRole = member.role;
  req.projectMemberId = member.id;
  next();
};

module.exports = { authenticate, requireProjectRole, JWT_SECRET };