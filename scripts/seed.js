// seed.js - Run this once to populate the database with realistic demo data
// Usage: node scripts/seed.js

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH ||
  (process.env.NODE_ENV === 'production' ? '/tmp/taskflow.db' : path.join(__dirname, '../data/taskflow.db'));

console.log('Using DB at:', DB_PATH);
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

async function seed() {
  console.log('\n🌱 Seeding Ethara AI with realistic demo data...\n');

  // --- Users ---
  const users = [
    { name: 'Priya Mehta',    email: 'priya@ethara.ai',   color: '#6366f1' },
    { name: 'Rahul Sharma',   email: 'rahul@ethara.ai',   color: '#ec4899' },
    { name: 'Sara Collins',   email: 'sara@ethara.ai',    color: '#10b981' },
    { name: 'James Okafor',   email: 'james@ethara.ai',   color: '#f59e0b' },
    { name: 'Demo User',      email: 'demo@ethara.ai',    color: '#e87c3a' },
  ];

  const pass = await bcrypt.hash('password123', 10);
  const uids = {};

  for (const u of users) {
    let row = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
    if (!row) {
      const r = db.prepare(
        'INSERT INTO users (name, email, password, avatar_color) VALUES (?,?,?,?)'
      ).run(u.name, u.email, pass, u.color);
      uids[u.email] = r.lastInsertRowid;
      console.log(`  ✅ User: ${u.name} (${u.email})`);
    } else {
      uids[u.email] = row.id;
      console.log(`  ↩️  Skipped (exists): ${u.name}`);
    }
  }

  const demo  = uids['demo@ethara.ai'];
  const priya = uids['priya@ethara.ai'];
  const rahul = uids['rahul@ethara.ai'];
  const sara  = uids['sara@ethara.ai'];
  const james = uids['james@ethara.ai'];

  // helper: insert or skip project
  function upsertProject(owner, name, desc, color) {
    const ex = db.prepare('SELECT id FROM projects WHERE name = ? AND owner_id = ?').get(name, owner);
    if (ex) return ex.id;
    const r = db.prepare(
      'INSERT INTO projects (name, description, color, owner_id) VALUES (?,?,?,?)'
    ).run(name, desc, color, owner);
    return r.lastInsertRowid;
  }

  function addMember(pid, uid, role = 'member') {
    try {
      db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?,?,?)').run(pid, uid, role);
    } catch { /* already a member */ }
  }

  // past dates so overdue tasks show up properly on dashboard
  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function addTask(pid, creatorId, assigneeId, title, status, priority, dueDate, desc) {
    const ex = db.prepare('SELECT id FROM tasks WHERE project_id = ? AND title = ?').get(pid, title);
    if (ex) return ex.id;
    const r = db.prepare(
      'INSERT INTO tasks (title, description, status, priority, project_id, creator_id, assignee_id, due_date) VALUES (?,?,?,?,?,?,?,?)'
    ).run(title, desc || null, status, priority, pid, creatorId, assigneeId, dueDate || null);
    return r.lastInsertRowid;
  }

  function addComment(taskId, userId, content) {
    try {
      db.prepare('INSERT INTO comments (task_id, user_id, content) VALUES (?,?,?)').run(taskId, userId, content);
    } catch {}
  }

  function logActivity(pid, uid, action, entity, entityId, detail) {
    try {
      db.prepare('INSERT INTO activity_log (project_id, user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?,?)')
        .run(pid, uid, action, entity, entityId, detail);
    } catch {}
  }

  // ==========================================
  // PROJECT 1: Website Redesign (demo owns it)
  // ==========================================
  console.log('\n📁 Seeding: Website Redesign...');
  const p1 = upsertProject(demo, 'Website Redesign', 'Full overhaul of the marketing site — new brand, faster load times, mobile-first.', '#e87c3a');
  addMember(p1, demo,  'admin');
  addMember(p1, priya, 'member');
  addMember(p1, rahul, 'member');
  addMember(p1, sara,  'member');

  const t1 = addTask(p1, demo, priya, 'Audit current site performance', 'done', 'high', daysAgo(10), 'Run Lighthouse on all pages, document bottlenecks.');
  const t2 = addTask(p1, demo, rahul, 'Design new homepage mockups', 'done', 'high', daysAgo(5), 'Figma wireframes + high-fidelity for desktop and mobile.');
  const t3 = addTask(p1, demo, demo,  'Migrate blog to new CMS', 'in_progress', 'medium', daysFromNow(4), 'Move 80+ posts from WordPress to the new headless CMS.');
  const t4 = addTask(p1, demo, sara,  'Write copy for Services page', 'in_progress', 'medium', daysFromNow(2), 'Needs to be punchy, <200 words per section.');
  const t5 = addTask(p1, demo, priya, 'Set up staging environment', 'review', 'urgent', daysAgo(2), 'Vercel preview deployment with env vars.');
  const t6 = addTask(p1, demo, rahul, 'Implement cookie consent banner', 'todo', 'low', daysFromNow(7));
  const t7 = addTask(p1, demo, demo,  'Final QA pass before go-live', 'todo', 'urgent', daysFromNow(10));
  // overdue task
  const t8 = addTask(p1, demo, priya, 'Fix broken links in footer', 'todo', 'medium', daysAgo(3), 'At least 4 broken links reported by users. Check sitemap.');

  addComment(t2, rahul, "I've pushed two homepage concepts to the Figma link. Can everyone review by EOD?");
  addComment(t2, priya, "Love the second one — the hero section feels much cleaner. One note: the CTA button needs more contrast.");
  addComment(t2, demo,  "Agreed on concept 2. Let's go with that. Rahul, please prep the handoff file.");
  addComment(t5, sara,  "Staging is up! Found a weird layout bug on Firefox though, taking a look now.");
  addComment(t5, demo,  "Good catch. Let me know if you need another pair of eyes.");
  addComment(t8, priya, "This has been sitting here for 3 days — I'll knock it out this morning.");

  logActivity(p1, priya, 'completed', 'task', t1, 'Audit current site performance');
  logActivity(p1, rahul, 'completed', 'task', t2, 'Design new homepage mockups');
  logActivity(p1, sara,  'started',   'task', t4, 'Write copy for Services page');
  logActivity(p1, priya, 'submitted', 'task', t5, 'Set up staging environment for review');
  logActivity(p1, demo,  'commented', 'task', t5, 'Good catch. Let me know if you need another pair of eyes.');

  // ==========================================
  // PROJECT 2: Mobile App v2 (priya owns it)
  // ==========================================
  console.log('📁 Seeding: Mobile App v2...');
  const p2 = upsertProject(priya, 'Mobile App v2', 'Major feature release — offline mode, push notifications, and redesigned home screen.', '#6366f1');
  addMember(p2, priya, 'admin');
  addMember(p2, demo,  'admin');
  addMember(p2, james, 'member');
  addMember(p2, rahul, 'member');

  const t9  = addTask(p2, priya, james, 'Offline data sync with SQLite',     'done',        'urgent', daysAgo(8), 'Users need to create and edit tasks without internet.');
  const t10 = addTask(p2, priya, james, 'Push notification service setup',   'in_progress', 'high',   daysFromNow(3), 'FCM for Android, APNs for iOS.');
  const t11 = addTask(p2, priya, rahul, 'Redesign home screen layout',       'in_progress', 'medium', daysFromNow(5));
  const t12 = addTask(p2, priya, demo,  'Write unit tests for sync logic',   'todo',        'high',   daysFromNow(6));
  const t13 = addTask(p2, priya, priya, 'App store screenshots & listing',   'todo',        'medium', daysFromNow(12));
  // overdue
  const t14 = addTask(p2, priya, james, 'Fix crash on Android 12 low memory','todo',        'urgent', daysAgo(5), 'Reported by 3 beta testers. Happens when backgrounding the app.');

  addComment(t9,  james, "Offline sync is working but there's a conflict edge case when two users edit the same task. Flagging for now.");
  addComment(t9,  priya, "Let's add an 'edited by' timestamp and last-writer-wins for v2. We can do proper CRDT in v3.");
  addComment(t10, james, "FCM is wired up. iOS is tricky — need the Apple Developer cert renewed first.");
  addComment(t10, demo,  "I'll handle the cert renewal, give me until tomorrow morning.");
  addComment(t14, priya, "This is blocking the beta. James, can we pair on it this afternoon?");
  addComment(t14, james, "Yeah, I have 3pm free. I think it's the media cache not getting cleared on low memory.");

  logActivity(p2, james, 'completed',  'task', t9,  'Offline data sync with SQLite');
  logActivity(p2, james, 'started',    'task', t10, 'Push notification service setup');
  logActivity(p2, rahul, 'started',    'task', t11, 'Redesign home screen layout');
  logActivity(p2, priya, 'commented',  'task', t14, 'This is blocking the beta. Can we pair on it?');

  // ==========================================
  // PROJECT 3: Q3 Marketing Campaign (demo)
  // ==========================================
  console.log('📁 Seeding: Q3 Marketing Campaign...');
  const p3 = upsertProject(demo, 'Q3 Marketing Campaign', 'Product Hunt launch + LinkedIn content series + email drip campaign targeting SMBs.', '#10b981');
  addMember(p3, demo, 'admin');
  addMember(p3, sara, 'member');
  addMember(p3, priya,'member');

  addTask(p3, demo, sara,  'Write 5-part LinkedIn series',        'done',        'medium', daysAgo(6), 'Topics: remote work, async collab, project death by meeting, tooling, team culture.');
  addTask(p3, demo, sara,  'Set up email drip in Mailchimp',      'in_progress', 'high',   daysFromNow(4), '5 emails over 2 weeks. Segmented by SMB vs Enterprise.');
  addTask(p3, demo, priya, 'Design Product Hunt visuals',         'in_progress', 'high',   daysFromNow(2), 'Thumbnail, gallery images, and GIF demo.');
  addTask(p3, demo, demo,  'Schedule launch day posts',           'todo',        'medium', daysFromNow(8));
  addTask(p3, demo, sara,  'Draft press release',                 'todo',        'low',    daysFromNow(14));
  // overdue
  addTask(p3, demo, priya, 'Update website with campaign landing page', 'todo', 'urgent', daysAgo(1), 'Needs to match the campaign creative and have a lead form.');

  console.log('\n✨ All done! Log in with:\n');
  console.log('   📧 demo@ethara.ai');
  console.log('   🔑 password123\n');

  db.close();
}

seed().catch(console.error);
