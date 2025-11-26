<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckSquare, Calendar, Printer, Wifi, Trash2, CalendarDays, Link2, Bot, ExternalLink } from 'lucide-vue-next'

interface Task {
  id: string | number
  title: string
  description?: string
  due?: string
  labels?: string[]
}

interface CalendarEvent {
  summary: string
  start: string
  location?: string
  allDay?: boolean
}

interface TrashEvent {
  type: string
  date: string
  label: string
}

interface ConnectionStatus {
  name: string
  icon: any
  connected: boolean
  detail?: string
  loading: boolean
}

const tasks = ref<Task[]>([])
const weekTasks = ref<Task[]>([])
const familyEvents = ref<CalendarEvent[]>([])
const trashEvents = ref<TrashEvent[]>([])
const loading = ref(false)
const todayCount = ref(0)
const weekCount = ref(0)

// Connection statuses
const connections = ref<ConnectionStatus[]>([
  { name: 'Drucker', icon: Printer, connected: false, loading: true },
  { name: 'Abfall-Kalender', icon: Trash2, connected: false, loading: true },
  { name: 'Familien-Kalender', icon: CalendarDays, connected: false, loading: true },
  { name: 'Ollama KI', icon: Bot, connected: false, loading: true },
])

let statusCheckInterval: number | null = null

async function loadTasks() {
  loading.value = true
  try {
    const res = await fetch('/api/todos/today')
    const data = await res.json()
    tasks.value = data.tasks || []
    todayCount.value = tasks.value.length
  } catch (err) {
    console.error('Failed to load tasks:', err)
  } finally {
    loading.value = false
  }
}

async function loadWeekTasks() {
  try {
    const res = await fetch('/api/todos/week')
    const data = await res.json()
    weekTasks.value = data.tasks || []
    weekCount.value = weekTasks.value.length
  } catch (err) {
    console.error('Failed to load week tasks:', err)
  }
}

async function loadFamilyCalendar() {
  try {
    const res = await fetch('/api/calendar/week')
    const data = await res.json()
    familyEvents.value = (data.events || []).map((e: any) => ({
      summary: e.summary,
      start: e.start,
      location: e.location,
      allDay: e.allDay
    }))
  } catch (err) {
    console.error('Failed to load family calendar:', err)
  }
}

async function loadTrashCalendar() {
  try {
    const res = await fetch('/api/trash/preview')
    const data = await res.json()
    // upcoming is an array of events with type, pickupDate, pickupDateStr, reminderDate
    const upcoming = data.upcoming || []
    trashEvents.value = upcoming.map((event: any) => ({
      type: event.type,
      date: event.pickupDateStr || event.pickupDate, // Use the string version if available
      label: event.type
    })).sort((a: TrashEvent, b: TrashEvent) => {
      // Sort by date string (YYYY-MM-DD format sorts correctly)
      return a.date.localeCompare(b.date)
    })
  } catch (err) {
    console.error('Failed to load trash calendar:', err)
  }
}

async function checkAllConnections() {
  // Check printer
  try {
    const res = await fetch('/api/printer/status')
    const data = await res.json()
    const printer = connections.value.find(c => c.name === 'Drucker')
    if (printer) {
      printer.connected = data.reachable
      printer.detail = data.ip || undefined
      printer.loading = false
    }
  } catch {
    const printer = connections.value.find(c => c.name === 'Drucker')
    if (printer) { printer.connected = false; printer.loading = false }
  }

  // Check Trash calendar
  const trash = connections.value.find(c => c.name === 'Abfall-Kalender')
  if (trash) {
    try {
      const configRes = await fetch('/api/config')
      const configData = await configRes.json()
      if (configData.config?.trashEnable && configData.config?.trashIcalUrl) {
        trash.connected = trashEvents.value.length > 0
        trash.detail = trashEvents.value.length > 0 ? `${trashEvents.value.length} Termine` : 'Keine kommenden'
      } else {
        trash.connected = false
        trash.detail = 'Nicht konfiguriert'
      }
    } catch {
      trash.connected = false
      trash.detail = 'Fehler'
    }
    trash.loading = false
  }

  // Check Family calendar
  const family = connections.value.find(c => c.name === 'Familien-Kalender')
  if (family) {
    try {
      const configRes = await fetch('/api/config')
      const configData = await configRes.json()
      if (configData.config?.googleCalendarUrl) {
        family.connected = true
        family.detail = familyEvents.value.length > 0 
          ? `${familyEvents.value.length} diese Woche` 
          : 'Keine diese Woche'
      } else {
        family.connected = false
        family.detail = 'Nicht konfiguriert'
      }
    } catch {
      family.connected = false
      family.detail = 'Fehler'
    }
    family.loading = false
  }

  // Check Ollama AI
  try {
    const configRes = await fetch('/api/config')
    const configData = await configRes.json()
    const ai = connections.value.find(c => c.name === 'Ollama KI')
    if (ai) {
      if (configData.config?.ollamaEnabled) {
        const res = await fetch('/api/ai/status')
        const data = await res.json()
        ai.connected = data.available
        ai.detail = data.available ? (data.models?.[0] || 'Verbunden') : 'Nicht erreichbar'
      } else {
        ai.connected = false
        ai.detail = 'Deaktiviert'
      }
      ai.loading = false
    }
  } catch {
    const ai = connections.value.find(c => c.name === 'Ollama KI')
    if (ai) { ai.connected = false; ai.detail = 'Fehler'; ai.loading = false }
  }
}

