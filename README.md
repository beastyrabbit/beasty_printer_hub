# Beasty Printer Hub 🖨️

A personal productivity dashboard that connects to [Donotick](https://donotick.com) task manager, Google Calendar, trash collection schedules, and an ESC/POS thermal printer. Built with Node.js backend and Vue 3 frontend.

## Features

- **Task Management**: View and print today's and this week's tasks from Donotick
- **Shopping List**: Manage items, collections, and print shopping lists
- **Google Calendar Integration**: OAuth 2.0 connection to view private calendar events
- **Trash Calendar**: iCal integration for waste collection reminders
- **Thermal Printing**: Print tasks, summaries, shopping lists, and WiFi QR codes
- **Automatic Scheduling**: Daily morning prints and weekly summaries
- **Modern UI**: Dark theme Vue 3 dashboard with Tailwind CSS

## Quick Start with Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/beastyrabbit/beasty_printer_hub.git
cd beasty_printer_hub

# Create data directory and copy example config
mkdir -p data
cp data/db.example.json data/db.json

# Build and start
docker compose up -d

# View logs
docker compose logs -f
```

Open http://localhost:3000 in your browser and configure everything in **Settings**.

## Docker Compose

The `docker-compose.yml` provides a production-ready setup:

```yaml
services:
  beasty-printer-hub:
    build: .
    container_name: beasty-printer-hub
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data  # Persistent config & state
    environment:
      - TZ=Europe/Berlin
```

### Volume Mount

The `data/` directory is mounted as a volume and contains:
- `db.json` - All configuration, shopping lists, logs, and cached data

This file persists across container restarts and updates.

## Manual Installation

### Prerequisites

- [Bun](https://bun.sh/) or Node.js 18+
- ESC/POS compatible thermal printer (network connected)
- Donotick instance (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/beastyrabbit/beasty_printer_hub.git
cd beasty_printer_hub

# Install dependencies
bun install
cd frontend && bun install && cd ..

# Build frontend
bun run build

# Start the server
bun run start
```

## Configuration

All configuration is managed through the web UI under **Settings**. No config files needed!

Optionally, you can set initial values via environment variables (`.env` file) - they will be migrated to the database on first run:

| Setting | Description |
|---------|-------------|
| Donotick URL | Your Donotick server address |
| Donotick Username/Password | Login credentials |
| Printer IP/Port | Thermal printer network address (default port 9100) |
| Daily Print Time | When to auto-print morning tasks (HH:MM) |
| Weekly Print Day | Day for weekly summary (0=Sunday) |
| Trash Calendar URL | iCal feed for waste collection |
| Google Calendar | OAuth 2.0 connection for private calendars |

### Google Calendar Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable **Google Calendar API**
3. Create OAuth 2.0 credentials (Web application)
4. Add redirect URI: `http://your-server:3000/api/google/callback`
5. Enter Client ID and Secret in Settings
6. Click "Connect with Google"

## Architecture

```
beasty_printer_hub/
├── src/                    # Backend (Node.js/Bun)
│   ├── server.js          # HTTP server & API routes
│   ├── printer.js         # ESC/POS thermal printing
│   ├── donotick.js        # Donotick API client
│   ├── googleCalendar.js  # Google Calendar OAuth
│   ├── trash.js           # Trash calendar integration
│   ├── scheduler.js       # Automatic print scheduling
│   ├── db.js              # JSON database
│   └── config.js          # Configuration management
├── frontend/              # Frontend (Vue 3 + Vite)
│   ├── src/
│   │   ├── views/         # Page components
│   │   ├── components/    # UI components (shadcn-vue)
│   │   └── router/        # Vue Router
│   └── dist/              # Built frontend (served by backend)
├── data/                  # Runtime data (gitignored, mounted in Docker)
│   └── db.json            # Database file
├── Dockerfile             # Multi-stage Docker build
└── docker-compose.yml     # Production deployment
```

## API Endpoints

### Tasks
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/todos/today` | GET | Today's tasks |
| `/api/todos/week` | GET | This week's tasks |
| `/api/todos/:id/print` | POST | Print single task |
| `/api/print/daily` | POST | Print daily summary |
| `/api/print/weekly` | POST | Print weekly summary |

### Shopping List
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/shopping/items` | GET/POST | Manage items |
| `/api/shopping/list` | GET/POST/DELETE | Current shopping list |
| `/api/shopping/collections` | GET/POST | Item collections |
| `/api/shopping/print` | POST | Print shopping list |

### Calendar & Status
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/calendar/week` | GET | Calendar events |
| `/api/trash/preview` | GET | Upcoming trash pickups |
| `/api/printer/status` | GET | Printer connectivity |
| `/api/google/status` | GET | Google Calendar connection |

## Printing

The system prints to ESC/POS compatible thermal printers via raw TCP socket on port 9100.

### Print Types
- **Single Task**: Large title, QR code with task ID
- **Daily Summary**: Compact list of today's tasks
- **Weekly Summary**: Tasks grouped by day
- **Shopping List**: Items with quantities and units
- **WiFi QR Code**: Scannable WiFi credentials

### Automatic Printing
- **Daily (configurable time)**: Prints individual task tickets
- **Monday**: Includes weekly summary
- **Sunday**: Prints next week preview

## Development

```bash
# Backend with auto-reload
bun run dev

# Frontend dev server (with hot reload)
cd frontend && bun run dev

# Build frontend for production
bun run build

# Docker commands
bun run docker:build   # Build Docker image
bun run docker:up      # Start container
bun run docker:down    # Stop container
bun run docker:logs    # View logs
```

## Tech Stack

**Backend:**
- Bun / Node.js
- Native HTTP server (no framework)
- ESC/POS printing protocol

**Frontend:**
- Vue 3 + TypeScript
- Vite
- Tailwind CSS
- shadcn-vue components
- Lucide icons

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss changes.
