const router = require('express').Router();
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');

// GET /api/dashboard - aggregated stats for logged-in user
router.get('/', authenticate, (req, res) => {
  const uid = req.user.id;
  const today = new Date().toISOString().split('T')[0];

  const projects = db.prepare(`
    SELECT COUNT(*) as total FROM projects p
    JOIN project_members pm ON p.id = pm.project_id
    WHERE pm.user_id = ? AND p.status = 'active'
  `).get(uid);

  const myTasks = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) as review,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
    FROM tasks t
    JOIN project_members pm ON t.project_id = pm.project_id
    WHERE pm.user_id = ? AND t.assignee_id = ?
  `).get(uid, uid);

  const overdue = db.prepare(`
    SELECT t.*, p.name as project_name, p.color as project_color,
      u.name as assignee_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN project_members pm ON t.project_id = pm.project_id
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE pm.user_id = ? AND t.due_date < ? AND t.status != 'done'
    ORDER BY t.due_date ASC LIMIT 10
  `).all(uid, today);

  const recentTasks = db.prepare(`
    SELECT t.*, p.name as project_name, p.color as project_color,
      u.name as assignee_name, u.avatar_color as assignee_color
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN project_members pm ON t.project_id = pm.project_id
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE pm.user_id = ?
    ORDER BY t.updated_at DESC LIMIT 8
  `).all(uid);

  const projectStats = db.prepare(`
    SELECT p.id, p.name, p.color,
      COUNT(t.id) as total_tasks,
      SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done_tasks,
      SUM(CASE WHEN t.due_date < ? AND t.status != 'done' THEN 1 ELSE 0 END) as overdue_tasks
    FROM projects p
    JOIN project_members pm ON p.id = pm.project_id
    LEFT JOIN tasks t ON p.id = t.project_id
    WHERE pm.user_id = ? AND p.status = 'active'
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT 6
  `).all(today, uid);

  res.json({
    projects: projects.total,
    tasks: myTasks,
    overdue,
    recentTasks,
    projectStats
  });
});

module.exports = router;