async function printDailySummary() {
  try {
    await fetch('/api/print/daily', { method: 'POST' })
  } catch (err) {
    console.error('Print failed:', err)
  }
}

async function printWeeklySummary() {
  try {
    await fetch('/api/print/weekly', { method: 'POST' })
  } catch (err) {
    console.error('Print failed:', err)
  }
}

async function printTask(task: Task) {
  try {
    await fetch(`/api/todos/${task.id}/print`, {
      method: 'POST'
    })
  } catch (err) {
    console.error('Print failed:', err)
  }
}

async function printWifiQr() {
  try {
    await fetch('/api/print/wifi', { method: 'POST' })
  } catch (err) {
    console.error('Print failed:', err)
  }
}

function formatDate(dateStr: string): string {
  // Handle YYYY-MM-DD format by parsing as local date at noon to avoid timezone issues
  let date: Date
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split('-')
    const y = parseInt(parts[0] || '0', 10)
    const m = parseInt(parts[1] || '1', 10) - 1
    const d = parseInt(parts[2] || '1', 10)
    date = new Date(y, m, d, 12, 0, 0)
  } else {
    date = new Date(dateStr)
  }
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function getTrashColor(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('rest') || t.includes('schwarz')) return 'bg-gray-600'
  if (t.includes('gelb')) return 'bg-yellow-500'
  if (t.includes('papier') || t.includes('blau')) return 'bg-green-600' // Papier = green per user request
  if (t.includes('glas')) return 'bg-blue-500' // Glas = blue
  return 'bg-gray-400' // fallback
}

async function refreshAll() {
  loading.value = true
  await Promise.all([
    loadTasks(),
    loadWeekTasks(),
    loadFamilyCalendar(),
    loadTrashCalendar(),
  ])
  await checkAllConnections()
  loading.value = false
}

onMounted(() => {
  refreshAll()
  // Auto-check status every 30 seconds
  statusCheckInterval = window.setInterval(refreshAll, 30000)
})

