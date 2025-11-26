<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Printer, Copy, RotateCcw, FolderPlus, X, Folder, Pencil, Trash2 } from 'lucide-vue-next'

const router = useRouter()

interface ShoppingItem {
  id: string
  name: string
  unit: string
  usageCount: number
  alwaysOnList: boolean
  alwaysQuantity: number
}

interface ListEntry {
  itemId?: string
  collectionId?: string
  quantity: number
}

interface Collection {
  id: string
  name: string
  usageCount?: number
  items: { itemId: string; quantity: number }[]
}

// Combined type for display
interface LagerEntry {
  type: 'item' | 'collection'
  id: string
  name: string
  unit?: string
  usageCount: number
  alwaysOnList?: boolean
  alwaysQuantity?: number
  itemCount?: number
}

// List entry with resolved details
interface ListEntryWithDetails {
  type: 'item' | 'collection'
  itemId?: string
  collectionId?: string
  quantity: number
  name: string
  unit?: string
  itemCount?: number
}

const items = ref<ShoppingItem[]>([])
const list = ref<ListEntry[]>([])
const collections = ref<Collection[]>([])
const searchQuery = ref('')
const loading = ref(false)

// Edit modal state
const showEditModal = ref(false)
const editingItem = ref<ShoppingItem | null>(null)
const editForm = ref({
  name: '',
  unit: 'st',
  alwaysOnList: false,
  alwaysQuantity: 1
})

const unitOptions = [
  { value: 'st', label: 'Stück' },
  { value: 'dose', label: 'Dose' },
  { value: 'glas', label: 'Glas' },
  { value: 'pack', label: 'Packung' },
  { value: 'flasche', label: 'Flasche' },
  { value: 'beutel', label: 'Beutel' },
  { value: 'becher', label: 'Becher' },
  { value: 'kasten', label: 'Kasten' },
  { value: 'karton', label: 'Karton' },
  { value: 'bund', label: 'Bund' },
  { value: 'g', label: 'Gramm' },
  { value: 'kg', label: 'Kilogramm' },
  { value: 'ml', label: 'Milliliter' },
  { value: 'l', label: 'Liter' }
]

// Combine items and collections into a single sorted list
const lagerEntries = computed<LagerEntry[]>(() => {
  const entries: LagerEntry[] = []
  
  // Add items
  for (const item of items.value) {
    entries.push({
      type: 'item',
      id: item.id,
      name: item.name,
      unit: item.unit,
      usageCount: item.usageCount,
      alwaysOnList: item.alwaysOnList,
      alwaysQuantity: item.alwaysQuantity
    })
  }
  
  // Add collections
  for (const col of collections.value) {
    entries.push({
      type: 'collection',
      id: col.id,
      name: col.name,
      usageCount: col.usageCount || 0,
      itemCount: col.items.length
    })
  }
  
  // Sort by usage count (descending)
  entries.sort((a, b) => b.usageCount - a.usageCount)
  
  return entries
})

const filteredLager = computed(() => {
  if (!searchQuery.value) return lagerEntries.value
  const q = searchQuery.value.toLowerCase()
  return lagerEntries.value.filter(e => e.name.toLowerCase().includes(q))
})

const listWithDetails = computed<ListEntryWithDetails[]>(() => {
  const result: ListEntryWithDetails[] = []
  for (const l of list.value) {
    if (l.itemId) {
      const item = items.value.find(i => i.id === l.itemId)
      if (item) {
        result.push({
          type: 'item',
          itemId: l.itemId,
          quantity: l.quantity,
          name: item.name,
          unit: item.unit
        })
      }
    } else if (l.collectionId) {
      const col = collections.value.find(c => c.id === l.collectionId)
      if (col) {
        result.push({
          type: 'collection',
          collectionId: l.collectionId,
          quantity: l.quantity,
          name: col.name,
          itemCount: col.items.length
        })
      }
    }
  }
  return result
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

async function addToList(entry: LagerEntry) {
  try {
    if (entry.type === 'item') {
      await fetch('/api/shopping/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: entry.id, quantity: 1 })
      })
    } else {
      // Add collection as a collection entry (not resolved)
      await fetch('/api/shopping/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId: entry.id, quantity: 1 })
      })
    }
    await loadData()
  } catch (err) {
    console.error('Failed to add:', err)
  }
}

async function removeFromList(entry: ListEntryWithDetails) {
  try {
    const id = entry.itemId || entry.collectionId
    await fetch(`/api/shopping/list/${id}`, { method: 'DELETE' })
    await loadData()
  } catch (err) {
    console.error('Failed to remove:', err)
  }
}

async function updateQuantity(entry: ListEntryWithDetails, quantity: number) {
  try {
    const id = entry.itemId || entry.collectionId
    await fetch(`/api/shopping/list/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity })
    })
    await loadData()
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
      await addToList({ type: 'item', id: data.item.id, name: data.item.name, usageCount: 0 })
      searchQuery.value = ''
    }
  } catch (err) {
    console.error('Failed to create:', err)
  }
}

function handleSearch(e: KeyboardEvent) {
  if (e.key === 'Enter' && searchQuery.value.trim()) {
    const filtered = filteredLager.value
    if (filtered.length === 1 && filtered[0]) {
      addToList(filtered[0])
      searchQuery.value = ''
    } else {
      // Check for exact match
      const exact = lagerEntries.value.find(e => e.name.toLowerCase() === searchQuery.value.toLowerCase())
      if (exact) {
        addToList(exact)
        searchQuery.value = ''
      } else {
        // Create new item
        createItem(searchQuery.value.trim())
      }
    }
  }
}

function openEditModal(entry: LagerEntry) {
  if (entry.type !== 'item') return
  const item = items.value.find(i => i.id === entry.id)
  if (!item) return
  
  editingItem.value = item
  editForm.value = {
    name: item.name,
    unit: item.unit || 'st',
    alwaysOnList: item.alwaysOnList || false,
    alwaysQuantity: item.alwaysQuantity || 1
  }
  showEditModal.value = true
}

async function saveItem() {
  if (!editingItem.value) return
  
  try {
    await fetch(`/api/shopping/items/${editingItem.value.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm.value)
    })
    showEditModal.value = false
    editingItem.value = null
    await loadData()
  } catch (err) {
    console.error('Failed to save:', err)
  }
}

