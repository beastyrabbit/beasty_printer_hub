<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save, CheckCircle } from 'lucide-vue-next'

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