onUnmounted(() => {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval)
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header with buttons -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Dashboard</h1>
        <p class="text-muted-foreground">Übersicht deiner Aufgaben</p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" @click="printWifiQr">
          <Wifi class="w-4 h-4 mr-2" />
          WLAN QR
        </Button>
        <Button @click="refreshAll" :disabled="loading">
          {{ loading ? 'Lädt...' : 'Aktualisieren' }}
        </Button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckSquare class="w-4 h-4" />
            Heute
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="text-3xl font-bold">{{ todayCount }}</div>
          <p class="text-xs text-muted-foreground">Aufgaben</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Calendar class="w-4 h-4" />
            Diese Woche
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="text-3xl font-bold">{{ weekCount }}</div>
          <p class="text-xs text-muted-foreground">Aufgaben</p>
        </CardContent>
      </Card>

      <!-- Connection Status Card -->
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Link2 class="w-4 h-4" />
            Verbindungen
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-2">
          <div
            v-for="conn in connections"
            :key="conn.name"
            class="flex items-center justify-between text-sm"
          >
            <div class="flex items-center gap-2">
              <component :is="conn.icon" class="w-3.5 h-3.5 text-muted-foreground" />
              <span>{{ conn.name }}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span v-if="conn.detail" class="text-xs text-muted-foreground hidden sm:inline">
                {{ conn.detail }}
              </span>
              <div 
                v-if="conn.loading"
                class="w-2.5 h-2.5 rounded-full bg-muted-foreground/50 animate-pulse"
              />
              <div 
                v-else
                class="w-2.5 h-2.5 rounded-full"
                :class="conn.connected ? 'bg-green-500' : 'bg-red-500'"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Tasks Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Today's Tasks -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle class="flex items-center gap-2">
              <span>📅</span> Heute
            </CardTitle>
            <Button size="sm" @click="printDailySummary" :disabled="tasks.length === 0">
              <Printer class="w-4 h-4 mr-2" />
              Drucken
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div v-if="tasks.length === 0" class="text-center py-8 text-muted-foreground">
            Keine Aufgaben für heute
          </div>
          <ul v-else class="space-y-2">
            <li
              v-for="task in tasks"
              :key="task.id"
              class="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <div class="flex-1">
                <div class="font-medium">{{ task.title }}</div>
                <div v-if="task.labels?.length" class="flex gap-1 mt-1 flex-wrap">
                  <span
                    v-for="label in task.labels"
                    :key="label"
                    class="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                  >
                    {{ label }}
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="icon" @click="printTask(task)">
                <Printer class="w-4 h-4" />
              </Button>
            </li>
          </ul>
        </CardContent>
      </Card>

      <!-- Week's Tasks -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle class="flex items-center gap-2">
              <span>📆</span> Diese Woche
            </CardTitle>
            <Button size="sm" @click="printWeeklySummary" :disabled="weekTasks.length === 0">
              <Printer class="w-4 h-4 mr-2" />
              Drucken
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div v-if="weekTasks.length === 0" class="text-center py-8 text-muted-foreground">
            Keine Aufgaben diese Woche
          </div>
          <ul v-else class="space-y-2 max-h-96 overflow-y-auto">
            <li
              v-for="task in weekTasks"
              :key="task.id"
              class="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
            >
              <div class="flex-1">
                <div class="font-medium">{{ task.title }}</div>
                <div class="flex items-center gap-2 mt-1">
                  <span v-if="task.due" class="text-xs text-muted-foreground">
                    {{ new Date(task.due).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }) }}
                  </span>
                  <div v-if="task.labels?.length" class="flex gap-1 flex-wrap">
                    <span
                      v-for="label in task.labels"
                      :key="label"
                      class="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                    >
                      {{ label }}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>

    <!-- Calendar Boxes -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Trash Calendar -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Trash2 class="w-5 h-5" />
            Müllabfuhr
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="trashEvents.length === 0" class="text-center py-6 text-muted-foreground">
            Keine kommenden Abholtermine
          </div>
          <ul v-else class="space-y-2">
            <li
              v-for="event in trashEvents"
              :key="event.type"
              class="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
            >
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded-full" :class="getTrashColor(event.type)" />
                <span class="font-medium">{{ event.label }}</span>
              </div>
              <span class="text-sm text-muted-foreground">{{ formatDate(event.date) }}</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <!-- Family Calendar -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle class="flex items-center gap-2">
              <CalendarDays class="w-5 h-5" />
              Familien-Kalender
            </CardTitle>
            <a 
              href="https://calendar.google.com/calendar" 
              target="_blank"
              class="text-muted-foreground hover:text-foreground transition-colors"
              title="In Google Kalender öffnen"
            >
              <ExternalLink class="w-4 h-4" />
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <div v-if="familyEvents.length === 0" class="text-center py-6 text-muted-foreground">
            Keine Termine diese Woche
          </div>
          <ul v-else class="space-y-2 max-h-64 overflow-y-auto">
            <li
              v-for="(event, idx) in familyEvents"
              :key="idx"
              class="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
            >
              <div class="flex-1">
                <div class="font-medium">{{ event.summary }}</div>
                <div v-if="event.location" class="text-xs text-muted-foreground">{{ event.location }}</div>
              </div>
              <div class="text-right text-sm">
                <div class="text-muted-foreground">{{ formatDate(event.start) }}</div>
                <div v-if="!event.allDay" class="text-xs">{{ formatTime(event.start) }}</div>
              </div>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
