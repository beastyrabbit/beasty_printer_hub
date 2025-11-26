<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw, Trash2 } from 'lucide-vue-next'

interface LogEntry {
  timestamp: string
  level: string
  message: string
  extra?: any
}

const logs = ref<LogEntry[]>([])
const loading = ref(false)

async function loadLogs() {
  loading.value = true
  try {
    const res = await fetch('/api/logs')
    const data = await res.json()
    logs.value = data.logs || []
  } catch (err) {
    console.error('Failed to load logs:', err)
  } finally {
    loading.value = false
  }
}

async function clearLogs() {
  if (!confirm('Alle Logs löschen?')) return
  try {
    await fetch('/api/logs', { method: 'DELETE' })
    logs.value = []
  } catch (err) {
    console.error('Failed to clear logs:', err)
  }
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'error': return 'text-red-500'
    case 'warn': return 'text-yellow-500'
    default: return 'text-muted-foreground'
  }
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(loadLogs)
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Aktivität</h1>
        <p class="text-muted-foreground">Letzte Aktionen und Logs</p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" @click="loadLogs" :disabled="loading">
          <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': loading }" />
          Aktualisieren
        </Button>
        <Button variant="outline" @click="clearLogs">
          <Trash2 class="w-4 h-4 mr-2" />
          Löschen
        </Button>
      </div>
    </div>

    <!-- Logs -->
    <Card>
      <CardHeader>
        <CardTitle>Log Einträge</CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="logs.length === 0" class="text-center py-8 text-muted-foreground">
          Keine Logs vorhanden
        </div>
        <div v-else class="space-y-2 max-h-[600px] overflow-y-auto">
          <div
            v-for="(log, i) in logs"
            :key="i"
            class="flex items-start gap-4 p-3 rounded-lg bg-secondary/50 font-mono text-sm"
          >
            <span class="text-muted-foreground shrink-0">{{ formatTime(log.timestamp) }}</span>
            <span :class="getLevelColor(log.level)" class="uppercase font-bold shrink-0 w-12">
              {{ log.level }}
            </span>
            <span class="flex-1">{{ log.message }}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