async function deleteItem() {
  if (!editingItem.value) return
  if (!confirm('Item wirklich löschen?')) return
  
  try {
    await fetch(`/api/shopping/items/${editingItem.value.id}`, {
      method: 'DELETE'
    })
    showEditModal.value = false
    editingItem.value = null
    await loadData()
  } catch (err) {
    console.error('Failed to delete:', err)
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
  // Resolve collections to their items for copy
  const lines: string[] = []
  for (const entry of listWithDetails.value) {
    if (entry.type === 'collection' && entry.collectionId) {
      const col = collections.value.find(c => c.id === entry.collectionId)
      if (col) {
        for (const colItem of col.items) {
          const item = items.value.find(i => i.id === colItem.itemId)
          if (item) {
            lines.push(`${colItem.quantity * entry.quantity}x ${item.name}`)
          }
        }
      }
    } else {
      lines.push(`${entry.quantity}x ${entry.name}`)
    }
  }
  await navigator.clipboard.writeText(lines.join('\n'))
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
        Sammlungen verwalten
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
              {{ lagerEntries.length }}
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

          <!-- Combined Items + Collections List -->
          <div class="space-y-1 max-h-[500px] overflow-y-auto">
            <div
              v-for="entry in filteredLager"
              :key="entry.type + '-' + entry.id"
              class="flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer"
              :class="entry.type === 'collection' 
                ? 'bg-primary/5 border border-primary/20 hover:bg-primary/10' 
                : 'bg-secondary/50 hover:bg-secondary'"
              @click="addToList(entry)"
            >
              <div class="flex items-center gap-2">
                <Folder v-if="entry.type === 'collection'" class="w-4 h-4 text-primary" />
                <span class="font-medium">{{ entry.name }}</span>
                <span v-if="entry.alwaysOnList" class="text-primary" title="Immer auf der Liste">★</span>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="entry.type === 'item'" class="text-sm text-muted-foreground">{{ getUnitShort(entry.unit || 'st') }}</span>
                <span v-else class="text-sm text-muted-foreground">{{ entry.itemCount }} Items</span>
                <Button 
                  v-if="entry.type === 'item'" 
                  variant="ghost" 
                  size="icon" 
                  class="h-8 w-8" 
                  @click.stop="openEditModal(entry)"
                  title="Bearbeiten"
                >
                  <Pencil class="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" class="h-8 w-8" @click.stop="addToList(entry)">
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
              v-for="entry in listWithDetails"
              :key="(entry.itemId || entry.collectionId)"
              class="flex items-center justify-between p-3 rounded-lg"
              :class="entry.type === 'collection' ? 'bg-primary/5 border border-primary/20' : 'bg-secondary/50'"
            >
              <div class="flex items-center gap-2">
                <Folder v-if="entry.type === 'collection'" class="w-4 h-4 text-primary" />
                <span class="font-medium">{{ entry.name }}</span>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  :value="entry.quantity"
                  min="1"
                  class="w-16 h-8 rounded border border-input bg-transparent px-2 text-center text-sm"
                  @change="(e) => updateQuantity(entry, parseInt((e.target as HTMLInputElement).value) || 1)"
                />
                <span v-if="entry.type === 'item'" class="text-sm text-muted-foreground w-10">{{ getUnitShort(entry.unit || 'st') }}</span>
                <span v-else class="text-xs text-muted-foreground">{{ entry.itemCount }} Items</span>
                <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:text-destructive" @click="removeFromList(entry)">
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

    <!-- Edit Modal -->
    <div v-if="showEditModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showEditModal = false">
      <div class="bg-card border border-border rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 class="text-xl font-bold mb-4">Item bearbeiten</h2>
        
        <div class="space-y-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Name</label>
            <Input v-model="editForm.name" />
          </div>
          
          <div class="space-y-2">
            <label class="text-sm font-medium">Einheit</label>
            <select 
              v-model="editForm.unit"
              class="w-full h-9 rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm"
            >
              <option v-for="opt in unitOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          
          <div class="flex items-center gap-3">
            <input type="checkbox" v-model="editForm.alwaysOnList" id="alwaysOnList" class="rounded" />
            <label for="alwaysOnList" class="text-sm">Immer auf der Liste</label>
          </div>
          
          <div v-if="editForm.alwaysOnList" class="space-y-2">
            <label class="text-sm font-medium">Standard-Menge</label>
            <Input v-model.number="editForm.alwaysQuantity" type="number" min="1" />
          </div>
        </div>
        
        <div class="flex justify-between mt-6">
          <Button variant="destructive" @click="deleteItem">
            <Trash2 class="w-4 h-4 mr-2" />
            Löschen
          </Button>
          <div class="flex gap-2">
            <Button variant="outline" @click="showEditModal = false">Abbrechen</Button>
            <Button @click="saveItem">Speichern</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
