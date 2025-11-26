const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const config = require('./config');
const { fetchTasks, createTask, completeTask, listAllChores } = require('./donotick');
const { getTrashReminderTasks, markPrinted, loadCreated, saveCreated } = require('./trash');
const { printTasks, pingPrinter, printWifiQr } = require('./printer');
const { createDailyRunner } = require('./scheduler');
const db = require('./db');

const state = {
  lastRunAt: null,
  lastRunResult: null,
  lastRunError: null
};

async function syncTrashToDonotick() {
  const { earliestPerType } = await getTrashReminderTasks();
  const chores = await listAllChores();
  const existingKeys = new Set(chores.map((c) => `${c.title}-${c.due || ''}`));
  const createdLog = loadCreated();

  // Map summaries to label colors
  const labelMap = {
    'Gelbe Tonne': 'Gelb',
    'Restmuelltonne': 'Schwarz',
    'Restmülltonne': 'Schwarz',
    'Papiertonne': 'Grün',
    'Glas': 'Blau'
  };

  // group by reminder date to avoid multiple tasks on the same day; merge labels
  const grouped = earliestPerType.reduce((acc, r) => {
    const day = r.reminderDate.toISOString().slice(0, 10);
    if (!acc[day]) acc[day] = [];
    acc[day].push(r);
    return acc;
  }, {});

  for (const [day, items] of Object.entries(grouped)) {
    const name = '♻️ Müll raus bringen';
    const key = `${name}-${day}`;
    if (existingKeys.has(key)) continue;
    if (createdLog.dates[day]) continue; // already created previously
    const labels = [
      ...new Set(
        items
          .map((r) => labelMap[r.type] || r.type)
          .filter(Boolean)
      )
    ];
    // choose dueDate as that day's reminder date at 00:00Z (we already have ISO with time)
    await createTask({ title: name, description: '', dueDate: items[0].reminderDate.toISOString(), labels });
    createdLog.dates[day] = { labels, createdAt: new Date().toISOString() };
  }
  saveCreated(createdLog);
}

function log(level, msg, extra) {
  if (['error', 'warn'].includes(level) || config.logLevel === 'info') {
    const time = new Date().toISOString();
    console.log(`[${time}] [${level.toUpperCase()}] ${msg}`, extra || '');
    // Also save to database
    db.addLog(level, msg, extra);
  }
}

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('Request body too large'));
        req.connection.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function gatherTasks(range = 'today') {
  const [donotickTasks, trashData] = await Promise.all([
    fetchTasks(range),
    getTrashReminderTasks().catch(() => ({ tasks: [], earliestPerType: [] }))
  ]);

  const tasks = [...donotickTasks, ...(trashData.tasks || [])];
  return { tasks, trashData };
}

/**
 * Get the week window based on current day.
 * - On Sunday: returns next week (Monday to Sunday)
 * - Otherwise: returns current week from today until Sunday
 */
function getWeekWindow() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  const day = start.getDay(); // 0=Sun
  
  if (day === 0) {
    // Sunday -> show next week (Monday to Sunday)
    start.setDate(start.getDate() + 1);
    end.setDate(start.getDate() + 6);
  } else {
    // Other days -> from today until Sunday
    end.setDate(start.getDate() + (7 - day));
  }
  return { start, end };
}

function formatWeekWindowDe(win) {
  const fmt = (d) => d.toLocaleDateString('de-DE');
  return `${fmt(win.start)} - ${fmt(win.end)}`;
}

