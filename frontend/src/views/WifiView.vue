<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Printer, Wifi } from 'lucide-vue-next'

const router = useRouter()

const ssid = ref('')
const password = ref('')
const securityType = ref('WPA')
const hidden = ref(false)
const printing = ref(false)

async function printWifiQr() {
  if (!ssid.value.trim()) return
  
  printing.value = true
  try {
    await fetch('/api/print/wifi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ssid: ssid.value,
        password: password.value,
        type: securityType.value,
        hidden: hidden.value
      })
    })
    // Clear form after successful print
    ssid.value = ''
    password.value = ''
  } catch (err) {
    console.error('Print failed:', err)
  } finally {
    printing.value = false
  }
}
</script>

<template>
  <div class="max-w-lg mx-auto space-y-6">
    <!-- Page Header -->
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="icon" @click="router.push('/')">
        <ArrowLeft class="w-5 h-5" />
      </Button>
      <div>
        <h1 class="text-2xl font-bold">WLAN QR-Code</h1>
        <p class="text-muted-foreground">QR-Code zum schnellen Verbinden drucken</p>
      </div>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Wifi class="w-5 h-5" />
          Netzwerk Details
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm font-medium">Netzwerkname (SSID)</label>
          <Input v-model="ssid" placeholder="MeinWLAN" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Passwort</label>
          <Input v-model="password" type="password" placeholder="Passwort" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Verschlüsselung</label>
          <select 
            v-model="securityType"
            class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            <option value="WPA">WPA/WPA2/WPA3</option>
            <option value="WEP">WEP</option>
            <option value="nopass">Offen (kein Passwort)</option>
          </select>
        </div>

        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" v-model="hidden" class="rounded" />
          <span class="text-sm">Verstecktes Netzwerk</span>
        </label>

        <Button @click="printWifiQr" :disabled="!ssid.trim() || printing" class="w-full">
          <Printer class="w-4 h-4 mr-2" />
          {{ printing ? 'Druckt...' : 'QR-Code drucken' }}
        </Button>
      </CardContent>
    </Card>
  </div>
</template>

