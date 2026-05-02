const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, '../data/taskflow.db'));

async function seed() {
  console.log('🌱 Seeding Ethara AI with demo data...');

  // 1. Create a demo user if doesn't exist
  const hashedPass = await bcrypt.hash('password123', 12);
  let user = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@ethara.ai');
  
  if (!user) {
    const res = db.prepare('INSERT INTO users (name, email, password, avatar_color) VALUES (?,?,?,?)')
      .run('Demo User', 'demo@ethara.ai', hashedPass, '#e87c3a');
    user = { id: res.lastInsertRowid };
    console.log('✅ Created demo user: demo@ethara.ai / password123');
  }

  const uid = user.id;

  // 2. Create Projects
  const projects = [
    { name: 'Ethara Platform Launch', desc: 'Main launch roadmap for the Q4 release.', color: '#e87c3a' },
    { name: 'Marketing Campaign', desc: 'Social media and outreach strategy.', color: '#6366f1' },
    { name: 'Customer Portal', desc: 'Internal tools for client management.', color: '#10b981' }
  ];

  for (const p of projects) {
    const existing = db.prepare('SELECT id FROM projects WHERE name = ? AND owner_id = ?').get(p.name, uid);
    if (!existing) {
      const res = db.prepare('INSERT INTO projects (name, description, color, owner_id) VALUES (?,?,?,?)')
        .run(p.name, p.desc, p.color, uid);
      const pid = res.lastInsertRowid;

      // Add user as admin member
      db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?,?,?)').run(pid, uid, 'admin');

      // Add Tasks
      const tasks = [
        { title: 'Finalize Landing Page', status: 'done', priority: 'high' },
        { title: 'API Documentation', status: 'in_progress', priority: 'medium' },
        { title: 'User Beta Testing', status: 'todo', priority: 'urgent' },
        { title: 'Fix CSS Grid Issues', status: 'todo', priority: 'low' }
      ];

      for (const t of tasks) {
        db.prepare('INSERT INTO tasks (title, status, priority, project_id, creator_id, assignee_id) VALUES (?,?,?,?,?,?)')
          .run(t.title, t.status, t.priority, pid, uid, uid);
      }
      
      console.log(`✅ Seeded project: ${p.name}`);
    }
  }

  console.log('\n🚀 Seeding complete! You can now log in with demo@ethara.ai / password123');
  db.close();
}

seed().catch(console.error);
