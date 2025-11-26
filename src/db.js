/**
 * Unified database for all application state.
 * Consolidates: config, daily printed tasks, trash state, trash cache, and activity logs.
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const MAX_LOG_ENTRIES = 200;

// Predefined unit types for shopping items
const UNIT_TYPES = {
  st: { name: 'Stück', short: 'St.', isWeight: false, isVolume: false },
  dose: { name: 'Dose', short: 'Dose', isWeight: false, isVolume: false },
  glas: { name: 'Glas', short: 'Glas', isWeight: false, isVolume: false },
  pack: { name: 'Packung', short: 'Pkg.', isWeight: false, isVolume: false },
  flasche: { name: 'Flasche', short: 'Fl.', isWeight: false, isVolume: false },
  beutel: { name: 'Beutel', short: 'Btl.', isWeight: false, isVolume: false },
  becher: { name: 'Becher', short: 'Bch.', isWeight: false, isVolume: false },
  kasten: { name: 'Kasten', short: 'Kst.', isWeight: false, isVolume: false },
  karton: { name: 'Karton', short: 'Krt.', isWeight: false, isVolume: false },
  bund: { name: 'Bund', short: 'Bund', isWeight: false, isVolume: false },
  g: { name: 'Gramm', short: 'g', isWeight: true, isVolume: false, base: 'g' },
  kg: { name: 'Kilogramm', short: 'kg', isWeight: true, isVolume: false, base: 'g', factor: 1000 },
  ml: { name: 'Milliliter', short: 'ml', isWeight: false, isVolume: true, base: 'ml' },
  l: { name: 'Liter', short: 'L', isWeight: false, isVolume: true, base: 'ml', factor: 1000 }
};

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
    // Shopping list
    shopping: {
      items: [],        // All items in storage { id, name, unit, usageCount, alwaysOnList, alwaysQuantity, createdAt }
      list: [],         // Current shopping list { itemId, quantity, addedAt }
      collections: []   // Saved presets { id, name, items: [{ itemId, quantity }], createdAt }
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
      shopping: {
        items: data.shopping?.items || [],
        list: data.shopping?.list || [],
        collections: data.shopping?.collections || []
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

// ============ Shopping List ============

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// Get all storage items sorted by usage count (most used first)
function getShoppingItems() {
  const db = loadDb();
  return [...(db.shopping.items || [])].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
}

// Add new item to storage
function addShoppingItem(name, unit = 'st') {
  const db = loadDb();
  const id = generateId();
  const item = {
    id,
    name: name.trim(),
    unit,
    usageCount: 0,
    alwaysOnList: false,
    alwaysQuantity: 1,
    createdAt: new Date().toISOString()
  };
  db.shopping.items.push(item);
  saveDb(db);
  return item;
}

// Update an item
function updateShoppingItem(id, updates) {
  const db = loadDb();
  const idx = db.shopping.items.findIndex(i => i.id === id);
  if (idx === -1) return null;
  db.shopping.items[idx] = { ...db.shopping.items[idx], ...updates };
  saveDb(db);
  return db.shopping.items[idx];
}

// Delete an item (also removes from list and collections)
function deleteShoppingItem(id) {
  const db = loadDb();
  db.shopping.items = db.shopping.items.filter(i => i.id !== id);
  db.shopping.list = db.shopping.list.filter(l => l.itemId !== id);
  db.shopping.collections.forEach(c => {
    c.items = c.items.filter(i => i.itemId !== id);
  });
  saveDb(db);
}

// Find item by name (case-insensitive)
function findShoppingItemByName(name) {
  const db = loadDb();
  const lower = name.toLowerCase().trim();
  return db.shopping.items.find(i => i.name.toLowerCase() === lower);
}

// Search items (fuzzy)
function searchShoppingItems(query) {
  const db = loadDb();
  const lower = query.toLowerCase().trim();
  if (!lower) return getShoppingItems();
  return db.shopping.items
    .filter(i => i.name.toLowerCase().includes(lower))
    .sort((a, b) => {
      // Exact match first, then by usage count
      const aExact = a.name.toLowerCase() === lower ? 1 : 0;
      const bExact = b.name.toLowerCase() === lower ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return (b.usageCount || 0) - (a.usageCount || 0);
    });
}

// Get current shopping list with item details
function getShoppingList() {
  const db = loadDb();
  const items = db.shopping.items || [];
  return (db.shopping.list || []).map(entry => {
    const item = items.find(i => i.id === entry.itemId);
    return {
      ...entry,
      item: item || { id: entry.itemId, name: '(deleted)', unit: 'st' }
    };
  });
}

// Add item to shopping list (or increase quantity if exists)
function addToShoppingList(itemId, quantity = 1) {
  const db = loadDb();
  const existing = db.shopping.list.find(l => l.itemId === itemId);
  if (existing) {
    existing.quantity = (existing.quantity || 1) + quantity;
  } else {
    db.shopping.list.push({
      itemId,
      quantity,
      addedAt: new Date().toISOString()
    });
    // Increment usage count
    const item = db.shopping.items.find(i => i.id === itemId);
    if (item) item.usageCount = (item.usageCount || 0) + 1;
  }
  saveDb(db);
  return getShoppingList();
}

// Update quantity in shopping list
function updateShoppingListQuantity(itemId, quantity) {
  const db = loadDb();
  const entry = db.shopping.list.find(l => l.itemId === itemId);
  if (entry) {
    if (quantity <= 0) {
      db.shopping.list = db.shopping.list.filter(l => l.itemId !== itemId);
    } else {
      entry.quantity = quantity;
    }
    saveDb(db);
  }
  return getShoppingList();
}

// Remove item from shopping list
function removeFromShoppingList(itemId) {
  const db = loadDb();
  db.shopping.list = db.shopping.list.filter(l => l.itemId !== itemId);
  saveDb(db);
  return getShoppingList();
}

// Clear shopping list and re-add "always on list" items
function resetShoppingList() {
  const db = loadDb();
  db.shopping.list = [];
  // Add back "always on list" items
  db.shopping.items.filter(i => i.alwaysOnList).forEach(item => {
    db.shopping.list.push({
      itemId: item.id,
      quantity: item.alwaysQuantity || 1,
      addedAt: new Date().toISOString()
    });
    item.usageCount = (item.usageCount || 0) + 1;
  });
  saveDb(db);
  return getShoppingList();
}

// ============ Collections ============

function getCollections() {
  const db = loadDb();
  return db.shopping.collections || [];
}

function getCollection(id) {
  const db = loadDb();
  const collection = db.shopping.collections.find(c => c.id === id);
  if (!collection) return null;
  // Populate item details
  const items = db.shopping.items || [];
  return {
    ...collection,
    items: collection.items.map(entry => ({
      ...entry,
      item: items.find(i => i.id === entry.itemId) || { id: entry.itemId, name: '(deleted)', unit: 'st' }
    }))
  };
}

function createCollection(name, items = []) {
  const db = loadDb();
  const id = generateId();
  const collection = {
    id,
    name: name.trim(),
    items: items.map(i => ({ itemId: i.itemId, quantity: i.quantity || 1 })),
    createdAt: new Date().toISOString()
  };
  db.shopping.collections.push(collection);
  saveDb(db);
  return collection;
}

function updateCollection(id, updates) {
  const db = loadDb();
  const idx = db.shopping.collections.findIndex(c => c.id === id);
  if (idx === -1) return null;
  if (updates.items) {
    updates.items = updates.items.map(i => ({ itemId: i.itemId, quantity: i.quantity || 1 }));
  }
  db.shopping.collections[idx] = { ...db.shopping.collections[idx], ...updates };
  saveDb(db);
  return db.shopping.collections[idx];
}

function deleteCollection(id) {
  const db = loadDb();
  db.shopping.collections = db.shopping.collections.filter(c => c.id !== id);
  saveDb(db);
}

// Add all items from a collection to the shopping list
function applyCollection(id) {
  const db = loadDb();
  const collection = db.shopping.collections.find(c => c.id === id);
  if (!collection) return null;
  
  collection.items.forEach(({ itemId, quantity }) => {
    const existing = db.shopping.list.find(l => l.itemId === itemId);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + (quantity || 1);
    } else {
      db.shopping.list.push({
        itemId,
        quantity: quantity || 1,
        addedAt: new Date().toISOString()
      });
      // Increment usage count
      const item = db.shopping.items.find(i => i.id === itemId);
      if (item) item.usageCount = (item.usageCount || 0) + 1;
    }
  });
  saveDb(db);
  return getShoppingList();
}

// Save current shopping list as a collection
function saveListAsCollection(name) {
  const db = loadDb();
  const items = db.shopping.list.map(l => ({
    itemId: l.itemId,
    quantity: l.quantity || 1
  }));
  return createCollection(name, items);
}

// Format quantity with unit for display
function formatQuantity(quantity, unit) {
  const unitInfo = UNIT_TYPES[unit] || UNIT_TYPES.st;
  
  // Auto-convert large values (e.g., 1500g -> 1.5kg)
  if (unitInfo.isWeight && unit === 'g' && quantity >= 1000) {
    return `${(quantity / 1000).toFixed(quantity % 1000 === 0 ? 0 : 1)} kg`;
  }
  if (unitInfo.isVolume && unit === 'ml' && quantity >= 1000) {
    return `${(quantity / 1000).toFixed(quantity % 1000 === 0 ? 0 : 1)} L`;
  }
  
  // Regular format
  if (unitInfo.isWeight || unitInfo.isVolume) {
    return `${quantity} ${unitInfo.short}`;
  }
  
  // Count-based units
  if (quantity === 1) {
    return `1 ${unitInfo.name}`;
  }
  return `${quantity}x ${unitInfo.name}`;
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
  
  // Shopping - Items
  getShoppingItems,
  addShoppingItem,
  updateShoppingItem,
  deleteShoppingItem,
  findShoppingItemByName,
  searchShoppingItems,
  
  // Shopping - List
  getShoppingList,
  addToShoppingList,
  updateShoppingListQuantity,
  removeFromShoppingList,
  resetShoppingList,
  
  // Shopping - Collections
  getCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  applyCollection,
  saveListAsCollection,
  
  // Shopping - Utils
  formatQuantity,
  UNIT_TYPES,
  
  // Logs
  addLog,
  getLogs,
  clearLogs,
  
  // Raw access (for debugging)
  loadDb,
  saveDb
};