async function handleApi(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '';

  if (pathname === '/api/todos/today' && req.method === 'GET') {
    try {
      const { tasks, trashData } = await gatherTasks('today');
      sendJson(res, 200, { tasks, trash: trashData.earliestPerType });
    } catch (err) {
      log('error', 'Failed to fetch today tasks', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  if (pathname === '/api/todos/week' && req.method === 'GET') {
    try {
      const { tasks } = await gatherTasks('week');
      const window = getWeekWindow();
      sendJson(res, 200, { tasks, window });
    } catch (err) {
      log('error', 'Failed to fetch week tasks', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  if (pathname === '/api/trash/preview' && req.method === 'GET') {
    try {
      const { earliestPerType, state } = await getTrashReminderTasks();
      sendJson(res, 200, { upcoming: earliestPerType, printed: state.printed });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  if (pathname === '/api/todos/create' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (!body.title) {
        sendJson(res, 400, { error: 'title is required' });
        return true;
      }
      const created = await createTask({ title: body.title, description: body.description || '', dueDate: body.dueDate || null });
      sendJson(res, 200, { created });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  if (pathname.startsWith('/api/todos/') && pathname.endsWith('/complete') && req.method === 'POST') {
    try {
      const id = pathname.split('/')[3];
      await completeTask(id);
      sendJson(res, 200, { status: 'completed', id });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  if (pathname.startsWith('/api/todos/') && pathname.endsWith('/print') && req.method === 'POST') {
    try {
      const id = pathname.split('/')[3];
      const { tasks } = await gatherTasks('today');
      const task = tasks.find((t) => String(t.id) === id);
      if (!task) {
        sendJson(res, 404, { error: 'Task not found for today' });
        return true;
      }
      const body = await readBody(req).catch(() => ({}));
      const host = body.printerIp || config.printerIp;
      await printTasks({
        host,
        port: body.printerPort || config.printerPort,
        tasks: [task],
        mode: 'single'
      });
      sendJson(res, 200, { status: 'printed', id });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  // Daily summary button - includes morning printed tasks + any current tasks
  if (pathname === '/api/print/daily' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const printerHost = body.printerIp || config.printerIp;
      
      // Get current tasks from API
      const { tasks: currentTasks } = await gatherTasks('today');
      
      // Get tasks that were printed this morning (already marked done)
      const morningTasks = db.getMorningTasks();
      
      // Merge: morning tasks + current tasks (avoid duplicates by ID)
      const seenIds = new Set();
      const allTasks = [];
      
      // Add morning tasks first (they were printed earlier)
      for (const t of morningTasks) {
        if (!seenIds.has(String(t.id))) {
          seenIds.add(String(t.id));
          allTasks.push({ ...t, completedThisMorning: true });
        }
      }
      
      // Add current tasks that weren't in morning batch
      for (const t of currentTasks) {
        if (!seenIds.has(String(t.id))) {
          seenIds.add(String(t.id));
          allTasks.push(t);
        }
      }
      
      if (!allTasks.length) {
        sendJson(res, 200, { status: 'no-tasks' });
        return true;
      }
      
      // Print daily SUMMARY (dense list)
      await printTasks({
        host: printerHost,
        port: body.printerPort || config.printerPort,
        tasks: allTasks,
        mode: 'daily'
      });
      
      // Note: We do NOT complete tasks here - they were already completed in morning print
      // or the user wants them to stay as-is
      
      sendJson(res, 200, { status: 'printed', count: allTasks.length, morningCount: morningTasks.length });
    } catch (err) {
      log('error', 'Manual daily print failed', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  // Weekly summary button - from now until Sunday (or next week on Sunday)
  if (pathname === '/api/print/weekly' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const printerHost = body.printerIp || config.printerIp;
      const { tasks } = await gatherTasks('week');
      
      if (!tasks.length) {
        sendJson(res, 200, { status: 'no-tasks' });
        return true;
      }
      
      const weekWin = formatWeekWindowDe(getWeekWindow());
      await printTasks({
        host: printerHost,
        port: body.printerPort || config.printerPort,
        tasks,
        mode: 'weekly',
        weekRange: weekWin
      });
      sendJson(res, 200, { status: 'printed', count: tasks.length });
    } catch (err) {
      log('error', 'Manual weekly print failed', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  if (pathname === '/api/printer/status' && req.method === 'GET') {
    const ip = parsed.query.printerIp || config.printerIp;
    const result = await pingPrinter(ip);
    sendJson(res, 200, { ip, ...result });
    return true;
  }

  if (pathname === '/api/printer/test' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const host = body.printerIp || config.printerIp;
      const port = body.printerPort || config.printerPort;
      await printTasks({
        host,
        port,
        tasks: [{ id: 'test', title: 'Test Print', description: 'Printer is working!', labels: ['Test'], priority: 3 }],
        mode: 'single'
      });
      sendJson(res, 200, { status: 'ok' });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  // Print WiFi QR code
  if (pathname === '/api/print/wifi' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { ssid, password, type, hidden } = body;
      
      if (!ssid) {
        sendJson(res, 400, { error: 'SSID is required' });
        return true;
      }
      
      await printWifiQr({
        host: config.printerIp,
        port: config.printerPort,
        ssid,
        password,
        type: type || 'WPA',
        hidden: !!hidden
      });
      
      log('info', `Printed WiFi QR code for "${ssid}"`);
      sendJson(res, 200, { status: 'printed', ssid });
    } catch (err) {
      log('error', 'WiFi QR print failed', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  if (pathname === '/api/trash/sync' && req.method === 'POST') {
    try {
      await syncTrashToDonotick();
      sendJson(res, 200, { status: 'synced' });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  if (pathname === '/api/status' && req.method === 'GET') {
    sendJson(res, 200, {
      dailyPrintTime: config.dailyPrintTime,
      printerIp: config.printerIp,
      lastRunAt: state.lastRunAt,
      lastRunResult: state.lastRunResult,
      lastRunError: state.lastRunError
    });
    return true;
  }

  // Logs API
  if (pathname === '/api/logs' && req.method === 'GET') {
    const limit = parseInt(parsed.query.limit) || 50;
    sendJson(res, 200, { logs: db.getLogs(limit) });
    return true;
  }

  if (pathname === '/api/logs/clear' && req.method === 'POST') {
    db.clearLogs();
    sendJson(res, 200, { status: 'cleared' });
    return true;
  }

  // Config API
  if (pathname === '/api/config' && req.method === 'GET') {
    const cfg = config.getAll();
    // Don't expose password in full, just indicate if set
    const safe = {
      ...cfg,
      donotickPassword: cfg.donotickPassword ? '********' : '',
      donotickToken: cfg.donotickToken ? '********' : ''
    };
    sendJson(res, 200, { config: safe });
    return true;
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const updates = {};
      
      // Whitelist of allowed config keys
      const allowed = [
        'donotickBaseUrl', 'donotickUsername', 'donotickPassword', 'donotickToken',
        'printerIp', 'printerPort',
        'dailyPrintTime', 'weeklyPrintTime', 'weeklyPrintDay',
        'trashIcalUrl', 'trashEnable',
        'logLevel'
      ];
      
      for (const key of allowed) {
        if (body[key] !== undefined) {
          // Don't update password if it's the masked value
          if ((key === 'donotickPassword' || key === 'donotickToken') && body[key] === '********') {
            continue;
          }
          updates[key] = body[key];
        }
      }
      
      if (Object.keys(updates).length > 0) {
        config.setMultiple(updates);
        log('info', `Config updated: ${Object.keys(updates).join(', ')}`);
      }
      
      sendJson(res, 200, { status: 'updated', keys: Object.keys(updates) });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  // ============ Shopping List API ============

  // Get all storage items (sorted by usage)
  if (pathname === '/api/shopping/items' && req.method === 'GET') {
    const query = parsed.query.q || '';
    const items = query ? db.searchShoppingItems(query) : db.getShoppingItems();
    sendJson(res, 200, { items, units: db.UNIT_TYPES });
    return true;
  }

  // Add new item to storage
  if (pathname === '/api/shopping/items' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (!body.name) {
        sendJson(res, 400, { error: 'name is required' });
        return true;
      }
      // Check if item already exists
      const existing = db.findShoppingItemByName(body.name);
      if (existing) {
        sendJson(res, 200, { item: existing, existed: true });
        return true;
      }
      const item = db.addShoppingItem(body.name, body.unit || 'st');
      sendJson(res, 200, { item, created: true });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  // Update an item
  if (pathname.match(/^\/api\/shopping\/items\/[^/]+$/) && req.method === 'PATCH') {
    try {
      const id = pathname.split('/')[4];
      const body = await readBody(req);
      const item = db.updateShoppingItem(id, body);
      if (!item) {
        sendJson(res, 404, { error: 'Item not found' });
        return true;
      }
      sendJson(res, 200, { item });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  // Delete an item
  if (pathname.match(/^\/api\/shopping\/items\/[^/]+$/) && req.method === 'DELETE') {
    const id = pathname.split('/')[4];
    db.deleteShoppingItem(id);
    sendJson(res, 200, { status: 'deleted' });
    return true;
  }

  // Get current shopping list
  if (pathname === '/api/shopping/list' && req.method === 'GET') {
    sendJson(res, 200, { list: db.getShoppingList() });
    return true;
  }

  // Add item to shopping list
  if (pathname === '/api/shopping/list' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (!body.itemId) {
        sendJson(res, 400, { error: 'itemId is required' });
        return true;
      }
      const list = db.addToShoppingList(body.itemId, body.quantity || 1);
      sendJson(res, 200, { list });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  // Update quantity in shopping list
  if (pathname.match(/^\/api\/shopping\/list\/[^/]+$/) && req.method === 'PATCH') {
    try {
      const itemId = pathname.split('/')[4];
      const body = await readBody(req);
      const list = db.updateShoppingListQuantity(itemId, body.quantity);
      sendJson(res, 200, { list });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  // Remove item from shopping list
  if (pathname.match(/^\/api\/shopping\/list\/[^/]+$/) && req.method === 'DELETE') {
    const itemId = pathname.split('/')[4];
    const list = db.removeFromShoppingList(itemId);
    sendJson(res, 200, { list });
    return true;
  }

  // Reset shopping list (clear and re-add "always" items)
  if (pathname === '/api/shopping/list/reset' && req.method === 'POST') {
    const list = db.resetShoppingList();
    sendJson(res, 200, { list });
    return true;
  }

  // Get all collections
  if (pathname === '/api/shopping/collections' && req.method === 'GET') {
    sendJson(res, 200, { collections: db.getCollections() });
    return true;
  }

  // Get single collection with item details
  if (pathname.match(/^\/api\/shopping\/collections\/[^/]+$/) && req.method === 'GET') {
    const id = pathname.split('/')[4];
    const collection = db.getCollection(id);
    if (!collection) {
      sendJson(res, 404, { error: 'Collection not found' });
      return true;
    }
    sendJson(res, 200, { collection });
    return true;
  }

  // Create new collection
  if (pathname === '/api/shopping/collections' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (!body.name) {
        sendJson(res, 400, { error: 'name is required' });
        return true;
      }
      const collection = db.createCollection(body.name, body.items || []);
      sendJson(res, 200, { collection });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  // Update collection
  if (pathname.match(/^\/api\/shopping\/collections\/[^/]+$/) && req.method === 'PATCH') {
    try {
      const id = pathname.split('/')[4];
      const body = await readBody(req);
      const collection = db.updateCollection(id, body);
      if (!collection) {
        sendJson(res, 404, { error: 'Collection not found' });
        return true;
      }
      sendJson(res, 200, { collection });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  // Delete collection
  if (pathname.match(/^\/api\/shopping\/collections\/[^/]+$/) && req.method === 'DELETE') {
    const id = pathname.split('/')[4];
    db.deleteCollection(id);
    sendJson(res, 200, { status: 'deleted' });
    return true;
  }

  // Apply collection to shopping list
  if (pathname.match(/^\/api\/shopping\/collections\/[^/]+\/apply$/) && req.method === 'POST') {
    const id = pathname.split('/')[4];
    const list = db.applyCollection(id);
    if (!list) {
      sendJson(res, 404, { error: 'Collection not found' });
      return true;
    }
    sendJson(res, 200, { list });
    return true;
  }

  // Save current list as collection
  if (pathname === '/api/shopping/list/save-as-collection' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (!body.name) {
        sendJson(res, 400, { error: 'name is required' });
        return true;
      }
      const collection = db.saveListAsCollection(body.name);
      sendJson(res, 200, { collection });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  // Print shopping list
  if (pathname === '/api/shopping/print' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const list = db.getShoppingList();
      if (!list.length) {
        sendJson(res, 200, { status: 'empty' });
        return true;
      }
      const printerHost = body.printerIp || config.printerIp;
      // Format items for printing
      const items = list.map(entry => ({
        title: `${db.formatQuantity(entry.quantity, entry.item.unit)} ${entry.item.name}`,
        labels: []
      }));
      await printTasks({
        host: printerHost,
        port: body.printerPort || config.printerPort,
        tasks: items,
        mode: 'daily',
        headerTitle: 'EINKAUFSLISTE'
      });
      sendJson(res, 200, { status: 'printed', count: list.length });
    } catch (err) {
      log('error', 'Shopping list print failed', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return true;
  }

  return false;
}

function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  let pathname = parsed.pathname;
  if (!pathname || pathname === '/') pathname = '/index.html';

  // Serve from built Vue app (frontend/dist) or public folder for static assets
  const roots = [path.join(__dirname, '..', 'frontend', 'dist'), path.join(__dirname, '..', 'public')];
  let foundPath = null;
  for (const root of roots) {
    const candidate = path.join(root, pathname);
    if (!candidate.startsWith(root)) continue; // path traversal guard
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      foundPath = candidate;
      break;
    }
  }

  if (!foundPath) {
    // SPA fallback: serve index.html for Vue Router to handle
    const spaIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
    if (fs.existsSync(spaIndex)) {
      foundPath = spaIndex;
    } else {
      res.writeHead(404);
      res.end('Not found - run "bun run build" in frontend/ to build the Vue app');
      return;
    }
  }

  const ext = path.extname(foundPath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
  };
  const type = mimeTypes[ext] || 'text/plain';
  fs.readFile(foundPath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

/**
 * Morning automatic print:
 * - Prints each task individually (with QR code)
 * - Marks them as done in Donotick
 * - Records them in dailyState so the daily summary button can include them
 * - On Monday: also prints the weekly summary
 */
async function runMorningPrint() {
  try {
    const { tasks, trashData } = await gatherTasks('today');
    const now = new Date();
    const isMonday = now.getDay() === 1;
    
    if (!tasks.length && !isMonday) {
      state.lastRunAt = new Date().toISOString();
      state.lastRunResult = 'No tasks to print';
      state.lastRunError = null;
      log('info', state.lastRunResult);
      return;
    }
    
    // Record tasks BEFORE marking them done (so we remember them)
    if (tasks.length) {
      db.recordMorningTasks(tasks);
    }
    
    // Print each task individually (hype mode with QR code)
    for (const task of tasks) {
      await printTasks({
        host: config.printerIp,
        port: config.printerPort,
        tasks: [task],
        mode: 'single'
      });
    }
    
    // Mark Donotick tasks as done (only numeric IDs from Donotick, not trash UIDs)
    const donotickIds = tasks
      .filter((t) => /^\d+$/.test(String(t.id)))
      .map((t) => t.id);
    
    if (donotickIds.length) {
      await Promise.allSettled(donotickIds.map((id) => completeTask(id)));
    }
    
    // Mark trash tasks as printed
    markPrinted((trashData.tasks || []).map((t) => t.uid));
    
    // On Monday: also print the weekly summary
    if (isMonday) {
      const { tasks: weekTasks } = await gatherTasks('week');
      if (weekTasks.length) {
        const weekWin = formatWeekWindowDe(getWeekWindow());
        await printTasks({
          host: config.printerIp,
          port: config.printerPort,
          tasks: weekTasks,
          mode: 'weekly',
          weekRange: weekWin
        });
        log('info', `Printed weekly summary with ${weekTasks.length} tasks`);
      }
    }
    
    state.lastRunAt = new Date().toISOString();
    state.lastRunResult = `Printed ${tasks.length} tasks${isMonday ? ' + weekly summary' : ''}`;
    state.lastRunError = null;
    log('info', state.lastRunResult);
  } catch (err) {
    state.lastRunAt = new Date().toISOString();
    state.lastRunError = err.message;
    log('error', 'Morning print failed', err.message);
  }
}

/**
 * Sunday automatic print:
 * - Prints the weekly summary for NEXT week
 */
async function runSundayWeeklyPrint() {
  try {
    // On Sunday, getWeekWindow() returns next week (Monday-Sunday)
    const { tasks } = await gatherTasks('week');
    if (!tasks.length) {
      log('info', 'No tasks for next week');
      return;
    }
    
    const weekWin = formatWeekWindowDe(getWeekWindow());
    await printTasks({
      host: config.printerIp,
      port: config.printerPort,
      tasks,
      mode: 'weekly',
      weekRange: `Nächste Woche: ${weekWin}`
    });
    
    log('info', `Sunday: Printed next week summary with ${tasks.length} tasks`);
  } catch (err) {
    log('error', 'Sunday weekly print failed', err.message);
  }
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    if (req.url && req.url.startsWith('/api/')) {
      const handled = await handleApi(req, res);
      if (!handled) {
        sendJson(res, 404, { error: 'Not found' });
      }
      return;
    }
    serveStatic(req, res);
  });

  server.listen(config.serverPort, () => {
    log('info', `Server running on http://localhost:${config.serverPort}`);
  });

  server.on('error', (err) => {
    log('error', `Server failed: ${err.message}`);
    process.exit(1);
  });
}

startServer();

// Morning print: runs every day at configured time
// Prints individual tasks + weekly summary on Monday
createDailyRunner(runMorningPrint, config.dailyPrintTime);

// Sunday weekly print: runs on Sunday to print next week's summary
createDailyRunner(
  runSundayWeeklyPrint,
  config.weeklyPrintTime,
  (now) => now.getDay() === 0 // Only on Sunday
);

// Hourly trash sync
setInterval(() => {
  syncTrashToDonotick().catch((err) => log('error', 'Trash sync failed', err.message));
}, 60 * 60 * 1000);

module.exports = { runMorningPrint };
