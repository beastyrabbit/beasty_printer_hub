<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckSquare, Calendar, Printer, Wifi, WifiOff } from 'lucide-vue-next'

interface Task {
  id: string | number
  title: string
  description?: string
  due?: string
  labels?: string[]
}

const tasks = ref<Task[]>([])
const weekTasks = ref<Task[]>([])
const loading = ref(false)
const todayCount = ref(0)
const weekCount = ref(0)
const printerStatus = ref<{ reachable: boolean; ip?: string } | null>(null)

async function loadTasks() {
  loading.value = true
  try {
    const res = await fetch('/api/tasks/today')
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
    const res = await fetch('/api/tasks/week')
    const data = await res.json()
    weekTasks.value = data.tasks || []
    weekCount.value = weekTasks.value.length
  } catch (err) {
    console.error('Failed to load week tasks:', err)
  }
}

async function checkPrinter() {
  try {
    const res = await fetch('/api/printer/status')
    printerStatus.value = await res.json()
  } catch (err) {
    printerStatus.value = { reachable: false }
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
    await fetch('/api/tasks/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id })
    })
  } catch (err) {
    console.error('Print failed:', err)
  }
}

onMounted(() => {
  loadTasks()
  loadWeekTasks()
  checkPrinter()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header with WLAN button -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Dashboard</h1>
        <p class="text-muted-foreground">Übersicht deiner Aufgaben</p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" @click="$router.push('/wifi')">
          <Wifi class="w-4 h-4 mr-2" />
          WLAN QR
        </Button>
        <Button @click="loadTasks(); loadWeekTasks()" :disabled="loading">
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

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Printer class="w-4 h-4" />
            Drucker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex items-center gap-2">
            <div 
              class="w-3 h-3 rounded-full"
              :class="printerStatus?.reachable ? 'bg-green-500' : 'bg-red-500'"
            />
            <span class="text-sm">
              {{ printerStatus?.reachable ? 'Verbunden' : 'Nicht erreichbar' }}
            </span>
          </div>
          <p v-if="printerStatus?.ip" class="text-xs text-muted-foreground mt-1">
            {{ printerStatus.ip }}
          </p>
          <Button variant="ghost" size="sm" class="mt-2 h-7 text-xs" @click="checkPrinter">
            Status prüfen
          </Button>
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
