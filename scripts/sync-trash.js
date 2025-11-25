#!/usr/bin/env node
// Manual one-shot sync of trash iCal reminders into Donotick with merged labels.
const { getTrashReminderTasks } = require('../src/trash');
const { createTask, listAllChores } = require('../src/donotick');

async function main() {
  const { earliestPerType } = await getTrashReminderTasks();
  const chores = await listAllChores();
  const existingKeys = new Set(chores.map((c) => `${c.title || c.name}-${(c.due || c.nextDueDate || '').slice(0, 10)}`));

  const labelMap = {
    'Gelbe Tonne': 'Gelb',
    'Restmuelltonne': 'Schwarz',
    'Restmülltonne': 'Schwarz',
    Papiertonne: 'Grün',
    Glas: 'Blau'
  };

  const grouped = earliestPerType.reduce((acc, r) => {
    const day = r.reminderDate.toISOString().slice(0, 10);
    (acc[day] ||= []).push(r);
    return acc;
  }, {});

  let created = 0;
  for (const [day, items] of Object.entries(grouped)) {
    const name = '♻️ Müll raus bringen';
    const key = `${name}-${day}`;
    if (existingKeys.has(key)) continue;
    const labels = [...new Set(items.map((r) => labelMap[r.type] || r.type).filter(Boolean))];
    await createTask({ title: name, description: '', dueDate: items[0].reminderDate.toISOString(), labels });
    created++;
    console.log(`Created chore for ${day} labels=${labels.join(',')}`);
  }
  if (!created) console.log('Nothing to create (all already present).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
