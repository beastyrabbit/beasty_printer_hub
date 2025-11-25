const {
  donotickBaseUrl,
  donotickToken,
  donotickTodayPath,
  donotickUsername,
  donotickPassword
} = require('./config');

let jwtToken = null;
let jwtExpire = 0;
let cachedLabels = null;
let cachedUserId = null;

function buildUrl(pathname) {
  const base = donotickBaseUrl.endsWith('/') ? donotickBaseUrl.slice(0, -1) : donotickBaseUrl;
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${normalized}`;
}

function ensureJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`Unexpected response (content-type ${ct || 'unknown'})`);
  }
}

function looksHtml(res) {
  const ct = res.headers.get('content-type') || '';
  return ct.includes('text/html');
}

function addDefaultPort(base) {
  if (base.includes(':')) return base; // already has port
  return `${base}:2021`;
}

function bearerHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${jwtToken}`,
    ...extra
  };
}

async function ensureJwt() {
  const now = Date.now();
  if (jwtToken && now < jwtExpire - 30_000) return jwtToken;
  if (!donotickUsername || !donotickPassword) {
    throw new Error('Missing DONOTICK_USERNAME or DONOTICK_PASSWORD for authenticated API');
  }
  const url = buildUrl('/api/v1/auth/login');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: donotickUsername, password: donotickPassword })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data.token) throw new Error('Login response missing token');
  jwtToken = data.token;
  jwtExpire = data.expire ? new Date(data.expire).getTime() : now + 60 * 60 * 1000;
  return jwtToken;
}

async function getCurrentUserId() {
  if (cachedUserId) return cachedUserId;
  await ensureJwt();
  // Try chores list first (works without plus).
  const res = await fetch(buildUrl('/api/v1/chores/'), {
    headers: bearerHeaders({ Accept: 'application/json' })
  });
  if (res.ok) {
    const data = await res.json();
    const list = Array.isArray(data.res) ? data.res : Array.isArray(data) ? data : [];
    const assigned = list.find((c) => c.assignedTo);
    if (assigned && assigned.assignedTo) {
      cachedUserId = assigned.assignedTo;
      return cachedUserId;
    }
  }
  // Fallback: default to 1 (common for first user).
  cachedUserId = 1;
  return cachedUserId;
}

async function fetchLabels() {
  await ensureJwt();
  const res = await fetch(buildUrl('/api/v1/labels'), {
    headers: bearerHeaders({ Accept: 'application/json' })
  });
  if (!res.ok) throw new Error(`Labels fetch failed ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data.res) ? data.res : Array.isArray(data) ? data : [];
  return list;
}

async function ensureLabelIds(labelNames) {
  if (!labelNames || !labelNames.length) return [];
  if (!cachedLabels) cachedLabels = await fetchLabels();
  const nameToId = new Map(cachedLabels.map((l) => [l.name.toLowerCase(), l.id]));
  const colorDefaults = {
    gelb: '#ffee58',
    schwarz: '#90a4ae',
    grün: '#4caf50',
    grun: '#4caf50',
    blau: '#0288d1'
  };
  const needed = [];
  labelNames.forEach((n) => {
    if (!n) return;
    const key = n.toLowerCase();
    if (!nameToId.has(key)) needed.push(n);
  });
  for (const name of needed) {
    const color = colorDefaults[name.toLowerCase()] || '#9e9e9e';
    const res = await fetch(buildUrl('/api/v1/labels'), {
      method: 'POST',
      headers: bearerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, color })
    });
    if (res.ok) {
      const data = await res.json();
      const lbl = data.res || data;
      cachedLabels.push(lbl);
      nameToId.set(lbl.name.toLowerCase(), lbl.id);
    }
  }
  return labelNames
    .map((n) => nameToId.get(n.toLowerCase()))
    .filter((id) => Number.isInteger(id));
}

function normalizeTask(task, idx) {
  const id = task.id || task._id || task.uuid || task.key || `task-${idx + 1}`;
  const title = task.title || task.name || task.summary || `Task ${idx + 1}`;
  const due = task.nextDueDate || task.dueDate || task.due || task.due_at || task.dueAt || task.due_date || null;
  const description = task.description || task.details || task.note || '';
  const status = typeof task.status === 'number' ? task.status : task.completed ? 1 : 0;
  const labels = Array.isArray(task.labelsV2) ? task.labelsV2.map((l) => l.name).filter(Boolean) : [];
  const recurrence = task.frequencyType === 'daily' ? 'täglich' : task.frequencyType === 'weekly' ? 'wöchentlich' : 'einmalig';
  return { id: String(id), title: String(title), due, description, labels, priority: task.priority, recurrence, status, completed: status !== 0 };
}

function isDueInRange(due, range, includeNoDueDate = false) {
  // Tasks without a due date can be treated as "for today" if includeNoDueDate is true
  if (!due) {
    return includeNoDueDate && range === 'today';
  }
  const d = new Date(due);
  if (isNaN(d)) {
    return includeNoDueDate && range === 'today';
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  if (range === 'today') {
    end.setDate(end.getDate() + 1);
  } else {
    // week: current week until Sunday; if today is Sunday, next week Monday-Sunday
    const day = start.getDay(); // 0=Sun
    if (day === 0) {
      start.setDate(start.getDate() + 1);
      end.setDate(start.getDate() + 6);
    } else {
      end.setDate(start.getDate() + (7 - day));
    }
  }
  return d >= start && d < end;
}

async function fetchTasks(range = 'today') {
  // Prefer authenticated API (labels, due dates), fall back to secretkey if login not configured.
  let list = [];
  const useJwt = donotickUsername && donotickPassword;
  if (useJwt) {
    await ensureJwt();
    const res = await fetch(buildUrl('/api/v1/chores/'), {
      headers: bearerHeaders({ Accept: 'application/json' })
    });
    if (!res.ok) {
      throw new Error(`Donotick chores responded ${res.status}`);
    }
    ensureJson(res);
    const data = await res.json();
    list = Array.isArray(data.res) ? data.res : Array.isArray(data) ? data : [];
  } else {
    if (!donotickToken) throw new Error('DONOTICK_TOKEN missing');
    const tryFetch = async (url) =>
      fetch(url, {
        headers: {
          secretkey: donotickToken,
          Accept: 'application/json'
        }
      });
    let url = buildUrl(donotickTodayPath);
    let res = await tryFetch(url);
    if (looksHtml(res)) {
      const withPort = addDefaultPort(donotickBaseUrl);
      url = (withPort.endsWith('/') ? withPort.slice(0, -1) : withPort) + (donotickTodayPath.startsWith('/') ? donotickTodayPath : `/${donotickTodayPath}`);
      res = await tryFetch(url);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Donotick responded ${res.status}: ${text}`);
    }
    ensureJson(res);
    const data = await res.json();
    list = Array.isArray(data)
      ? data
      : Array.isArray(data.res)
      ? data.res
      : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.tasks)
      ? data.tasks
      : [];
  }
  const normalized = list.map((t, idx) => normalizeTask(t, idx));
  // For 'today', include tasks without a due date (they're assumed to be for today)
  if (range === 'today') return normalized.filter((t) => !t.completed && isDueInRange(t.due, 'today', true));
  // For 'week', include tasks due this week + tasks without a due date (they show in "OHNE DATUM")
  if (range === 'week') return normalized.filter((t) => !t.completed && (isDueInRange(t.due, 'week') || !t.due));
  return normalized;
}

