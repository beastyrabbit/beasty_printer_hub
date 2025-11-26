<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save, CheckCircle, Wifi, Printer, Signal, Calendar, Bot, RefreshCw, ExternalLink, Unlink } from 'lucide-vue-next'

const route = useRoute()

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
  trashIcalUrl: '',
  trashEnable: false,
  // Google Calendar OAuth
  googleClientId: '',
  googleClientSecret: '',
  googleCalendarId: '',
  googleConnected: false,
  // AI settings
  ollamaEnabled: false,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  aiDailySummary: false,
  aiWeeklySummary: false,
})

// Google OAuth state
const googleCalendars = ref<{id: string, summary: string, primary: boolean}[]>([])
const googleConnecting = ref(false)
const googleMessage = ref('')

const saving = ref(false)
const saved = ref(false)
const passwordSet = ref(false)
const wifiPasswordSet = ref(false)
const googleSecretSet = ref(false)

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
      trashIcalUrl: cfg.trashIcalUrl || '',
      trashEnable: cfg.trashEnable || false,
      googleClientId: cfg.googleClientId || '',
      googleClientSecret: '',
      googleCalendarId: cfg.googleCalendarId || '',
      googleConnected: cfg.googleConnected || false,
      ollamaEnabled: cfg.ollamaEnabled || false,
      ollamaUrl: cfg.ollamaUrl || 'http://localhost:11434',
      ollamaModel: cfg.ollamaModel || 'llama3.2',
      aiDailySummary: cfg.aiDailySummary || false,
      aiWeeklySummary: cfg.aiWeeklySummary || false,
    }
    passwordSet.value = cfg.donotickPassword === '********'
    wifiPasswordSet.value = cfg.wifiPassword === '********'
    googleSecretSet.value = cfg.googleClientSecret === '********'
    
    // Load Google Calendar status
    if (cfg.googleConnected) {
      await loadGoogleStatus()
    }
  } catch (err) {
    console.error('Failed to load config:', err)
  }
}

async function loadGoogleStatus() {
  try {
    const res = await fetch('/api/google/status')
    const data = await res.json()
    config.value.googleConnected = data.connected
    googleCalendars.value = data.calendars || []
  } catch (err) {
    console.error('Failed to load Google status:', err)
  }
}

async function connectGoogle() {
  // First save the credentials
  if (config.value.googleClientId && config.value.googleClientSecret) {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        googleClientId: config.value.googleClientId,
        googleClientSecret: config.value.googleClientSecret
      })
    })
  }
  
  googleConnecting.value = true
  try {
    const res = await fetch('/api/google/auth-url')
    const data = await res.json()
    if (data.error) {
      googleMessage.value = data.error
      return
    }
    // Redirect to Google OAuth
    window.location.href = data.authUrl
  } catch (err) {
    googleMessage.value = 'Fehler beim Verbinden'
    console.error(err)
  } finally {
    googleConnecting.value = false
  }
}

async function disconnectGoogle() {
  try {
    await fetch('/api/google/disconnect', { method: 'POST' })
    config.value.googleConnected = false
    googleCalendars.value = []
    googleMessage.value = 'Google Kalender getrennt'
  } catch (err) {
    console.error('Failed to disconnect:', err)
  }
}

