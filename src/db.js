/**
 * Unified database for all application state.
 * Consolidates: config, daily printed tasks, trash state, trash cache, and activity logs.
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const MAX_LOG_ENTRIES = 200;

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getDefaultConfig() {
  return {
    // Donotick connection
    donotickBaseUrl: 'http://192.168.50.250:2021',
    donotickUsername: '',
    donotickPassword: '',
    donotickToken: '',
    
    // Printer settings
    printerIp: '192.168.50.100',
    printerPort: 9100,
    
    // Schedule settings
    dailyPrintTime: '08:00',
    weeklyPrintTime: '08:00',
    weeklyPrintDay: 0, // 0=Sunday
    
    // Trash calendar
    trashIcalUrl: '',
    trashEnable: true,
    
    // Server
    serverPort: 3000,
    logLevel: 'info'
  };
}

function getDefaultDb() {
  return {
    // Configuration (editable via UI)
    config: getDefaultConfig(),
    
    // Daily printed tasks (resets each day)
    daily: {
      date: null,
      tasks: []
    },
    // Trash reminder state
    trash: {
      printed: {},      // uid -> timestamp when printed
      created: {},      // date -> { labels, createdAt } for synced Donotick tasks
      cache: {
        fetchedAt: 0,
        events: []
      }
    },
    // Activity log
    logs: []
  };
}

function loadDb() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    return getDefaultDb();
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    // Ensure all sections exist (for migration from old format)
    return {
      config: { ...getDefaultConfig(), ...(data.config || {}) },
      daily: data.daily || getDefaultDb().daily,
      trash: {
        printed: data.trash?.printed || {},
        created: data.trash?.created || {},
        cache: data.trash?.cache || { fetchedAt: 0, events: [] }
      },
      logs: data.logs || []
    };
  } catch {
    return getDefaultDb();
  }
}

function saveDb(db) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ============ Configuration ============

function getConfig() {
  const db = loadDb();
  return { ...getDefaultConfig(), ...db.config };
}

function setConfig(updates) {
  const db = loadDb();
  db.config = { ...db.config, ...updates };
  saveDb(db);
  return db.config;
}

function getConfigValue(key) {
  const config = getConfig();
  return config[key];
}

function setConfigValue(key, value) {
  const db = loadDb();
  db.config[key] = value;
  saveDb(db);
  return value;
}

// ============ Daily State ============

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function recordMorningTasks(tasks) {
  const db = loadDb();
  db.daily = {
    date: todayStr(),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      due: t.due,
      labels: t.labels || [],
      priority: t.priority,
      recurrence: t.recurrence,
      printedAt: new Date().toISOString()
    }))
  };
  saveDb(db);
  return db.daily;
}

function getMorningTasks() {
  const db = loadDb();
  if (db.daily.date !== todayStr()) {
    return [];
  }
  return db.daily.tasks || [];
}

function clearMorningTasks() {
  const db = loadDb();
  db.daily = { date: null, tasks: [] };
  saveDb(db);
}

// ============ Trash State ============

function getTrashPrinted() {
  const db = loadDb();
  return db.trash.printed || {};
}

function markTrashPrinted(uids) {
  const db = loadDb();
  const now = new Date().toISOString();
  uids.forEach((uid) => {
    db.trash.printed[uid] = now;
  });
  saveDb(db);
}

function getTrashCreated() {
  const db = loadDb();
  return { dates: db.trash.created || {} };
}

function saveTrashCreated(data) {
  const db = loadDb();
  db.trash.created = data.dates || {};
  saveDb(db);
}

function getTrashCache() {
  const db = loadDb();
  return db.trash.cache || { fetchedAt: 0, events: [] };
}

function saveTrashCache(cache) {
  const db = loadDb();
  db.trash.cache = cache;
  saveDb(db);
}

// ============ Activity Logs ============

function addLog(level, message, extra = null) {
  const db = loadDb();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    extra
  };
  db.logs.unshift(entry);
  // Keep only last N entries
  if (db.logs.length > MAX_LOG_ENTRIES) {
    db.logs = db.logs.slice(0, MAX_LOG_ENTRIES);
  }
  saveDb(db);
  return entry;
}

function getLogs(limit = 50) {
  const db = loadDb();
  return (db.logs || []).slice(0, limit);
}

function clearLogs() {
  const db = loadDb();
  db.logs = [];
  saveDb(db);
}

// ============ Migration ============

function migrateOldFiles() {
  const dataDir = path.join(__dirname, '..', 'data');
  let migrated = false;
  const db = loadDb();

  // Migrate daily-printed.json
  const dailyPath = path.join(dataDir, 'daily-printed.json');
  if (fs.existsSync(dailyPath)) {
    try {
      const old = JSON.parse(fs.readFileSync(dailyPath, 'utf8'));
      if (old.date && old.tasks) {
        db.daily = old;
        migrated = true;
      }
      fs.unlinkSync(dailyPath);
    } catch {}
  }

  // Migrate trash-state.json
  const statePath = path.join(dataDir, 'trash-state.json');
  if (fs.existsSync(statePath)) {
    try {
      const old = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (old.printed) {
        db.trash.printed = { ...db.trash.printed, ...old.printed };
        migrated = true;
      }
      fs.unlinkSync(statePath);
    } catch {}
  }

  // Migrate trash-created.json
  const createdPath = path.join(dataDir, 'trash-created.json');
  if (fs.existsSync(createdPath)) {
    try {
      const old = JSON.parse(fs.readFileSync(createdPath, 'utf8'));
      if (old.dates) {
        db.trash.created = { ...db.trash.created, ...old.dates };
        migrated = true;
      }
      fs.unlinkSync(createdPath);
    } catch {}
  }

  // Migrate trash-cache.json
  const cachePath = path.join(dataDir, 'trash-cache.json');
  if (fs.existsSync(cachePath)) {
    try {
      const old = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (old.fetchedAt) {
        db.trash.cache = old;
        migrated = true;
      }
      fs.unlinkSync(cachePath);
    } catch {}
  }

  if (migrated) {
    saveDb(db);
    console.log('[DB] Migrated old state files to unified database');
  }
}

// Run migration on module load
migrateOldFiles();

module.exports = {
  // Config
  getConfig,
  setConfig,
  getConfigValue,
  setConfigValue,
  getDefaultConfig,
  
  // Daily
  recordMorningTasks,
  getMorningTasks,
  clearMorningTasks,
  todayStr,
  
  // Trash
  getTrashPrinted,
  markTrashPrinted,
  getTrashCreated,
  saveTrashCreated,
  getTrashCache,
  saveTrashCache,
  
  // Logs
  addLog,
  getLogs,
  clearLogs,
  
  // Raw access (for debugging)
  loadDb,
  saveDb
};
