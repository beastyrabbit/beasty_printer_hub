const net = require('net');
const { printerPort } = require('./config');

const ESC = 0x1b;
const GS = 0x1d;

// Character width for 58mm paper (32 chars) or 80mm paper (48 chars)
const PAPER_WIDTH = 32;

// ==============================================================================
// LOW-LEVEL COMMANDS
// ==============================================================================

function init() {
  // Initialize + set code page 1252 (Windows Western European)
  return Buffer.from([
    ESC, 0x40,       // Initialize
    ESC, 0x74, 16    // Select code page 1252 (Windows-1252)
  ]);
}

function align(mode) {
  const val = mode === 'center' ? 1 : mode === 'right' ? 2 : 0;
  return Buffer.from([ESC, 0x61, val]);
}

function textSize(width, height) {
  const w = Math.min(8, Math.max(1, width)) - 1;
  const h = Math.min(8, Math.max(1, height)) - 1;
  return Buffer.from([GS, 0x21, (w << 4) | h]);
}

function emphasis(on) {
  return Buffer.from([ESC, 0x45, on ? 0x01 : 0x00]);
}

function inverse(on) {
  return Buffer.from([GS, 0x42, on ? 0x01 : 0x00]);
}

// Convert text to buffer with German umlaut support
// Try Windows-1252 encoding first, fallback to replacing umlauts
function text(str) {
  // Replace German umlauts with their Windows-1252 byte values
  const mapped = str
    .replace(/ä/g, '\xe4')
    .replace(/ö/g, '\xf6')
    .replace(/ü/g, '\xfc')
    .replace(/Ä/g, '\xc4')
    .replace(/Ö/g, '\xd6')
    .replace(/Ü/g, '\xdc')
    .replace(/ß/g, '\xdf');
  return Buffer.from(mapped, 'binary');
}

function feed(lines = 1) {
  return Buffer.from([ESC, 0x64, Math.min(255, Math.max(0, lines))]);
}

function cut() {
  return Buffer.from([GS, 0x56, 0x42, 0x00]);
}

function hr(char = '-', length = PAPER_WIDTH) {
  return Buffer.from(char.repeat(length) + '\n', 'binary');
}

function qrCode(data, { size = 6 } = {}) {
  const s = String(data || 'NA');
  const setError = Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 48]);
  const setSize = Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.min(16, Math.max(1, size))]);
  const store = Buffer.concat([
    Buffer.from([GS, 0x28, 0x6b]),
    Buffer.from([(s.length + 3) & 0xff, ((s.length + 3) >> 8) & 0xff]),
    Buffer.from([0x31, 0x50, 0x30]),
    Buffer.from(s, 'ascii')
  ]);
  const print = Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);
  return Buffer.concat([setError, setSize, store, print]);
}

// ==============================================================================
// TEXT PROCESSING
// ==============================================================================

