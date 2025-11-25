const { trashIcalUrl, trashEnable } = require('./config');
const db = require('./db');

function parseIcs(icsText) {
  const events = [];
  const parts = icsText.split('BEGIN:VEVENT').slice(1);
  parts.forEach((chunk) => {
    const lines = chunk.split(/\r?\n/);
    let dtStart = null;
    let summary = '';
    let uid = '';
    lines.forEach((line) => {
      if (line.startsWith('DTSTART')) {
        const match = line.match(/:(\d{8})/);
        if (match) {
          const d = match[1];
          const y = Number(d.slice(0, 4));
          const m = Number(d.slice(4, 6)) - 1;
          const day = Number(d.slice(6, 8));
          dtStart = new Date(Date.UTC(y, m, day));
        }
      }
      if (line.startsWith('SUMMARY')) {
        const idx = line.indexOf(':');
        summary = line.slice(idx + 1).trim();
      }
      if (line.startsWith('UID')) {
        const idx = line.indexOf(':');
        uid = line.slice(idx + 1).trim();
      }
    });
    if (dtStart && summary) {
      events.push({ uid: uid || `${summary}-${dtStart.toISOString().slice(0, 10)}`, date: dtStart, summary });
    }
  });
  return events;
}

async function fetchTrashEvents() {
  if (!trashEnable || !trashIcalUrl) return [];

  const cache = db.getTrashCache();
  const age = Date.now() - (cache.fetchedAt || 0);
  
  if (age < 12 * 60 * 60 * 1000 && Array.isArray(cache.events) && cache.events.length > 0) {
    return cache.events.map((e) => ({ ...e, date: new Date(e.date) }));
  }

  const res = await fetch(trashIcalUrl);
  if (!res.ok) throw new Error(`Trash iCal fetch failed: ${res.status}`);
  const text = await res.text();
  const events = parseIcs(text);
  
  db.saveTrashCache({ fetchedAt: Date.now(), events });
  return events;
}

function sameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function toLocal(date) {
  return new Date(date.getTime() + date.getTimezoneOffset() * 60000);
}

async function getTrashReminderTasks(referenceDate = new Date()) {
  const events = await fetchTrashEvents();
  const printed = db.getTrashPrinted();
  const reminders = [];
  const today = toLocal(referenceDate);
  const todayIso = today.toISOString().slice(0, 10);

  const filteredEvents = events.filter((ev) => ev.summary && !/bio/i.test(ev.summary));

  filteredEvents.forEach((ev) => {
    const pickupLocal = toLocal(ev.date);
    const reminderDate = new Date(pickupLocal);
    reminderDate.setDate(reminderDate.getDate() - 1);

    if (reminderDate < today) return; // only upcoming

    reminders.push({
      uid: ev.uid,
      type: ev.summary,
      reminderDate,
      pickupDate: pickupLocal
    });
  });

  const perType = reminders.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const selected = [];
  Object.entries(perType).forEach(([type, arr]) => {
    arr.sort((a, b) => a.reminderDate - b.reminderDate);
    if (/rest/i.test(type)) {
      selected.push(...arr.slice(0, 2));
    } else {
      selected.push(arr[0]);
    }
  });

  // Build tasks for reminders occurring today
  const tasks = selected
    .filter((r) => sameDay(r.reminderDate, today))
    .filter((r) => !printed[r.uid])
    .map((r) => ({
      id: `trash-${r.uid}`,
      uid: r.uid,
      title: `Müll raus bringen (${r.type})`,
      description: `Abholung am ${r.pickupDate.toISOString().slice(0, 10)}`
    }));

  return { tasks, state: { printed }, earliestPerType: selected, todayIso };
}

function markPrinted(uids) {
  db.markTrashPrinted(uids);
}

function loadCreated() {
  return db.getTrashCreated();
}

function saveCreated(data) {
  db.saveTrashCreated(data);
}

module.exports = { getTrashReminderTasks, markPrinted, loadCreated, saveCreated };
