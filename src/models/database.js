const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/taskflow.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -16000'); 

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL CHECK(length(name) BETWEEN 2 AND 50),
    email        TEXT    UNIQUE NOT NULL,
    password     TEXT    NOT NULL,
    avatar_color TEXT    DEFAULT '#6366f1',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
    description TEXT CHECK(length(description) <= 500),
    color       TEXT DEFAULT '#6366f1' CHECK(color GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
    status      TEXT DEFAULT 'active' CHECK(status IN ('active','archived')),
    owner_id    INTEGER NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_members (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    role       TEXT    DEFAULT 'member' CHECK(role IN ('admin','member')),
    joined_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
    description TEXT CHECK(length(description) <= 2000),
    status      TEXT DEFAULT 'todo'   CHECK(status   IN ('todo','in_progress','review','done')),
    priority    TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
    project_id  INTEGER NOT NULL,
    assignee_id INTEGER,
    creator_id  INTEGER NOT NULL,
    due_date    DATE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id)  REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES users(id)    ON DELETE SET NULL,
    FOREIGN KEY (creator_id)  REFERENCES users(id)    ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    content    TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 1000),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id)  REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL,
    entity_id  INTEGER,
    detail     TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_pm_project  ON project_members(project_id);
  CREATE INDEX IF NOT EXISTS idx_pm_user     ON project_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_proj  ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks(due_date);
  CREATE INDEX IF NOT EXISTS idx_comments_task  ON comments(task_id);
  CREATE INDEX IF NOT EXISTS idx_activity_proj  ON activity_log(project_id);
  CREATE INDEX IF NOT EXISTS idx_activity_user  ON activity_log(user_id);
`);

const logActivity = db.prepare(
  'INSERT INTO activity_log (project_id, user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?,?)'
);
db.logActivity = (projectId, userId, action, entity, entityId, detail) => {
  try { logActivity.run(projectId, userId, action, entity, entityId, detail || null); } catch {}
};

module.exports = db;
