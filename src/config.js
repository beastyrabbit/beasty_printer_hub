/**
 * Configuration management.
 * Priority: Database > Environment Variables > Defaults
 * 
 * On first run, env vars are migrated to database.
 * After that, all config is managed via the web UI.
 */
const fs = require('fs');
const path = require('path');

// Load .env file manually (before requiring db.js)
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  });
}

loadEnvFile();

const env = process.env;

function readEnv(name, fallback) {
  const v = env[name] && env[name].trim() !== '' ? env[name].trim() : fallback;
  if (typeof v === 'string' && v.length >= 2) {
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
  }
  return v;
}

// Get env-based config (used for migration and fallback)
function getEnvConfig() {
  return {
    donotickBaseUrl: readEnv('DONOTICK_BASE_URL', ''),
    donotickUsername: readEnv('DONOTICK_USERNAME', ''),
    donotickPassword: readEnv('DONOTICK_PASSWORD', ''),
    donotickToken: readEnv('DONOTICK_TOKEN', ''),
    printerIp: readEnv('PRINTER_IP', ''),
    printerPort: Number(readEnv('PRINTER_PORT', 9100)),
    dailyPrintTime: readEnv('DAILY_PRINT_TIME', '08:00'),
    weeklyPrintTime: readEnv('WEEKLY_PRINT_TIME', '08:00'),
    weeklyPrintDay: Number(readEnv('WEEKLY_PRINT_DAY', 0)),
    trashIcalUrl: readEnv('TRASH_ICAL_URL', ''),
    trashEnable: readEnv('TRASH_ENABLE', 'true') === 'true',
    serverPort: Number(readEnv('PORT', 3000)),
    logLevel: readEnv('LOG_LEVEL', 'info')
  };
}

// Now we can require db.js
const db = require('./db');

// Migrate env config to database on first run
function migrateEnvToDb() {
  const dbConfig = db.getConfig();
  const envConfig = getEnvConfig();
  let migrated = false;
  const updates = {};

  // Only migrate values that are set in env but not in db
  for (const [key, envValue] of Object.entries(envConfig)) {
    const dbValue = dbConfig[key];
    const defaultValue = db.getDefaultConfig()[key];
    
    // Migrate if: env has a value AND db is still at default
    if (envValue && envValue !== '' && dbValue === defaultValue) {
      updates[key] = envValue;
      migrated = true;
    }
  }

  if (migrated) {
    db.setConfig(updates);
    console.log('[CONFIG] Migrated environment variables to database:', Object.keys(updates).join(', '));
  }
}

migrateEnvToDb();

// Create a config proxy that reads from DB
function createConfig() {
  const cache = { _lastLoad: 0, _data: null };
  const CACHE_TTL = 1000; // 1 second cache to avoid excessive disk reads

  function getLatest() {
    const now = Date.now();
    if (!cache._data || now - cache._lastLoad > CACHE_TTL) {
      cache._data = db.getConfig();
      cache._lastLoad = now;
    }
    return cache._data;
  }

  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'reload') {
        return () => {
          cache._data = null;
          cache._lastLoad = 0;
        };
      }
      if (prop === 'getAll') {
        return () => getLatest();
      }
      if (prop === 'set') {
        return (key, value) => {
          db.setConfigValue(key, value);
          cache._data = null; // Invalidate cache
        };
      }
      if (prop === 'setMultiple') {
        return (updates) => {
          db.setConfig(updates);
          cache._data = null; // Invalidate cache
        };
      }
      // timezone is computed, not stored
      if (prop === 'timezone') {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      }
      // Legacy path properties
      if (prop === 'donotickTodayPath') return '/eapi/v1/chore';
      if (prop === 'donotickWeekPath') return '/eapi/v1/chore';
      
      const config = getLatest();
      return config[prop];
    },
    set(target, prop, value) {
      db.setConfigValue(prop, value);
      cache._data = null;
      return true;
    }
  });
}

const config = createConfig();

// Validate config on load
function validateConfig() {
  const cfg = config.getAll();
  const warnings = [];

  // Check Donotick auth
  if (!cfg.donotickUsername && !cfg.donotickToken) {
    warnings.push('No Donotick auth configured - set username/password or token in Settings');
  }

  // Check time format
  const timeRegex = /^\d{1,2}:\d{2}$/;
  if (cfg.dailyPrintTime && !timeRegex.test(cfg.dailyPrintTime)) {
    warnings.push(`Daily print time "${cfg.dailyPrintTime}" is not valid (use HH:MM format)`);
  }
  if (cfg.weeklyPrintTime && !timeRegex.test(cfg.weeklyPrintTime)) {
    warnings.push(`Weekly print time "${cfg.weeklyPrintTime}" is not valid (use HH:MM format)`);
  }

  // Print warnings (don't exit - let user fix via UI)
  warnings.forEach((w) => console.warn(`[CONFIG WARNING] ${w}`));
}

validateConfig();

module.exports = config;