function stripEmoji(str) {
  return str
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{1F000}-\u{1F02F}]/gu, '')
    .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, '')
    .replace(/\u200d/g, '')
    .replace(/[\u{E0000}-\u{E007F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(title) {
  return stripEmoji(title || '').trim();
}

function cleanText(str) {
  return (str || '')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

// ==============================================================================
// SINGLE TASK PRINT (HYPE MODE)
// ==============================================================================

function buildSingleTaskTicket(task) {
  const parts = [];
  parts.push(init());

  // ========== TOP BANNER ==========
  parts.push(align('center'));
  parts.push(inverse(true));
  parts.push(textSize(2, 2));
  parts.push(text(' * DO IT! * \n'));
  parts.push(textSize(1, 1));
  parts.push(inverse(false));
  parts.push(feed(1));

  // ========== TASK TITLE (BIG) ==========
  const title = cleanTitle(task.title).toUpperCase();
  
  // Use 2x size for longer titles, 3x for short ones
  const useSize = title.length > 20 ? 2 : 3;
  const maxCharsPerLine = Math.floor(PAPER_WIDTH / useSize);
  
  parts.push(textSize(useSize, useSize));
  parts.push(emphasis(true));
  
  // Wrap title - never break words
  const titleLines = wrapTextNoBreak(title, maxCharsPerLine);
  for (const line of titleLines) {
    parts.push(text(line + '\n'));
  }
  
  parts.push(emphasis(false));
  parts.push(textSize(1, 1));
  parts.push(feed(1));

  // ========== LABELS ==========
  if (task.labels && task.labels.length) {
    const cleanLabels = task.labels.map(l => cleanTitle(l));
    parts.push(text('[' + cleanLabels.join('] [') + ']\n'));
    parts.push(feed(1));
  }

  // ========== DESCRIPTION ==========
  if (task.description) {
    parts.push(hr('-'));
    parts.push(align('center'));
    const desc = cleanText(task.description);
    const descLines = wrapTextNoBreak(desc, PAPER_WIDTH);
    for (const dl of descLines) {
      parts.push(text(dl + '\n'));
    }
    parts.push(feed(1));
  }

  // ========== QR CODE ==========
  parts.push(hr('='));
  parts.push(align('center'));
  // Include "donotick:" prefix so scanner knows which system this belongs to
  parts.push(qrCode(`donotick:${task.id || task.title}`, { size: 8 }));
  
  parts.push(feed(3));
  parts.push(cut());
  
  return Buffer.concat(parts);
}

// ==============================================================================
// DAILY SUMMARY PRINT (DENSE)
// ==============================================================================

function buildDailySummaryTicket(tasks) {
  const parts = [];
  parts.push(init());

  const now = new Date();
  const dateStr = formatDate(now);

  // ========== HEADER ==========
  parts.push(align('center'));
  parts.push(inverse(true));
  parts.push(textSize(2, 1));
  parts.push(text(` HEUTE ${dateStr} `));
  parts.push(textSize(1, 1));
  parts.push(text('\n'));
  parts.push(inverse(false));
  parts.push(feed(1));

  // ========== TASK COUNT ==========
  parts.push(align('left'));
  parts.push(text(`${tasks.length} Aufgaben\n`));
  parts.push(hr('-'));

  // ========== TASK LIST ==========
  tasks.forEach((task) => {
    const title = cleanTitle(task.title);
    
    // Wrap long titles properly
    if (title.length <= PAPER_WIDTH - 2) {
      parts.push(emphasis(true));
      parts.push(text(`- ${title}\n`));
      parts.push(emphasis(false));
    } else {
      const lines = wrapTextNoBreak(title, PAPER_WIDTH - 2);
      parts.push(emphasis(true));
      parts.push(text(`- ${lines[0]}\n`));
      parts.push(emphasis(false));
      for (let i = 1; i < lines.length; i++) {
        parts.push(text(`  ${lines[i]}\n`));
      }
    }
    
    // Labels (all of them)
    if (task.labels && task.labels.length) {
      const cleanLabels = task.labels.map(l => cleanTitle(l));
      parts.push(text(`  [${cleanLabels.join('] [')}]\n`));
    }
  });

  parts.push(hr('-'));
  parts.push(feed(3));
  parts.push(cut());

  return Buffer.concat(parts);
}

// ==============================================================================
// WEEKLY SUMMARY PRINT (GROUPED BY DAY)
// ==============================================================================

function buildWeeklySummaryTicket(tasks, weekRange) {
  const parts = [];
  parts.push(init());

  const cleanRange = cleanText(weekRange);

  // ========== HEADER ==========
  parts.push(align('center'));
  parts.push(inverse(true));
  parts.push(textSize(1, 2));
  parts.push(text(' WOCHENPLAN \n'));
  parts.push(textSize(1, 1));
  parts.push(text(` ${cleanRange} \n`));
  parts.push(inverse(false));
  parts.push(feed(1));

  const grouped = groupTasksByDay(tasks);
  const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  let totalCount = 0;

  // ========== TASKS BY DAY ==========
  for (const [dateKey, dayTasks] of Object.entries(grouped)) {
    if (!dayTasks.length) continue;
    
    const date = new Date(dateKey + 'T00:00:00');
    const dayName = dayNames[date.getDay()];
    const dayNum = date.getDate();
    const monthNum = date.getMonth() + 1;
    
    parts.push(align('left'));
    parts.push(inverse(true));
    parts.push(text(` ${dayName} ${dayNum}.${monthNum} `));
    parts.push(inverse(false));
    parts.push(text(` (${dayTasks.length})\n`));
    
    for (const task of dayTasks) {
      const title = cleanTitle(task.title);
      
      // Print title (wrap if needed)
      if (title.length <= PAPER_WIDTH - 2) {
        parts.push(text(`- ${title}\n`));
      } else {
        const lines = wrapTextNoBreak(title, PAPER_WIDTH - 2);
        parts.push(text(`- ${lines[0]}\n`));
        for (let i = 1; i < lines.length; i++) {
          parts.push(text(`  ${lines[i]}\n`));
        }
      }
      
      // Print all labels on next line
      if (task.labels && task.labels.length) {
        const cleanLabels = task.labels.map(l => cleanTitle(l));
        parts.push(text(`  [${cleanLabels.join('] [')}]\n`));
      }
      totalCount++;
    }
    parts.push(feed(1));
  }

  // Tasks without due date
  const noDueTasks = tasks.filter(t => !t.due);
  if (noDueTasks.length) {
    parts.push(inverse(true));
    parts.push(text(' OHNE DATUM '));
    parts.push(inverse(false));
    parts.push(text(` (${noDueTasks.length})\n`));
    for (const task of noDueTasks) {
      const title = cleanTitle(task.title);
      if (title.length <= PAPER_WIDTH - 2) {
        parts.push(text(`- ${title}\n`));
      } else {
        const lines = wrapTextNoBreak(title, PAPER_WIDTH - 2);
        parts.push(text(`- ${lines[0]}\n`));
        for (let i = 1; i < lines.length; i++) {
          parts.push(text(`  ${lines[i]}\n`));
        }
      }
      // Print all labels
      if (task.labels && task.labels.length) {
        const cleanLabels = task.labels.map(l => cleanTitle(l));
        parts.push(text(`  [${cleanLabels.join('] [')}]\n`));
      }
      totalCount++;
    }
    parts.push(feed(1));
  }

  // ========== FOOTER ==========
  parts.push(hr('='));
  parts.push(align('center'));
  parts.push(emphasis(true));
  parts.push(text(`GESAMT: ${totalCount} Aufgaben\n`));
  parts.push(emphasis(false));

  parts.push(feed(3));
  parts.push(cut());

  return Buffer.concat(parts);
}

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

// Wrap text without breaking words - if a word is too long, keep it whole
function wrapTextNoBreak(str, maxLen) {
  const result = [];
  const words = str.split(/\s+/);
  let line = '';
  
  for (const word of words) {
    if (line === '') {
      // First word on line - always add it even if too long
      line = word;
    } else if (line.length + 1 + word.length <= maxLen) {
      // Word fits on current line
      line = line + ' ' + word;
    } else {
      // Word doesn't fit - start new line
      result.push(line);
      line = word;
    }
  }
  
  if (line) result.push(line);
  return result;
}

function formatDate(d) {
  const date = new Date(d);
  if (isNaN(date)) return String(d).slice(0, 10);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

function groupTasksByDay(tasks) {
  const groups = {};
  for (const task of tasks) {
    if (!task.due) continue;
    const date = new Date(task.due);
    if (isNaN(date)) continue;
    const key = date.toISOString().slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
  }
  const sorted = {};
  Object.keys(groups).sort().forEach(k => { sorted[k] = groups[k]; });
  return sorted;
}

// ==============================================================================
// MAIN PRINT FUNCTION
// ==============================================================================

async function printTasks(params) {
  const {
    host,
    port = printerPort,
    tasks,
    headerTitle,
    compact = false,
    mode,
    weekRange
  } = params;
  
  if (!host) throw new Error('Printer host is missing');
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('No tasks to print');

  let payload;
  const printMode = mode || (compact ? 'daily' : (tasks.length === 1 ? 'single' : 'daily'));

  switch (printMode) {
    case 'single':
      payload = Buffer.concat(tasks.map(t => buildSingleTaskTicket(t)));
      break;
    case 'weekly':
      payload = buildWeeklySummaryTicket(tasks, weekRange || headerTitle || 'Diese Woche');
      break;
    case 'daily':
    default:
      payload = buildDailySummaryTicket(tasks);
      break;
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 4000 }, () => {
      socket.write(payload, () => {
        socket.end();
        resolve();
      });
    });
    socket.on('error', (err) => reject(new Error(`Printer error: ${err.code || err.message}`)));
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Printer connection timed out'));
    });
  });
}

