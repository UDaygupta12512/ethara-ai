const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../models/database');
const { authenticate, requireProjectRole } = require('../middleware/auth');

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
    return false;
  }
  return true;
}

router.get('/', authenticate, (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, pm.role,
      u.name AS owner_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count,
      (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) AS member_count
    FROM projects p
    JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
    JOIN users u ON p.owner_id = u.id
    ORDER BY p.created_at DESC
  `).all(req.user.id);
  res.json(projects);
});

router.post('/', authenticate, [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Project name is required (max 100 chars)'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 }).withMessage('Description max 500 chars'),
  body('color').optional({ nullable: true }).matches(/^#[0-9a-fA-F]{6}$/).withMessage('Color must be a valid hex (#rrggbb)'),
], (req, res) => {
  if (!validate(req, res)) return;

  const { name, description, color } = req.body;
  const projectColor = color || '#6366f1';

  const result = db.prepare(
    'INSERT INTO projects (name, description, color, owner_id) VALUES (?, ?, ?, ?)'
  ).run(name, description || '', projectColor, req.user.id);

  
  db.prepare(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).run(result.lastInsertRowid, req.user.id, 'admin');

  db.logActivity(result.lastInsertRowid, req.user.id, 'created', 'project', result.lastInsertRowid, name);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(project);
});

router.get('/:projectId', authenticate, requireProjectRole('member'), (req, res) => {
  const project = db.prepare(`
    SELECT p.*, u.name AS owner_name, pm_me.role AS my_role,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count
    FROM projects p
    JOIN users u ON p.owner_id = u.id
    JOIN project_members pm_me ON p.id = pm_me.project_id AND pm_me.user_id = ?
    WHERE p.id = ?
  `).get(req.user.id, req.params.projectId);

  if (!project) return res.status(404).json({ error: 'Project not found' });

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_color, pm.role, pm.joined_at
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
    ORDER BY pm.role DESC, pm.joined_at ASC
  `).all(req.params.projectId);

  res.json({ ...project, members });
});

router.patch('/:projectId', authenticate, requireProjectRole('admin'), [
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1–100 chars'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 }).withMessage('Description max 500 chars'),
  body('color').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Invalid hex color'),
  body('status').optional().isIn(['active', 'archived']).withMessage('Status must be active or archived'),
], (req, res) => {
  if (!validate(req, res)) return;

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name, description, color, status } = req.body;

  db.prepare(`
    UPDATE projects SET
      name        = COALESCE(?, name),
      description = COALESCE(?, description),
      color       = COALESCE(?, color),
      status      = COALESCE(?, status),
      updated_at  = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name || null, description ?? null, color || null, status || null, req.params.projectId);

  db.logActivity(req.params.projectId, req.user.id, 'updated', 'project', req.params.projectId, name || project.name);

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId));
});

router.delete('/:projectId', authenticate, requireProjectRole('admin'), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (project.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the project owner can delete this project' });
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.projectId);
  res.json({ message: 'Project deleted successfully' });
});

router.post('/:projectId/members', authenticate, requireProjectRole('admin'), [
  body('user_id').isInt({ min: 1 }).withMessage('Valid user_id required'),
  body('role').isIn(['admin', 'member']).withMessage('Role must be admin or member'),
], (req, res) => {
  if (!validate(req, res)) return;

  const { user_id, role } = req.body;
  const user = db.prepare('SELECT id, name, email, avatar_color FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existing = db.prepare(
    'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(req.params.projectId, user_id);
  if (existing) return res.status(409).json({ error: 'User is already a project member' });

  db.prepare(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).run(req.params.projectId, user_id, role);

  db.logActivity(req.params.projectId, req.user.id, 'added_member', 'user', user_id, user.name);

  res.status(201).json({ message: 'Member added', user, role });
});

router.patch('/:projectId/members/:userId', authenticate, requireProjectRole('admin'), [
  body('role').isIn(['admin', 'member']).withMessage('Role must be admin or member'),
], (req, res) => {
  if (!validate(req, res)) return;

  const { role } = req.body;
  const userId = parseInt(req.params.userId, 10);
  const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(req.params.projectId);

  
  if (userId === project.owner_id && role !== 'admin') {
    return res.status(400).json({ error: 'Cannot change the role of the project owner' });
  }

  const member = db.prepare(
    'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(req.params.projectId, userId);
  if (!member) return res.status(404).json({ error: 'Member not found in this project' });

  db.prepare(
    'UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?'
  ).run(role, req.params.projectId, userId);

  db.logActivity(req.params.projectId, req.user.id, 'changed_role', 'user', userId, role);
  res.json({ message: 'Role updated successfully' });
});

router.delete('/:projectId/members/:userId', authenticate, requireProjectRole('admin'), (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (userId === project.owner_id) {
    return res.status(400).json({ error: 'Cannot remove the project owner' });
  }

  db.prepare(
    'DELETE FROM project_members WHERE project_id = ? AND user_id = ?'
  ).run(req.params.projectId, userId);

  db.logActivity(req.params.projectId, req.user.id, 'removed_member', 'user', userId, null);
  res.json({ message: 'Member removed successfully' });
});

router.get('/:projectId/activity', authenticate, requireProjectRole('member'), (req, res) => {
  const logs = db.prepare(`
    SELECT a.*, u.name AS user_name, u.avatar_color
    FROM activity_log a
    JOIN users u ON a.user_id = u.id
    WHERE a.project_id = ?
    ORDER BY a.created_at DESC
    LIMIT 50
  `).all(req.params.projectId);
  res.json(logs);
});

module.exports = router;