async function listAllChores() {
  if (donotickUsername && donotickPassword) {
    await ensureJwt();
    const res = await fetch(buildUrl('/api/v1/chores/'), {
      headers: bearerHeaders({ Accept: 'application/json' })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Donotick responded ${res.status}: ${text}`);
    }
    ensureJson(res);
    const data = await res.json();
    const list = Array.isArray(data.res) ? data.res : Array.isArray(data) ? data : [];
    return list.map((t, idx) => normalizeTask(t, idx));
  }
  // fallback secretkey
  if (!donotickToken) throw new Error('DONOTICK_TOKEN missing');
  const url = buildUrl('/eapi/v1/chore');
  const res = await fetch(url, {
    headers: { secretkey: donotickToken, Accept: 'application/json' }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Donotick responded ${res.status}: ${text}`);
  }
  ensureJson(res);
  const data = await res.json();
  const list = Array.isArray(data) ? data : [];
  return list.map((t, idx) => normalizeTask(t, idx));
}

async function createTask({ title, description = '', dueDate = null, labels = [] }) {
  if (donotickUsername && donotickPassword) {
    await ensureJwt();
    const labelIds = await ensureLabelIds(labels);
    const me = await getCurrentUserId();
    const body = {
      name: title,
      description,
      frequencyType: 'once',
      frequency: 0,
      dueDate: dueDate ? new Date(dueDate).toISOString() : '',
      assignStrategy: 'random',
      assignees: me ? [{ userId: me }] : [],
      assignedTo: me || undefined,
      labelsV2: labelIds.map((id) => ({ id }))
    };
    const res = await fetch(buildUrl('/api/v1/chores'), {
      method: 'POST',
      headers: bearerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Create task failed (${res.status}): ${text}`);
    }
    ensureJson(res);
    return res.json();
  }

  if (!donotickToken) throw new Error('DONOTICK_TOKEN missing');
  const url = buildUrl('/eapi/v1/chore');
  const body = {
    Name: title,
    Description: description,
    DueDate: dueDate ? new Date(dueDate).toISOString() : ''
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      secretkey: donotickToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create task failed (${res.status}): ${text}`);
  }
  ensureJson(res);
  return res.json();
}

async function completeTask(id) {
  // Prefer JWT app API
  if (donotickUsername && donotickPassword) {
    await ensureJwt();
    const res = await fetch(buildUrl(`/api/v1/chores/${id}/do`), {
      method: 'POST',
      headers: bearerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Complete task failed (${res.status}): ${text}`);
    }
    ensureJson(res);
    return res.json();
  }

  if (!donotickToken) throw new Error('DONOTICK_TOKEN missing');
  const url = buildUrl(`/eapi/v1/chore/${id}/complete`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      secretkey: donotickToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Complete task failed (${res.status}): ${text}`);
  }
  ensureJson(res);
  return res.json();
}

module.exports = { fetchTasks, createTask, completeTask, listAllChores };
