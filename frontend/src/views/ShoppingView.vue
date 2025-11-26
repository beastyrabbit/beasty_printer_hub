<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Printer, Copy, RotateCcw, FolderPlus, X, Folder } from 'lucide-vue-next'

const router = useRouter()

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

interface Collection {
  id: string
  name: string
  items: { itemId: string; quantity: number }[]
}

const items = ref<ShoppingItem[]>([])
const list = ref<ListItem[]>([])
const collections = ref<Collection[]>([])
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
    const [itemsRes, listRes, collectionsRes] = await Promise.all([
      fetch('/api/shopping/items'),
      fetch('/api/shopping/list'),
      fetch('/api/shopping/collections')
    ])
    const itemsData = await itemsRes.json()
    const listData = await listRes.json()
    const collectionsData = await collectionsRes.json()
    items.value = itemsData.items || []
    list.value = listData.list || []
    collections.value = collectionsData.collections || []
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
    await fetch('/api/shopping/list', { 
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    })
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

async function applyCollection(collectionId: string) {
  try {
    await fetch(`/api/shopping/collections/${collectionId}/apply`, {
      method: 'POST'
    })
    await loadData()
  } catch (err) {
    console.error('Failed to apply collection:', err)
  }
}

function handleSearch(e: KeyboardEvent) {
  if (e.key === 'Enter' && searchQuery.value.trim()) {
    const filtered = filteredItems.value
    if (filtered.length === 1 && filtered[0]) {
      addToList(filtered[0].id)
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
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Einkaufsliste</h1>
        <p class="text-muted-foreground">Klicken um hinzuzufügen</p>
      </div>
      <Button variant="outline" @click="router.push('/collections')">
        <FolderPlus class="w-4 h-4 mr-2" />
        Sammlungen
      </Button>
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

          <!-- Collections Section -->
          <div v-if="collections.length > 0" class="space-y-2">
            <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Sammlungen</h3>
            <div
              v-for="collection in collections"
              :key="collection.id"
              class="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors cursor-pointer"
              @click="applyCollection(collection.id)"
            >
              <div class="flex items-center gap-2">
                <Folder class="w-4 h-4 text-primary" />
                <span class="font-medium">{{ collection.name }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-sm text-muted-foreground">{{ collection.items.length }} Items</span>
                <Button variant="ghost" size="icon" class="h-8 w-8">
                  <Plus class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <!-- Items List -->
          <div class="space-y-2 max-h-80 overflow-y-auto">
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
                <Button variant="ghost" size="icon" class="h-8 w-8" @click.stop="addToList(item.id)">
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
                <span class="text-sm text-muted-foreground w-10">{{ getUnitShort(item.item?.unit || 'st') }}</span>
                <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:text-destructive" @click="removeFromList(item.itemId)">
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
            <Button @click="printList" :disabled="list.length === 0">
              <Printer class="w-4 h-4 mr-2" />
              Drucken
            </Button>
            <Button variant="outline" @click="copyList" :disabled="list.length === 0">
              <Copy class="w-4 h-4 mr-2" />
              Kopieren
            </Button>
            <Button variant="outline" @click="resetList" class="col-span-2">
              <RotateCcw class="w-4 h-4 mr-2" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
