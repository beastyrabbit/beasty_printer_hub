const taskListEl = document.getElementById('taskList');
const taskListWeekEl = document.getElementById('taskListWeek');
const scheduleLine = document.getElementById('scheduleLine');
const weekWindowEl = document.getElementById('weekWindow');
const previewTicketBody = document.getElementById('previewTicketBody');
const previewSummaryBody = document.getElementById('previewSummaryBody');
const todayCountEl = document.getElementById('todayCount');
const weekCountEl = document.getElementById('weekCount');
const trashCountEl = document.getElementById('trashCount');

// Get printer settings from localStorage
function getPrinterSettings() {
  return {
    ip: localStorage.getItem('printerIp') || '',
    port: Number(localStorage.getItem('printerPort')) || 9100
  };
}

function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${msg}`);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function renderTasks(tasks) {
  taskListEl.innerHTML = '';
  todayCountEl.textContent = tasks.length;
  
  if (!tasks.length) {
    taskListEl.innerHTML = '<li class="empty-state">No tasks for today</li>';
    return;
  }
  
  const printer = getPrinterSettings();
  
  tasks.forEach((t) => {
    const li = document.createElement('li');
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = t.title;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${t.id || ''}${t.due ? ' · due ' + t.due : ''}`;
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = t.description || '';
    const btn = document.createElement('button');
    btn.textContent = 'Print this task';
    btn.onclick = () => {
      fetchJson(`/api/todos/${encodeURIComponent(t.id)}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerIp: printer.ip, printerPort: printer.port })
      })
        .then(() => log(`Task ${t.id} printed`))
        .catch((e) => log(e.message));
      renderTicketPreview(t);
    };
    li.appendChild(title);
    li.appendChild(meta);
    if (t.description) li.appendChild(desc);
    li.appendChild(btn);
    taskListEl.appendChild(li);
  });
  if (tasks[0]) renderTicketPreview(tasks[0]);
}

function renderWeekTasks(tasks) {
  taskListWeekEl.innerHTML = '';
  weekCountEl.textContent = tasks.length;
  
  if (!tasks.length) {
    taskListWeekEl.innerHTML = '<li class="empty-state">No tasks this week</li>';
    return;
  }
  tasks.forEach((t) => {
    const li = document.createElement('li');
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = t.title;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${t.id || ''}${t.due ? ' · due ' + t.due : ''}`;
    li.appendChild(title);
    li.appendChild(meta);
    taskListWeekEl.appendChild(li);
  });
}

function renderPills(labels) {
  if (!labels || !labels.length) return '';
  return labels.map((l) => `<span class="pill">${l}</span>`).join(' ');
}

function prioBar(p) {
  if (p === undefined || p === null) return '';
  const n = Math.min(5, Math.max(1, Number(p) || 1));
  return '!'.repeat(n);
}

function stripEmoji(str) {
  return (str || '')
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // Emoticons, symbols
    .replace(/[\u{2600}-\u{26FF}]/gu, '')    // Misc symbols  
    .replace(/[\u{2700}-\u{27BF}]/gu, '')    // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')    // Variation selectors
    .replace(/[\u{200D}]/gu, '')             // Zero-width joiner
    .replace(/\s+/g, ' ')                    // Normalize whitespace
    .trim();
}

function renderTicketPreview(task) {
  if (!task) {
    previewTicketBody.textContent = 'No task selected.';
    return;
  }
  const title = stripEmoji(task.title).toUpperCase();
  previewTicketBody.innerHTML = `
    <div class="ticket-banner">* DO IT! *</div>
    <div class="ticket-title">${title}</div>
    ${task.labels?.length ? `<div class="ticket-labels">${renderPills(task.labels.map(l => stripEmoji(l)))}</div>` : ''}
    ${task.description ? `<div class="ticket-desc">${task.description}</div>` : ''}
    <div class="ticket-qr">[QR]</div>
  `;
}

function renderSummaryPreview(tasks, title) {
  if (!tasks || !tasks.length) {
    previewSummaryBody.textContent = 'No tasks.';
    return;
  }
  const lines = tasks.map((t) => {
    const taskTitle = stripEmoji(t.title);
    const labelStr = t.labels?.length ? `<span class="summary-meta">[${stripEmoji(t.labels[0])}]</span>` : '';
    return `<div class="summary-task">- ${taskTitle}${labelStr}</div>`;
  }).join('');
  previewSummaryBody.innerHTML = `
    <div class="summary-header">${title}</div>
    <div class="summary-count">${tasks.length} Aufgaben</div>
    ${lines}
  `;
}

async function loadToday() {
  const data = await fetchJson('/api/todos/today');
  renderTasks(data.tasks || []);
  renderSummaryPreview(data.tasks || [], 'Daily Overview 🏁');
  log(`Loaded ${data.tasks?.length || 0} tasks for today`);
}

async function loadWeek() {
  const data = await fetchJson('/api/todos/week');
  renderWeekTasks(data.tasks || []);
  if (data.window) {
    const start = new Date(data.window.start);
    const end = new Date(data.window.end);
    weekWindowEl.textContent = `${start.toLocaleDateString('de-DE')} – ${end.toLocaleDateString('de-DE')}`;
  }
  renderSummaryPreview(data.tasks || [], 'Weekly Overview 📅');
  log(`Loaded ${data.tasks?.length || 0} tasks for the week`);
}

async function loadTrashCount() {
  try {
    const data = await fetchJson('/api/trash/preview');
    trashCountEl.textContent = (data.upcoming || []).length;
  } catch {
    trashCountEl.textContent = '--';
  }
}

async function printServer(path) {
  const printer = getPrinterSettings();
  if (!printer.ip) {
    alert('Please configure printer IP in Settings first');
    return;
  }
  const res = await fetchJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printerIp: printer.ip, printerPort: printer.port })
  });
  log(`Print complete: ${res.status || 'done'} (${res.count || 0} items)`);
}

async function loadStatus() {
  try {
    const data = await fetchJson('/api/status');
    // Save printer IP from server if not already set locally
    if (data.printerIp && !localStorage.getItem('printerIp')) {
      localStorage.setItem('printerIp', data.printerIp);
    }
    scheduleLine.textContent = `Auto-print: ${data.dailyPrintTime} · Last: ${data.lastRunAt ? new Date(data.lastRunAt).toLocaleTimeString() : 'never'}`;
  } catch (err) {
    scheduleLine.textContent = 'Status unavailable';
    log('Cannot load status: ' + err.message);
  }
}

// Event bindings
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnLoadAll').onclick = () => {
    loadToday().catch((e) => log(e.message));
    loadWeek().catch((e) => log(e.message));
  };
  document.getElementById('btnPrintServer').onclick = () => printServer('/api/print/daily').catch((e) => {
    log(e.message);
    alert('Print failed: ' + e.message);
  });
  document.getElementById('btnPrintWeekly').onclick = () => printServer('/api/print/weekly').catch((e) => {
    log(e.message);
    alert('Print failed: ' + e.message);
  });

  // Load initial data
  loadStatus();
  loadToday().catch(() => {});
  loadWeek().catch(() => {});
  loadTrashCount().catch(() => {});
});
