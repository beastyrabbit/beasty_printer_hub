<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckSquare, Calendar, Printer, Wifi, Trash2, CalendarDays, Link2, Bot } from 'lucide-vue-next'

interface Task {
  id: string | number
  title: string
  description?: string
  due?: string
  labels?: string[]
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
  try {
    const res = await fetch('/api/trash/preview')
    const data = await res.json()
    const trash = connections.value.find(c => c.name === 'Abfall-Kalender')
    if (trash) {
      const eventCount = data.events?.length || 0
      trash.connected = eventCount > 0
      trash.detail = eventCount > 0 ? `${eventCount} Termine` : 'Keine Termine'
      trash.loading = false
    }
  } catch {
    const trash = connections.value.find(c => c.name === 'Abfall-Kalender')
    if (trash) { trash.connected = false; trash.detail = 'Fehler'; trash.loading = false }
  }

  // Check Family calendar
  try {
    const res = await fetch('/api/calendar/week')
    const data = await res.json()
    const family = connections.value.find(c => c.name === 'Familien-Kalender')
    if (family) {
      const eventCount = data.events?.length || 0
      if (eventCount > 0) {
        family.connected = true
        family.detail = `${eventCount} Termine diese Woche`
      } else {
        // Check if calendar is configured
        const configRes = await fetch('/api/config')
        const configData = await configRes.json()
        if (configData.config?.googleCalendarUrl) {
          family.connected = true
          family.detail = 'Keine Termine diese Woche'
        } else {
          family.connected = false
          family.detail = 'Nicht konfiguriert'
        }
      }
      family.loading = false
    }
  } catch {
    const family = connections.value.find(c => c.name === 'Familien-Kalender')
    if (family) { family.connected = false; family.detail = 'Fehler'; family.loading = false }
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

function refreshAll() {
  loadTasks()
  loadWeekTasks()
  checkAllConnections()
}

onMounted(() => {
  loadTasks()
  loadWeekTasks()
  checkAllConnections()
  // Auto-check status every 30 seconds
  statusCheckInterval = window.setInterval(checkAllConnections, 30000)
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

    <!-- Main Content Grid -->
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
  </div>
</template>