async function pingPrinter(host, port = printerPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 1500 }, () => {
      socket.end();
      resolve({ reachable: true });
    });
    const fail = (err) => {
      socket.destroy();
      resolve({ reachable: false, error: err ? err.code || err.message : 'timeout' });
    };
    socket.on('error', fail);
    socket.on('timeout', fail);
  });
}

// ==============================================================================
// WIFI QR CODE PRINT
// ==============================================================================

function escapeWifiString(str) {
  // Escape special characters for WiFi QR format: \ ; , : "
  return str.replace(/[\\;,:\"]/g, '\\$&');
}

function buildWifiQrTicket(ssid, password, type = 'WPA', hidden = false) {
  const parts = [];
  parts.push(init());

  // Header
  parts.push(align('center'));
  parts.push(inverse(true));
  parts.push(textSize(2, 1));
  parts.push(text(' WLAN '));
  parts.push(textSize(1, 1));
  parts.push(text('\n'));
  parts.push(inverse(false));
  parts.push(feed(1));

  // Network name
  parts.push(textSize(2, 2));
  parts.push(emphasis(true));
  parts.push(text(ssid + '\n'));
  parts.push(emphasis(false));
  parts.push(textSize(1, 1));
  parts.push(feed(1));

  // Build WiFi QR code string
  // Format: WIFI:T:WPA;S:mynetwork;P:mypassword;H:true;;
  const escapedSsid = escapeWifiString(ssid);
  const escapedPassword = escapeWifiString(password || '');
  
  let wifiString = `WIFI:T:${type};S:${escapedSsid};`;
  if (type !== 'nopass' && password) {
    wifiString += `P:${escapedPassword};`;
  }
  if (hidden) {
    wifiString += 'H:true;';
  }
  wifiString += ';';

  // QR Code (large for easy scanning)
  parts.push(hr('='));
  parts.push(qrCode(wifiString, { size: 10 }));
  parts.push(feed(1));
  parts.push(hr('='));

  // Instructions
  parts.push(feed(1));
  parts.push(align('center'));
  parts.push(text('QR-Code scannen\n'));
  parts.push(text('zum Verbinden\n'));

  parts.push(feed(3));
  parts.push(cut());

  return Buffer.concat(parts);
}

async function printWifiQr(params) {
  const { host, port = printerPort, ssid, password, type, hidden } = params;
  
  if (!host) throw new Error('Printer host is missing');
  if (!ssid) throw new Error('SSID is required');

  const payload = buildWifiQrTicket(ssid, password, type, hidden);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 4000 }, () => {
      socket.write(payload, () => {
        socket.end();
        resolve();
      });
    });
    socket.on('error', (err) => reject(new Error(`Printer error: ${err.code || err.message}`)));
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Printer connection timed out'));
    });
  });
}

module.exports = { printTasks, pingPrinter, printWifiQr };