async function saveConfig() {
  saving.value = true
  try {
    const updates: Record<string, any> = { ...config.value }
    
    // Don't send empty passwords/secrets (keep existing)
    if (!updates.donotickPassword) {
      delete updates.donotickPassword
    }
    if (!updates.wifiPassword) {
      delete updates.wifiPassword
    }
    if (!updates.googleClientSecret) {
      delete updates.googleClientSecret
    }
    // Remove read-only fields
    delete updates.googleConnected
    
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

onMounted(() => {
  loadConfig()
  
  // Check for OAuth callback messages
  const googleSuccess = route.query.google_success
  const googleError = route.query.google_error
  
  if (googleSuccess) {
    googleMessage.value = 'Google Kalender erfolgreich verbunden!'
    // Remove query params from URL
    window.history.replaceState({}, '', '/settings')
  } else if (googleError) {
    googleMessage.value = `Fehler: ${googleError}`
    window.history.replaceState({}, '', '/settings')
  }
})
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
      <CardContent class="space-y-6">
        <p class="text-sm text-muted-foreground">
          Kalender-Termine können in die Druckausgaben integriert werden.
        </p>
        
        <!-- Trash Calendar -->
        <div class="space-y-3 p-4 border border-border rounded-lg">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium">Abfall-Kalender</label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="config.trashEnable" class="rounded" />
              <span class="text-sm">Aktiviert</span>
            </label>
          </div>
          <div v-if="config.trashEnable" class="space-y-2">
            <Input 
              v-model="config.trashIcalUrl" 
              placeholder="https://example.com/abfall.ics" 
            />
            <p class="text-xs text-muted-foreground">
              iCal-URL für Müllabfuhr-Termine
            </p>
          </div>
        </div>

        <!-- Google Calendar OAuth -->
        <div class="space-y-4 p-4 border border-border rounded-lg">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium">Google Kalender</label>
            <div v-if="config.googleConnected" class="flex items-center gap-2 text-green-500 text-sm">
              <div class="w-2 h-2 rounded-full bg-green-500" />
              Verbunden
            </div>
          </div>
          
          <!-- OAuth Status Message -->
          <div v-if="googleMessage" class="p-3 rounded-lg text-sm" 
               :class="googleMessage.includes('Fehler') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'">
            {{ googleMessage }}
          </div>
          
          <!-- Connected State -->
          <div v-if="config.googleConnected" class="space-y-3">
            <div class="space-y-2">
              <label class="text-sm text-muted-foreground">Kalender auswählen</label>
              <select 
                v-model="config.googleCalendarId"
                class="w-full h-9 rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm"
              >
                <option value="">Standard (Primary)</option>
                <option v-for="cal in googleCalendars" :key="cal.id" :value="cal.id">
                  {{ cal.summary }} {{ cal.primary ? '(Primary)' : '' }}
                </option>
              </select>
            </div>
            <Button variant="outline" @click="disconnectGoogle" class="text-red-400 hover:text-red-300">
              <Unlink class="w-4 h-4 mr-2" />
              Google Kalender trennen
            </Button>
          </div>
          
          <!-- Not Connected State -->
          <div v-else class="space-y-4">
            <p class="text-xs text-muted-foreground">
              Verbinde deinen Google Kalender um private Termine anzuzeigen. 
              Du benötigst OAuth-Zugangsdaten von der 
              <a href="https://console.cloud.google.com/" target="_blank" class="text-primary hover:underline">
                Google Cloud Console <ExternalLink class="w-3 h-3 inline" />
              </a>
            </p>
            
            <div class="space-y-3">
              <div class="space-y-2">
                <label class="text-sm font-medium">Client ID</label>
                <Input 
                  v-model="config.googleClientId" 
                  placeholder="xxx.apps.googleusercontent.com" 
                />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium">Client Secret</label>
                <Input 
                  v-model="config.googleClientSecret" 
                  type="password"
                  :placeholder="googleSecretSet ? '••••••• (gespeichert)' : 'Ihr Client Secret'" 
                />
              </div>
            </div>
            
            <Button 
              @click="connectGoogle" 
              :disabled="googleConnecting || (!config.googleClientId && !googleSecretSet)"
              class="w-full"
            >
              <ExternalLink class="w-4 h-4 mr-2" />
              {{ googleConnecting ? 'Verbinde...' : 'Mit Google verbinden' }}
            </Button>
            
            <details class="text-xs text-muted-foreground">
              <summary class="cursor-pointer hover:text-foreground">Anleitung</summary>
              <ol class="mt-2 space-y-1 list-decimal list-inside">
                <li>Gehe zu <a href="https://console.cloud.google.com/" target="_blank" class="text-primary hover:underline">console.cloud.google.com</a></li>
                <li>Erstelle ein neues Projekt oder wähle ein bestehendes</li>
                <li>Aktiviere die "Google Calendar API"</li>
                <li>Gehe zu "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"</li>
                <li>Wähle "Web application"</li>
                <li>Füge als Redirect URI hinzu: <code class="bg-muted px-1 rounded">http://localhost:3000/api/google/callback</code></li>
                <li>Kopiere Client ID und Client Secret hierher</li>
              </ol>
            </details>
          </div>
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
