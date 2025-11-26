<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save, CheckCircle, Wifi, Printer, Signal, Calendar, Bot, RefreshCw } from 'lucide-vue-next'

const config = ref({
  donotickBaseUrl: '',
  donotickUsername: '',
  donotickPassword: '',
  printerIp: '',
  printerPort: 9100,
  dailyPrintTime: '08:00',
  weeklyPrintTime: '08:00',
  wifiSsid: '',
  wifiPassword: '',
  wifiType: 'WPA',
  wifiHidden: false,
  // Calendar settings
  googleCalendarUrl: '',
  // AI settings
  ollamaEnabled: false,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  aiDailySummary: false,
  aiWeeklySummary: false,
})

const saving = ref(false)
const saved = ref(false)
const passwordSet = ref(false)
const wifiPasswordSet = ref(false)

// Printer test states
const testingConnection = ref(false)
const connectionStatus = ref<boolean | null>(null)
const testingPrint = ref(false)

// AI test states
const testingAi = ref(false)
const aiStatus = ref<{ available: boolean; models: string[] } | null>(null)

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
      wifiSsid: cfg.wifiSsid || '',
      wifiPassword: '',
      wifiType: cfg.wifiType || 'WPA',
      wifiHidden: cfg.wifiHidden || false,
      googleCalendarUrl: cfg.googleCalendarUrl || '',
      ollamaEnabled: cfg.ollamaEnabled || false,
      ollamaUrl: cfg.ollamaUrl || 'http://localhost:11434',
      ollamaModel: cfg.ollamaModel || 'llama3.2',
      aiDailySummary: cfg.aiDailySummary || false,
      aiWeeklySummary: cfg.aiWeeklySummary || false,
    }
    passwordSet.value = cfg.donotickPassword === '********'
    wifiPasswordSet.value = cfg.wifiPassword === '********'
  } catch (err) {
    console.error('Failed to load config:', err)
  }
}

async function saveConfig() {
  saving.value = true
  try {
    const updates: Record<string, any> = { ...config.value }
    
    // Don't send empty passwords (keep existing)
    if (!updates.donotickPassword) {
      delete updates.donotickPassword
    }
    if (!updates.wifiPassword) {
      delete updates.wifiPassword
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
  connectionStatus.value = null
  try {
    const res = await fetch('/api/printer/status')
    const data = await res.json()
    connectionStatus.value = data.reachable
  } catch (err) {
    connectionStatus.value = false
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

async function testAiConnection() {
  testingAi.value = true
  aiStatus.value = null
  try {
    const res = await fetch('/api/ai/status')
    aiStatus.value = await res.json()
  } catch (err) {
    aiStatus.value = { available: false, models: [] }
  } finally {
    testingAi.value = false
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

        <div class="flex gap-2">
          <Button variant="outline" @click="testConnection" :disabled="testingConnection">
            <Signal class="w-4 h-4 mr-2" />
            {{ testingConnection ? 'Teste...' : 'Verbindung testen' }}
          </Button>
          <Button variant="outline" @click="testPrint" :disabled="testingPrint">
            <Printer class="w-4 h-4 mr-2" />
            {{ testingPrint ? 'Druckt...' : 'Testseite drucken' }}
          </Button>
        </div>
        
        <div v-if="connectionStatus !== null" class="flex items-center gap-2 text-sm">
          <div 
            class="w-3 h-3 rounded-full"
            :class="connectionStatus ? 'bg-green-500' : 'bg-red-500'"
          />
          {{ connectionStatus ? 'Drucker erreichbar' : 'Drucker nicht erreichbar' }}
        </div>
      </CardContent>
    </Card>

    <!-- Calendar Settings -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Calendar class="w-5 h-5" />
          Kalender Integration
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Kalender-Termine können in die Druckausgaben integriert werden.
        </p>
        
        <div class="space-y-2">
          <label class="text-sm font-medium">Google Kalender URL</label>
          <Input 
            v-model="config.googleCalendarUrl" 
            placeholder="https://calendar.google.com/calendar/embed?src=..." 
          />
          <p class="text-xs text-muted-foreground">
            Embed-URL oder iCal-URL des öffentlichen Kalenders
          </p>
        </div>

      </CardContent>
    </Card>

    <!-- AI Settings -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Bot class="w-5 h-5" />
          KI Zusammenfassungen
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Lokale KI (Ollama) kann automatische Zusammenfassungen generieren.
        </p>
        
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" v-model="config.ollamaEnabled" class="rounded" />
          <span class="text-sm font-medium">KI aktivieren</span>
        </label>

        <div v-if="config.ollamaEnabled" class="space-y-4 pl-6 border-l-2 border-primary/20">
          <div class="space-y-2">
            <label class="text-sm font-medium">Ollama Server URL</label>
            <Input v-model="config.ollamaUrl" placeholder="http://localhost:11434" />
          </div>
          
          <div class="space-y-2">
            <label class="text-sm font-medium">Modell</label>
            <Input v-model="config.ollamaModel" placeholder="llama3.2" />
            <p class="text-xs text-muted-foreground">
              z.B. llama3.2, mistral, gemma2
            </p>
          </div>

          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="testAiConnection" :disabled="testingAi">
              <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': testingAi }" />
              Verbindung testen
            </Button>
          </div>

          <div v-if="aiStatus" class="p-3 rounded-lg text-sm" :class="aiStatus.available ? 'bg-green-500/10' : 'bg-red-500/10'">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full" :class="aiStatus.available ? 'bg-green-500' : 'bg-red-500'" />
              {{ aiStatus.available ? 'Ollama erreichbar' : 'Ollama nicht erreichbar' }}
            </div>
            <div v-if="aiStatus.models?.length" class="mt-1 text-muted-foreground">
              Modelle: {{ aiStatus.models.join(', ') }}
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Zusammenfassungen aktivieren:</label>
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" v-model="config.aiDailySummary" class="rounded" />
              <span class="text-sm">Tägliche Zusammenfassung</span>
            </label>
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" v-model="config.aiWeeklySummary" class="rounded" />
              <span class="text-sm">Wöchentliche Zusammenfassung</span>
            </label>
          </div>
        </div>

      </CardContent>
    </Card>

    <!-- WLAN QR Settings -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Wifi class="w-5 h-5" />
          WLAN QR-Code
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Diese Einstellungen werden für den WLAN QR-Code Button verwendet.
        </p>
        <div class="space-y-2">
          <label class="text-sm font-medium">Netzwerkname (SSID)</label>
          <Input v-model="config.wifiSsid" placeholder="MeinWLAN" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Passwort</label>
            <Input
              v-model="config.wifiPassword"
              type="password"
              :placeholder="wifiPasswordSet ? '••••••• (gespeichert)' : 'Passwort'"
            />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium">Verschlüsselung</label>
            <select 
              v-model="config.wifiType"
              class="w-full h-9 rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm"
            >
              <option value="WPA">WPA/WPA2/WPA3</option>
              <option value="WEP">WEP</option>
              <option value="nopass">Offen</option>
            </select>
          </div>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" v-model="config.wifiHidden" class="rounded" />
          <span class="text-sm">Verstecktes Netzwerk</span>
        </label>
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
