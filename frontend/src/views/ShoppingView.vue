<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Printer, Copy, RotateCcw, Save, Pencil, X } from 'lucide-vue-next'

interface ShoppingItem {
  id: string
  name: string
  unit: string
  usageCount: number
  alwaysOnList: boolean
  alwaysQuantity: number
}

interface ListItem {
  itemId: string
  quantity: number
}

const items = ref<ShoppingItem[]>([])
const list = ref<ListItem[]>([])
const searchQuery = ref('')
const loading = ref(false)

const filteredItems = computed(() => {
  if (!searchQuery.value) return items.value
  const q = searchQuery.value.toLowerCase()
  return items.value.filter(i => i.name.toLowerCase().includes(q))
})

const listWithItems = computed(() => {
  return list.value.map(l => {
    const item = items.value.find(i => i.id === l.itemId)
    return { ...l, item }
  }).filter(l => l.item)
})

async function loadData() {
  loading.value = true
  try {
    const [itemsRes, listRes] = await Promise.all([
      fetch('/api/shopping/items'),
      fetch('/api/shopping/list')
    ])
    const itemsData = await itemsRes.json()
    const listData = await listRes.json()
    items.value = itemsData.items || []
    list.value = listData.list || []
  } catch (err) {
    console.error('Failed to load:', err)
  } finally {
    loading.value = false
  }
}

async function addToList(itemId: string) {
  try {
    await fetch('/api/shopping/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, quantity: 1 })
    })
    await loadData()
  } catch (err) {
    console.error('Failed to add:', err)
  }
}

async function removeFromList(itemId: string) {
  try {
    await fetch(`/api/shopping/list?itemId=${itemId}`, { method: 'DELETE' })
    await loadData()
  } catch (err) {
    console.error('Failed to remove:', err)
  }
}

async function updateQuantity(itemId: string, quantity: number) {
  try {
    await fetch('/api/shopping/list', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, quantity })
    })
    const item = list.value.find(l => l.itemId === itemId)
    if (item) item.quantity = quantity
  } catch (err) {
    console.error('Failed to update:', err)
  }
}

async function createItem(name: string) {
  try {
    const res = await fetch('/api/shopping/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, unit: 'st' })
    })
    const data = await res.json()
    if (data.item) {
      items.value.push(data.item)
      await addToList(data.item.id)
      searchQuery.value = ''
    }
  } catch (err) {
    console.error('Failed to create:', err)
  }
}

function handleSearch(e: KeyboardEvent) {
  if (e.key === 'Enter' && searchQuery.value.trim()) {
    if (filteredItems.value.length === 1) {
      addToList(filteredItems.value[0].id)
      searchQuery.value = ''
    } else {
      const exact = items.value.find(i => i.name.toLowerCase() === searchQuery.value.toLowerCase())
      if (exact) {
        addToList(exact.id)
        searchQuery.value = ''
      } else {
        createItem(searchQuery.value.trim())
      }
    }
  }
}

async function printList() {
  try {
    await fetch('/api/shopping/print', { method: 'POST' })
  } catch (err) {
    console.error('Print failed:', err)
  }
}

async function copyList() {
  const text = listWithItems.value
    .map(l => `${l.quantity}x ${l.item?.name}`)
    .join('\n')
  await navigator.clipboard.writeText(text)
}

async function resetList() {
  try {
    await fetch('/api/shopping/list/reset', { method: 'POST' })
    await loadData()
  } catch (err) {
    console.error('Reset failed:', err)
  }
}

function getUnitShort(unit: string): string {
  const units: Record<string, string> = {
    st: 'St.', dose: 'Dose', glas: 'Glas', pack: 'Pkg.',
    flasche: 'Fl.', beutel: 'Btl.', becher: 'Bch.',
    kasten: 'Kst.', karton: 'Krt.', bund: 'Bund',
    g: 'g', kg: 'kg', ml: 'ml', l: 'L'
  }
  return units[unit] || unit
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div>
      <h1 class="text-2xl font-bold">Einkaufsliste</h1>
      <p class="text-muted-foreground">Drag & Drop zum Hinzufügen</p>
    </div>

    <!-- Two Column Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Storage (Left) -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle>Lager</CardTitle>
            <span class="text-sm text-muted-foreground bg-secondary px-2 py-1 rounded-full">
              {{ items.length }}
            </span>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- Search -->
          <div>
            <Input
              v-model="searchQuery"
              placeholder="Suchen oder neues Item..."
              @keydown="handleSearch"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Enter drücken um hinzuzufügen oder neues Item zu erstellen
            </p>
          </div>

          <!-- Items List -->
          <div class="space-y-2 max-h-96 overflow-y-auto">
            <div
              v-for="item in filteredItems"
              :key="item.id"
              class="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
              @click="addToList(item.id)"
            >
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ item.name }}</span>
                <span v-if="item.alwaysOnList" class="text-primary" title="Immer auf der Liste">★</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-sm text-muted-foreground">{{ getUnitShort(item.unit) }}</span>
                <Button variant="ghost" size="icon" class="h-8 w-8">
                  <Plus class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Shopping List (Right) -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle>Einkaufsliste</CardTitle>
            <span class="text-sm text-muted-foreground bg-primary/10 text-primary px-2 py-1 rounded-full">
              {{ list.length }}
            </span>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- List Items -->
          <div class="space-y-2 min-h-48">
            <div
              v-for="item in listWithItems"
              :key="item.itemId"
              class="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
            >
              <span class="font-medium">{{ item.item?.name }}</span>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  :value="item.quantity"
                  min="1"
                  class="w-16 h-8 rounded border border-input bg-transparent px-2 text-center text-sm"
                  @change="(e) => updateQuantity(item.itemId, parseInt((e.target as HTMLInputElement).value) || 1)"
                />
                <span class="text-sm text-muted-foreground">{{ getUnitShort(item.item?.unit || 'st') }}</span>
                <Button variant="ghost" size="icon" class="h-8 w-8" @click="removeFromList(item.itemId)">
                  <X class="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div v-if="list.length === 0" class="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
              Items aus dem Lager hinzufügen
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="grid grid-cols-2 gap-2">
            <Button @click="printList">
              <Printer class="w-4 h-4 mr-2" />
              Drucken
            </Button>
            <Button variant="outline" @click="copyList">
              <Copy class="w-4 h-4 mr-2" />
              Kopieren
            </Button>
            <Button variant="outline" @click="resetList">
              <RotateCcw class="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Button variant="outline">
              <Save class="w-4 h-4 mr-2" />
              Sammlung
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

