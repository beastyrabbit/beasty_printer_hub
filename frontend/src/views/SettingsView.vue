<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save, CheckCircle, Wifi, WifiOff, Printer } from 'lucide-vue-next'

const config = ref({
  donotickBaseUrl: '',
  donotickUsername: '',
  donotickPassword: '',
  printerIp: '',
  printerPort: 9100,
  dailyPrintTime: '08:00',
  weeklyPrintTime: '08:00',
})

const saving = ref(false)
const saved = ref(false)
const passwordSet = ref(false)

// Printer test states
const testingConnection = ref(false)
const connectionResult = ref<{ reachable: boolean; error?: string } | null>(null)
const testingPrint = ref(false)

async function loadConfig() {
  try {
    const res = await fetch('/api/config')
    const data = await res.json()
    const cfg = data.config
    config.value = {
      donotickBaseUrl: cfg.donotickBaseUrl || '',
      donotickUsername: cfg.donotickUsername || '',
      donotickPassword: '',
      printerIp: cfg.printerIp || '',
      printerPort: cfg.printerPort || 9100,
      dailyPrintTime: cfg.dailyPrintTime || '08:00',
      weeklyPrintTime: cfg.weeklyPrintTime || '08:00',
    }
    passwordSet.value = cfg.donotickPassword === '********'
  } catch (err) {
    console.error('Failed to load config:', err)
  }
}

async function saveConfig() {
  saving.value = true
  try {
    const updates: Record<string, any> = { ...config.value }
    
    // Don't send empty password (keep existing)
    if (!updates.donotickPassword) {
      delete updates.donotickPassword
    }
    
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
    
    saved.value = true
    setTimeout(() => { saved.value = false }, 3000)
  } catch (err) {
    console.error('Failed to save:', err)
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testingConnection.value = true
  connectionResult.value = null
  try {
    const res = await fetch('/api/printer/status')
    connectionResult.value = await res.json()
  } catch (err) {
    connectionResult.value = { reachable: false, error: 'Fehler bei der Verbindung' }
  } finally {
    testingConnection.value = false
  }
}

async function testPrint() {
  testingPrint.value = true
  try {
    await fetch('/api/printer/test', { method: 'POST' })
  } catch (err) {
    console.error('Test print failed:', err)
  } finally {
    testingPrint.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- Page Header -->
    <div>
      <h1 class="text-2xl font-bold">Einstellungen</h1>
      <p class="text-muted-foreground">Konfiguriere deinen Printer Hub</p>
    </div>

    <!-- Donotick Connection -->
    <Card>
      <CardHeader>
        <CardTitle>Donotick Verbindung</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm font-medium">Server URL</label>
          <Input v-model="config.donotickBaseUrl" placeholder="http://192.168.50.250:2021" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Username</label>
            <Input v-model="config.donotickUsername" placeholder="your-username" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium">Password</label>
            <Input
              v-model="config.donotickPassword"
              type="password"
              :placeholder="passwordSet ? '••••••• (gespeichert)' : 'your-password'"
            />
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Printer Settings -->
    <Card>
      <CardHeader>
        <CardTitle>Drucker</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Drucker IP</label>
            <Input v-model="config.printerIp" placeholder="192.168.10.30" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium">Port</label>
            <Input v-model="config.printerPort" type="number" />
          </div>
        </div>

        <!-- Test Buttons -->
        <div class="flex items-center gap-4 pt-2">
          <Button variant="outline" @click="testConnection" :disabled="testingConnection">
            <template v-if="testingConnection">
              Teste...
            </template>
            <template v-else-if="connectionResult">
              <Wifi v-if="connectionResult.reachable" class="w-4 h-4 mr-2 text-green-500" />
              <WifiOff v-else class="w-4 h-4 mr-2 text-red-500" />
              {{ connectionResult.reachable ? 'Verbunden' : 'Nicht erreichbar' }}
            </template>
            <template v-else>
              <Wifi class="w-4 h-4 mr-2" />
              Verbindung testen
            </template>
          </Button>
          
          <Button variant="outline" @click="testPrint" :disabled="testingPrint">
            <Printer class="w-4 h-4 mr-2" />
            {{ testingPrint ? 'Druckt...' : 'Testseite drucken' }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Schedule Settings -->
    <Card>
      <CardHeader>
        <CardTitle>Zeitplan</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Täglicher Druck</label>
            <Input v-model="config.dailyPrintTime" type="time" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium">Wöchentlicher Druck</label>
            <Input v-model="config.weeklyPrintTime" type="time" />
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Save Button -->
    <div class="flex justify-end">
      <Button @click="saveConfig" :disabled="saving" class="min-w-32">
        <CheckCircle v-if="saved" class="w-4 h-4 mr-2" />
        <Save v-else class="w-4 h-4 mr-2" />
        {{ saved ? 'Gespeichert!' : saving ? 'Speichert...' : 'Speichern' }}
      </Button>
    </div>
  </div>
</template>
