const _ep = '/api'; 
const select = (id) => document.getElementById(id);
const query = (s) => document.querySelector(s);

let auth_token = localStorage.getItem('ethara_v1_token');
let user_ctx = null;
let active_proj = null;
let proj_role = null;
let project_members = [];

const STATUS_COLS = [
  { id: 'todo', label: 'To Do', hex: '#94a3b8' },
  { id: 'in_progress', label: 'In Progress', hex: '#6366f1' },
  { id: 'review', label: 'Review', hex: '#f59e0b' },
  { id: 'done', label: 'Done', hex: '#10b981' },
];

const getInitials = (n) => (n||'').split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);
const formatDate = (d) => d ? new Date(d).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : '—';
const checkOverdue = (d) => d && new Date(d) < new Date().setHours(0,0,0,0);

function notify(msg, type = 'info') {
  const box = select('toasts');
  const el = document.createElement('div');
  el.className = `t ${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  box.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    setTimeout(() => el.remove(), 400);
  }, 3000);
}

async function request(method, path, data) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (auth_token) opts.headers['Authorization'] = `Bearer ${auth_token}`;
  if (data) opts.body = JSON.stringify(data);

  const res = await fetch(_ep + path, opts);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json.error || 'Server error');
  }
  return json;
}

function switchAuth(tab, prefill = '') {
  const isLogin = tab === 'login';
  select('tab-login').classList.toggle('active', isLogin);
  select('tab-signup').classList.toggle('active', !isLogin);
  select('form-login').style.display = isLogin ? 'block' : 'none';
  select('form-signup').style.display = !isLogin ? 'block' : 'none';

  const err = select('auth-error');
  err.classList.remove('visible');
  err.textContent = '';
  if (isLogin && prefill) select('login-email').value = prefill;
}

function showAuthError(msg) {
  const el = select('auth-error');
  el.textContent = msg;

  el.classList.remove('visible');
  void el.offsetWidth; 
  el.classList.add('visible');
}

async function doLogin(e) {
  e.preventDefault();
  const btn = e.currentTarget.querySelector('button[type="submit"]') || e.currentTarget;
  const email = select('login-email').value.trim();
  const pass = select('login-pass').value;

  if (!email || !pass) { showAuthError('Please enter your email and password.'); return; }

  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    const res = await request('POST', '/auth/login', { email, password: pass });
    auth_token = res.token;
    localStorage.setItem('ethara_v1_token', auth_token);

    if (select('login-remember') && select('login-remember').checked) {
      localStorage.setItem('ethara_last_email', email);
    } else {
      localStorage.removeItem('ethara_last_email');
    }

    user_ctx = res.user;
    bootApp();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enter Workspace';
  }
}

async function doSignup(e) {
  e.preventDefault();
  const btn = e.currentTarget.querySelector('button[type="submit"]') || e.currentTarget;
  const name = select('signup-name').value.trim();
  const email = select('signup-email').value.trim();
  const pass = select('signup-pass').value;

  if (!name || !email || pass.length < 6) {
    showAuthError('Please fill all fields. Password must be at least 6 characters.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating workspace...';
  try {
    const res = await request('POST', '/auth/signup', { name, email, password: pass });
    auth_token = res.token;
    localStorage.setItem('ethara_v1_token', auth_token);
    localStorage.setItem('ethara_last_email', email);
    user_ctx = res.user;
    bootApp();
  } catch (err) {
    if (err.message.toLowerCase().includes('exist')) {
      switchAuth('login', email);
      showAuthError('An account with that email already exists. Please sign in.');
    } else {
      showAuthError(err.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Workspace';
  }
}

function doLogout() {
  auth_token = null; user_ctx = null;
  localStorage.removeItem('ethara_v1_token');
  select('app').style.display = 'none';
  select('auth').style.display = 'grid';
}

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  select(`page-${page}`).classList.add('active');
  select('nav-dashboard').classList.toggle('active', page === 'dashboard');
  select('nav-projects').classList.toggle('active', page === 'projects');

  if (page === 'dashboard') loadDash();
  if (page === 'projects') loadProjs();
}

function bootApp() {
  select('auth').style.display = 'none';
  select('app').style.display = 'block';
  const av = select('avatar');
  av.style.background = user_ctx.avatar_color || '#e87c3a';
  av.textContent = getInitials(user_ctx.name);
  select('dd-name').textContent = user_ctx.name;
  select('dd-email').textContent = user_ctx.email;
  const hr = new Date().getHours();
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user_ctx.name.split(' ')[0];
  select('greet').textContent = `${greeting}, ${firstName}`;
  navigate('dashboard');
}

async function loadDash() {
  try {
    const d = await request('GET', '/dashboard');
    select('s-projects').textContent = d.projects;
    select('s-total').textContent = d.tasks.total || 0;
    select('s-done').textContent = d.tasks.done || 0;
    select('s-overdue').textContent = d.overdue.length;

    const t = d.tasks;
    const total = t.total || 1;
    select('stats').innerHTML = [
      { l: 'To Do', v: t.todo, c: '#94a3b8' },
      { l: 'In Progress', v: t.in_progress, c: '#e87c3a' },
      { l: 'Done', v: t.done, c: '#10b981' }
    ].map(r => `
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:2px">
          <span class="muted">${r.l}</span><span>${r.v||0}</span>
        </div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${((r.v||0)/total)*100}%;background:${r.c}"></div></div>
      </div>
    `).join('');

    select('recent').innerHTML = d.recentTasks.length ? d.recentTasks.map(t => `
      <div class="task fade-in" onclick="openProjTask(${t.project_id}, ${t.id})">
        <div style="font-weight:600">${t.title}</div>
        <div class="meta">
          <span class="pill"><span class="dot" style="background:${t.project_color}"></span>${t.project_name}</span>
          ${t.due_date ? `<span class="due ${checkOverdue(t.due_date) ? 'over' : ''}">${formatDate(t.due_date)}</span>` : ''}
        </div>
      </div>
    `).join('') : '<div class="empty">No recent tasks</div>';

    select('overdue').innerHTML = d.overdue.length ? d.overdue.map(t => `
      <div class="task fade-in" onclick="openProjTask(${t.project_id}, ${t.id})">
        <div style="font-weight:600;color:#ef4444">${t.title}</div>
        <div class="meta">
          <span class="pill">${t.project_name}</span>
          <span class="due over">Late: ${formatDate(t.due_date)}</span>
        </div>
      </div>
    `).join('') : '<div class="empty">Clean slate! No overdue tasks.</div>';

    select('projStats').innerHTML = d.projectStats.map(p => {
      const pct = p.total_tasks ? Math.round((p.done_tasks/p.total_tasks)*100) : 0;
      return `
        <div class="task" onclick="openProj(${p.id})">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-weight:700">${p.name}</span>
            <span class="muted">${pct}%</span>
          </div>
          <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%;background:${p.color}"></div></div>
        </div>
      `;
    }).join('');

  } catch (err) { notify(err.message, 'error'); }
}

async function loadProjs() {
  try {
    const ps = await request('GET', '/projects');
    select('projects').innerHTML = ps.length ? ps.map(p => `
      <div class="project fade-in" onclick="openProj(${p.id})">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
          <div style="font-family:'Space Grotesk';font-weight:700;font-size:1.1rem">${p.name}</div>
          <span class="role-badge ${p.role}">${p.role}</span>
        </div>
        <div class="muted" style="font-size:.88rem;margin-bottom:12px;height:40px;overflow:hidden">${p.description||'—'}</div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${p.task_count?Math.round((p.done_count/p.task_count)*100):0}%;background:${p.color}"></div></div>
        <div style="margin-top:14px;display:flex;gap:10px">
          <span class="pill">📋 ${p.task_count}</span>
          <span class="pill">👥 ${p.member_count}</span>
        </div>
      </div>
    `).join('') : '<div class="empty" style="grid-column:1/-1">Time to start something new. Create a project!</div>';
  } catch (err) { notify(err.message, 'error'); }
}

async function openProj(id) {
  try {
    const p = await request('GET', `/projects/${id}`);
    active_proj = p; proj_role = p.my_role; project_members = p.members;

    select('p-name').textContent = p.name;
    select('p-desc').textContent = p.description || 'No description provided.';
    select('p-dot').style.background = p.color;
    select('p-role').innerHTML = `<span class="role-badge ${proj_role}">${proj_role}</span>`;

    const pct = p.task_count ? Math.round((p.done_count/p.task_count)*100) : 0;
    select('p-progress').style.width = pct + '%';
    select('p-progress').style.background = p.color;
    select('p-pct').textContent = pct + '%';

    select('p-admin-actions').style.display = proj_role === 'admin' ? 'flex' : 'none';
    select('inviteCard').style.display = proj_role === 'admin' ? 'block' : 'none';

    setProjectTab('board');
    navigate('project');
    syncBoard();

    const isCompact = localStorage.getItem('ethara_compact') === 'true';
    select('compactToggle').checked = isCompact;
    if (isCompact) select('board').classList.add('compact');
    else select('board').classList.remove('compact');

  } catch (err) { notify(err.message, 'error'); }
}

function setProjectTab(tab) {
  document.querySelectorAll('.tabs2 button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  select('tab-board').style.display = tab === 'board' ? 'block' : 'none';
  select('tab-list').style.display = tab === 'list' ? 'block' : 'none';
  select('tab-members').style.display = tab === 'members' ? 'block' : 'none';
  select('tab-activity').style.display = tab === 'activity' ? 'block' : 'none';

  if (tab === 'list') syncTaskList();
  if (tab === 'members') renderProjectMembers();
  if (tab === 'activity') syncActivityLog();
}

async function syncActivityLog() {
  try {
    const logs = await request('GET', `/projects/${active_proj.id}/activity`);
    select('activityList').innerHTML = logs.length ? logs.map(l => `
      <div style="display:flex;gap:12px;font-size:.9rem;border-bottom:1px solid var(--border);padding-bottom:12px">
        <div class="avatar" style="width:30px;height:30px;font-size:.75rem;background:${l.avatar_color}">${getInitials(l.user_name)}</div>
        <div>
          <span style="font-weight:700">${l.user_name}</span> 
          <span class="muted">${l.action} ${l.entity}</span> 
          <span style="color:var(--accent)">"${l.detail}"</span>
          <div class="muted" style="font-size:.75rem;margin-top:2px">${new Date(l.created_at).toLocaleString()}</div>
        </div>
      </div>
    `).join('') : '<div class="empty">No activity yet.</div>';
  } catch (err) { notify(err.message, 'error'); }
}

async function syncBoard() {
  try {
    const tasks = await request('GET', `/projects/${active_proj.id}/tasks`);
    select('board').innerHTML = STATUS_COLS.map(col => {
      const list = tasks.filter(t => t.status === col.id);
      return `
        <div class="col" data-status="${col.id}" ondragover="handleDragOver(event)" ondrop="handleDrop(event)">
          <div class="col-h">
            <span class="dot" style="background:${col.hex}"></span>
            <span style="font-weight:700">${col.label}</span>
            <span class="count">${list.length}</span>
          </div>
          <div class="tasks">
            ${list.map(t => `
              <div class="task" draggable="true" data-id="${t.id}" ondragstart="handleDragStart(event)" onclick="openTaskModal(${t.id})">
                <div style="font-weight:600">${t.title}</div>
                <div class="meta">
                  <span class="badge ${t.priority}">${t.priority}</span>
                  ${t.assignee_name ? `<span class="pill">${getInitials(t.assignee_name)}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
          <button class="add" onclick="openNewTaskModal('${col.id}')">+ New Task</button>
        </div>
      `;
    }).join('');
  } catch (err) { notify(err.message, 'error'); }
}

function handleDragStart(e) {
  e.dataTransfer.setData('task_id', e.target.dataset.id);
  e.target.classList.add('dragging');
}
function handleDragOver(e) { e.preventDefault(); }
async function handleDrop(e) {
  e.preventDefault();
  const taskId = e.dataTransfer.getData('task_id');
  const targetCol = e.currentTarget.closest('.col');
  const newStatus = targetCol.dataset.status;

  try {
    await request('PATCH', `/projects/${active_proj.id}/tasks/${taskId}`, { status: newStatus });
    syncBoard();
  } catch (err) { notify(err.message, 'error'); }
}

function showModal(html) {
  select('modal').innerHTML = html;
  select('modalWrap').classList.add('open');
}
function hideModal(e) {
  if (e && e.target !== select('modalWrap')) return;
  select('modalWrap').classList.remove('open');
}

function openNewTaskModal(status) {
  const membersOptions = project_members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  showModal(`
    <div class="m-h">
      <div class="m-title">Create Task</div>
      <button class="btn ghost sm" onclick="hideModal()">✕</button>
    </div>
    <div class="field"><label>Task Title</label><input class="input" id="nt-title" placeholder="What needs to be done?"/></div>
    <div class="field"><label>Notes</label><textarea id="nt-desc" placeholder="Details..."></textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="field"><label>Assign To</label><select id="nt-assignee"><option value="">Unassigned</option>${membersOptions}</select></div>
      <div class="field"><label>Priority</label><select id="nt-priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
    </div>
    <div class="field"><label>Due Date</label><input class="input" type="date" id="nt-due"/></div>
    <button class="btn primary full" onclick="submitNewTask(event, '${status}')">Add Task</button>
  `);
}

async function submitNewTask(e, status) {
  const title = select('nt-title').value.trim();
  if (!title) return notify('Title is required', 'error');

  try {
    await request('POST', `/projects/${active_proj.id}/tasks`, {
      title,
      description: select('nt-desc').value,
      assignee_id: select('nt-assignee').value || null,
      priority: select('nt-priority').value,
      due_date: select('nt-due').value || null,
      status
    });
    hideModal();
    syncBoard();
    notify('Task added', 'success');
  } catch (err) { notify(err.message, 'error'); }
}

async function openTaskModal(id) {
  try {
    const t = await request('GET', `/projects/${active_proj.id}/tasks/${id}`);
    const membersOptions = project_members.map(m => `<option value="${m.id}" ${t.assignee_id===m.id?'selected':''}>${m.name}</option>`).join('');

    showModal(`
      <div class="m-h">
        <div class="m-title">Edit Task</div>
        <div style="display:flex;gap:6px">
          <button class="btn danger sm" onclick="removeTask(${t.id})">Delete</button>
          <button class="btn ghost sm" onclick="hideModal()">✕</button>
        </div>
      </div>
      <div class="field"><label>Title</label><input class="input" id="et-title" value="${t.title}"/></div>
      <div class="field"><label>Description</label><textarea id="et-desc">${t.description||''}</textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Status</label><select id="et-status">${STATUS_COLS.map(c=>`<option value="${c.id}" ${t.status===c.id?'selected':''}>${c.label}</option>`).join('')}</select></div>
        <div class="field"><label>Assignee</label><select id="et-assignee"><option value="">Unassigned</option>${membersOptions}</select></div>
      </div>
      <button class="btn primary full" onclick="updateTask(${t.id})">Save Changes</button>
      <div class="divider" style="margin:20px 0"></div>
      <div style="font-weight:700;margin-bottom:10px">Discussion</div>
      <div id="comments" style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
        ${t.comments.map(c => `<div class="task" style="font-size:.88rem"><b>${c.user_name}:</b> ${c.content}</div>`).join('') || '<div class="muted">No comments.</div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <input class="input" id="new-comment" placeholder="Add a comment..."/>
        <button class="btn sm primary" onclick="postComment(${t.id})">Post</button>
      </div>
    `);
  } catch (err) { notify(err.message, 'error'); }
}

async function updateTask(id) {
  try {
    await request('PATCH', `/projects/${active_proj.id}/tasks/${id}`, {
      title: select('et-title').value,
      description: select('et-desc').value,
      status: select('et-status').value,
      assignee_id: select('et-assignee').value || null
    });
    hideModal();
    syncBoard();
    notify('Task updated', 'success');
  } catch (err) { notify(err.message, 'error'); }
}

async function removeTask(id) {
  if (!confirm('Permanent delete?')) return;
  try {
    await request('DELETE', `/projects/${active_proj.id}/tasks/${id}`);
    hideModal();
    syncBoard();
    notify('Task deleted');
  } catch (err) { notify(err.message, 'error'); }
}

async function postComment(id) {
  const val = select('new-comment').value.trim();
  if (!val) return;
  try {
    await request('POST', `/projects/${active_proj.id}/tasks/${id}/comments`, { content: val });
    openTaskModal(id);
  } catch (err) { notify(err.message, 'error'); }
}

function toggleCompactMode(e) {
  if (e.target.checked) {
    select('board').classList.add('compact');
    localStorage.setItem('ethara_compact', 'true');
  } else {
    select('board').classList.remove('compact');
    localStorage.setItem('ethara_compact', 'false');
  }
}

document.addEventListener('keydown', (e) => {

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key.toLowerCase() === 'n' && active_proj && select('tab-board').style.display === 'block') {
    e.preventDefault();
    openNewTaskModal('todo');
  }

  if (e.key === 'Escape' && select('modalWrap').classList.contains('open')) {
    hideModal();
  }
});

function toggleUserMenu() { select('dropdown').classList.toggle('open'); }
window.onclick = (e) => { if (!e.target.closest('.menu')) select('dropdown')?.classList.remove('open'); };

async function initApp() {
  const last = localStorage.getItem('ethara_last_email');
  if (last) select('login-email').value = last;

  if (auth_token) {
    try {
      const res = await request('GET', '/auth/me');
      user_ctx = res.user;
      bootApp();
    } catch { doLogout(); }
  } else {
    select('auth').style.display = 'grid';
  }
}

function renderProjectMembers() {
  select('membersList').innerHTML = project_members.map(m => {
    const isOwner = active_proj.owner_id === m.id;
    const canManage = proj_role === 'admin' && !isOwner && m.id !== user_ctx.id;
    return `
      <div class="task" style="display:flex;align-items:center;gap:12px">
        <div class="avatar" style="background:${m.avatar_color}">${getInitials(m.name)}</div>
        <div style="flex:1">
          <div style="font-weight:700">${m.name} ${isOwner ? '<span class="badge">Project Owner</span>' : ''}</div>
          <div class="muted" style="font-size:0.8rem">${m.email}</div>
        </div>
        ${canManage ? `
          <button class="btn danger sm" onclick="kickMember(${m.id})">Remove</button>
        ` : `<span class="role-badge ${m.role}">${m.role === 'admin' ? 'Team Lead' : 'Collaborator'}</span>`}
      </div>
    `;
  }).join('');
}

async function kickMember(userId) {
  if (!confirm('Are you sure you want to remove this member?')) return;
  try {
    await request('DELETE', `/projects/${active_proj.id}/members/${userId}`);
    notify('Member removed');
    openProj(active_proj.id);
  } catch (err) { notify(err.message, 'error'); }
}
window.showAuth = switchAuth;
window.login = doLogin;
window.signup = doSignup;
window.logout = doLogout;
window.go = navigate;
window.toggleMenu = toggleUserMenu;
window.openProj = openProj;
window.setTab = setProjectTab;
window.toggleCompactMode = toggleCompactMode;
window.openCreateProject = () => showModal(`
  <div class="m-h"><div class="m-title">New Project</div><button class="btn ghost sm" onclick="hideModal()">✕</button></div>
  <div class="field"><label>Project Name</label><input class="input" id="cp-name" placeholder="E.g. Website Redesign"/></div>
  <div class="field"><label>Description</label><textarea id="cp-desc"></textarea></div>
  <div class="field"><label>Theme Color</label><input class="input" type="color" id="cp-color" value="#e87c3a"/></div>
  <button class="btn primary full" onclick="submitProject()">Launch Project</button>
`);
window.submitProject = async () => {
  const name = select('cp-name').value.trim();
  if (!name) return notify('Name is required', 'error');
  try {
    await request('POST', '/projects', { name, description: select('cp-desc').value, color: select('cp-color').value });
    hideModal();
    navigate('projects');
    notify('Project created!', 'success');
  } catch (err) { notify(err.message, 'error'); }
};

initApp();