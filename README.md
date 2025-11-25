# Donotick Printer Bridge

Minimal Node service that pulls tasks from Donotick and prints them to an Epson thermal printer. A dashboard lets you verify tasks, check printer reachability, and trigger prints. Automatic printing runs at configured times.

## Quick start

1. Ensure Bun or Node 18+ is available.
2. Copy `.env.example` to `.env` and set your values (credentials, printer IP, Donotick base URL, etc.).
3. Start the server:

```bash
bun run start
# or
node src/server.js
```

4. Open the dashboard: http://localhost:3000

## Configuration

| Env | Purpose |
| --- | --- |
| `DONOTICK_BASE_URL` | Base URL of your Donotick instance (e.g., `http://192.168.50.250:2021`). |
| `DONOTICK_USERNAME` | Username for Donotick login (preferred auth method). |
| `DONOTICK_PASSWORD` | Password for Donotick login. |
| `DONOTICK_TOKEN` | Legacy API token (used if username/password not set). |
| `PRINTER_IP` | Default Epson printer IP for server-side printing. |
| `PRINTER_PORT` | Usually 9100 for ESC/POS raw socket. |
| `DAILY_PRINT_TIME` | Morning auto-print time `HH:MM` (24h), default `08:00`. |
| `WEEKLY_PRINT_TIME` | Sunday weekly preview time `HH:MM` (24h), default `08:00`. |
| `WEEKLY_PRINT_DAY` | Day for weekly preview (0=Sun, 1=Mon), default `0` (Sunday). |
| `TIMEZONE` | Display only; scheduling uses server local time. |
| `PORT` | HTTP server port (default 3000). |
| `TRASH_ENABLE` | `true` to enable iCal-based trash reminders. |
| `TRASH_ICAL_URL` | iCal feed for pickup schedule. |

## Printing Logic

### Morning Auto-Print (Daily)

Runs every day at `DAILY_PRINT_TIME`:

1. **Fetches today's tasks** from Donotick + trash reminders
2. **Prints each task individually** with QR code
3. **Marks tasks as done** in Donotick after printing
4. **Records printed tasks** in `data/daily-printed.json` (for daily summary button)
5. **On Monday only**: Also prints the weekly summary

### Weekly Summary

| Day | What prints automatically | Weekly button shows |
|-----|---------------------------|---------------------|
| Monday | Single tasks + Weekly summary (Mon→Sun) | Mon → Sun |
| Tue–Sat | Single tasks only | Today → Sun |
| Sunday | Single tasks + Next week preview | Next Mon → Sun |

On Sunday at `WEEKLY_PRINT_TIME`, the system prints a preview of next week's tasks.

### Manual Print Buttons (Dashboard)

- **Print Daily Summary**: Prints a compact list of today's tasks. Includes tasks that were already printed/completed in the morning auto-run (remembered from `daily-printed.json`). Does NOT mark tasks as done again.

- **Print Weekly Summary**: Prints tasks from now until Sunday. On Sunday, shows next week (Monday to Sunday).

- **Print this task**: Prints a single task with QR code (does not mark as done).

### Unified Database

All state is stored in a single file: `data/db.json`

| Section | Purpose |
| --- | --- |
| `daily` | Tasks printed in the morning (resets daily). Used so daily summary button can show tasks that were already completed. |
| `trash.printed` | Tracks which trash reminders have been printed. |
| `trash.cache` | Cached iCal data (12h TTL). |
| `trash.created` | Tracks trash tasks created in Donotick. |
| `logs` | Activity log entries (max 200 entries). |

Old state files are automatically migrated to the unified database on first run.

## API Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/` | GET | Dashboard |
| `/logs.html` | GET | Activity log page |
| `/api/todos/today` | GET | Today's tasks (Donotick + trash) |
| `/api/todos/week` | GET | This week's tasks |
| `/api/todos/create` | POST | Create a new task |
| `/api/todos/:id/complete` | POST | Mark task as done |
| `/api/todos/:id/print` | POST | Print single task |
| `/api/print/daily` | POST | Print daily summary |
| `/api/print/weekly` | POST | Print weekly summary |
| `/api/printer/status` | GET | Check printer reachability |
| `/api/printer/test` | POST | Print test ticket |
| `/api/trash/preview` | GET | Upcoming trash pickups |
| `/api/trash/sync` | POST | Sync trash to Donotick tasks |
| `/api/status` | GET | Server status + last run info |
| `/api/logs` | GET | Get activity log entries |
| `/api/logs/clear` | POST | Clear all log entries |

### Request Bodies

```json
// POST /api/print/daily, /api/print/weekly, /api/printer/test
{
  "printerIp": "192.168.10.30",  // optional, uses config default
  "printerPort": 9100            // optional
}

// POST /api/todos/create
{
  "title": "Task name",
  "description": "Optional description",
  "dueDate": "2025-01-15T08:00:00Z",
  "labels": ["Label1", "Label2"]
}
```

## Trash Calendar Integration

- Fetches iCal feed from configured URL
- Ignores Biotonne
- Creates reminder tasks in Donotick one day before pickup
- Groups same-day pickups into single task with multiple labels
- Color-coded labels: Gelb (yellow bin), Schwarz (residual), Grün (paper), Blau (glass)

## Running 24/7

Use a process manager (systemd, pm2, or Docker) to keep the server alive. Auto-print timers are in-process.

```bash
# Example with pm2
pm2 start src/server.js --name donotick-printer

# Example systemd service
[Unit]
Description=Donotick Printer Bridge
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/donotick-printer
ExecStart=/usr/bin/node src/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

## Development

```bash
# Run with auto-reload
bun run dev

# Lint
bun run lint
```

## Notes

- ESC/POS raw printing on port 9100. Adjust `src/printer.js` if your printer requires different protocol.
- Non-ASCII characters are handled, but verify your printer's code page settings.
- The dashboard auto-loads tasks on page load and shows live status.
