const router = require('express').Router({ mergeParams: true });
const { body, query, validationResult } = require('express-validator');
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

function getFullTask(taskId) {
  return db.prepare(`
    SELECT t.*,
      u.name  AS assignee_name, u.avatar_color AS assignee_color,
      c.name  AS creator_name,  c.avatar_color AS creator_color
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN  users c ON t.creator_id = c.id
    WHERE t.id = ?
  `).get(taskId);
}

// Get tasks for a project
router.get('/', authenticate, requireProjectRole('member'), [
  query('status').optional().isIn(['todo','in_progress','review','done']),
  query('priority').optional().isIn(['low','medium','high','urgent']),
  query('assignee_id').optional().isInt(),
], (req, res) => {
  if (!validate(req, res)) return;

  const { status, priority, assignee_id } = req.query;
  let sql = `
    SELECT t.*,
      u.name AS assignee_name, u.avatar_color AS assignee_color,
      c.name AS creator_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN  users c ON t.creator_id = c.id
    WHERE t.project_id = ?
  `;
  const params = [req.params.projectId];

  if (status)      { sql += ' AND t.status = ?';      params.push(status); }
  if (priority)    { sql += ' AND t.priority = ?';    params.push(priority); }
  if (assignee_id) { sql += ' AND t.assignee_id = ?'; params.push(assignee_id); }

  sql += ' ORDER BY CASE t.priority WHEN "urgent" THEN 0 WHEN "high" THEN 1 WHEN "medium" THEN 2 ELSE 3 END, t.created_at DESC';

  res.json(db.prepare(sql).all(...params));
});

// Create task
router.post('/', authenticate, requireProjectRole('member'), [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title required (max 200 chars)'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 2000 }),
  body('status').optional().isIn(['todo','in_progress','review','done']).withMessage('Invalid status'),
  body('priority').optional().isIn(['low','medium','high','urgent']).withMessage('Invalid priority'),
  body('due_date').optional({ nullable: true }).isISO8601().withMessage('Invalid date (use YYYY-MM-DD)'),
  body('assignee_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid assignee_id'),
], (req, res) => {
  if (!validate(req, res)) return;

  const { title, description, status, priority, due_date, assignee_id } = req.body;

  if (assignee_id) {
    const isMember = db.prepare(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?'
    ).get(req.params.projectId, assignee_id);
    if (!isMember) return res.status(400).json({ error: 'Assignee must be a project member' });
  }

  const result = db.prepare(`
    INSERT INTO tasks (title, description, status, priority, project_id, assignee_id, creator_id, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, description || '', status || 'todo', priority || 'medium',
    req.params.projectId, assignee_id || null, req.user.id, due_date || null
  );

  db.logActivity(req.params.projectId, req.user.id, 'created', 'task', result.lastInsertRowid, title);

  // Update project updated_at
  db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.projectId);

  res.status(201).json(getFullTask(result.lastInsertRowid));
});

// Get specific task details
router.get('/:taskId', authenticate, requireProjectRole('member'), (req, res) => {
  const task = db.prepare(`
    SELECT t.*,
      u.name AS assignee_name, u.avatar_color AS assignee_color,
      c.name AS creator_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN  users c ON t.creator_id = c.id
    WHERE t.id = ? AND t.project_id = ?
  `).get(req.params.taskId, req.params.projectId);

  if (!task) return res.status(404).json({ error: 'Task not found' });

  const comments = db.prepare(`
    SELECT cm.*, u.name AS user_name, u.avatar_color
    FROM comments cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.task_id = ?
    ORDER BY cm.created_at ASC
  `).all(req.params.taskId);

  res.json({ ...task, comments });
});

// Update task status or details
// Admin: can edit any task
// Member: can only edit tasks they created or are assigned to
router.patch('/:taskId', authenticate, requireProjectRole('member'), [
  body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Title max 200 chars'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 2000 }),
  body('status').optional().isIn(['todo','in_progress','review','done']).withMessage('Invalid status'),
  body('priority').optional().isIn(['low','medium','high','urgent']).withMessage('Invalid priority'),
  body('due_date').optional({ nullable: true }).isISO8601().withMessage('Invalid date'),
  body('assignee_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid assignee_id'),
], (req, res) => {
  if (!validate(req, res)) return;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // RBAC: members can only edit their own tasks
  const isAdmin    = req.projectRole === 'admin';
  const isCreator  = task.creator_id  === req.user.id;
  const isAssignee = task.assignee_id === req.user.id;
  if (!isAdmin && !isCreator && !isAssignee) {
    return res.status(403).json({ error: 'You can only edit tasks you created or are assigned to' });
  }

  const { title, description, status, priority, assignee_id, due_date } = req.body;
  const hasAssignee = Object.prototype.hasOwnProperty.call(req.body, 'assignee_id');
  const hasDue      = Object.prototype.hasOwnProperty.call(req.body, 'due_date');

  if (assignee_id) {
    const isMember = db.prepare(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?'
    ).get(req.params.projectId, assignee_id);
    if (!isMember) return res.status(400).json({ error: 'Assignee must be a project member' });
  }

  db.prepare(`
    UPDATE tasks SET
      title       = COALESCE(?, title),
      description = COALESCE(?, description),
      status      = COALESCE(?, status),
      priority    = COALESCE(?, priority),
      assignee_id = CASE WHEN ? = 1 THEN ? ELSE assignee_id END,
      due_date    = CASE WHEN ? = 1 THEN ? ELSE due_date    END,
      updated_at  = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title || null, description ?? null, status || null, priority || null,
    hasAssignee ? 1 : 0, hasAssignee ? (assignee_id ?? null) : null,
    hasDue      ? 1 : 0, hasDue      ? (due_date      ?? null) : null,
    req.params.taskId
  );

  db.logActivity(req.params.projectId, req.user.id, 'updated', 'task', task.id, title || task.title);
  db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.projectId);

  res.json(getFullTask(req.params.taskId));
});

// Delete task
// Admin or task creator can delete
router.delete('/:taskId', authenticate, requireProjectRole('member'), (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const isAdmin   = req.projectRole === 'admin';
  const isCreator = task.creator_id === req.user.id;
  if (!isAdmin && !isCreator) {
    return res.status(403).json({ error: 'Only the task creator or a project admin can delete this task' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.taskId);
  db.logActivity(req.params.projectId, req.user.id, 'deleted', 'task', task.id, task.title);
  res.json({ message: 'Task deleted successfully' });
});

// Add comment to task
router.post('/:taskId/comments', authenticate, requireProjectRole('member'), [
  body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Comment must be 1–1000 characters'),
], (req, res) => {
  if (!validate(req, res)) return;

  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const result = db.prepare(
    'INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)'
  ).run(req.params.taskId, req.user.id, req.body.content);

  db.prepare('UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.taskId);

  const comment = db.prepare(
    'SELECT cm.*, u.name AS user_name, u.avatar_color FROM comments cm JOIN users u ON cm.user_id = u.id WHERE cm.id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json(comment);
});

module.exports = router;
