<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, ArrowLeft, Save, X } from 'lucide-vue-next'

const router = useRouter()

interface ShoppingItem {
  id: string
  name: string
  unit: string
}

interface Collection {
  id: string
  name: string
  items: { itemId: string; quantity: number }[]
}

const items = ref<ShoppingItem[]>([])
const collections = ref<Collection[]>([])
const editingCollection = ref<Collection | null>(null)
const newCollectionName = ref('')
const loading = ref(false)

async function loadData() {
  loading.value = true
  try {
    const [itemsRes, collectionsRes] = await Promise.all([
      fetch('/api/shopping/items'),
      fetch('/api/shopping/collections')
    ])
    items.value = (await itemsRes.json()).items || []
    collections.value = (await collectionsRes.json()).collections || []
  } catch (err) {
    console.error('Failed to load:', err)
  } finally {
    loading.value = false
  }
}

function startNewCollection() {
  editingCollection.value = {
    id: '',
    name: '',
    items: []
  }
}

function editCollection(collection: Collection) {
  editingCollection.value = JSON.parse(JSON.stringify(collection))
}

function cancelEdit() {
  editingCollection.value = null
}

function addItemToCollection(itemId: string) {
  if (!editingCollection.value) return
  const existing = editingCollection.value.items.find(i => i.itemId === itemId)
  if (existing) {
    existing.quantity++
  } else {
    editingCollection.value.items.push({ itemId, quantity: 1 })
  }
}

function removeItemFromCollection(itemId: string) {
  if (!editingCollection.value) return
  editingCollection.value.items = editingCollection.value.items.filter(i => i.itemId !== itemId)
}

function updateItemQuantity(itemId: string, quantity: number) {
  if (!editingCollection.value) return
  const item = editingCollection.value.items.find(i => i.itemId === itemId)
  if (item) item.quantity = quantity
}

async function saveCollection() {
  if (!editingCollection.value || !editingCollection.value.name.trim()) return
  
  try {
    if (editingCollection.value.id) {
      await fetch('/api/shopping/collections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingCollection.value)
      })
    } else {
      await fetch('/api/shopping/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingCollection.value.name,
          items: editingCollection.value.items
        })
      })
    }
    editingCollection.value = null
    await loadData()
  } catch (err) {
    console.error('Failed to save:', err)
  }
}

async function deleteCollection(id: string) {
  if (!confirm('Sammlung löschen?')) return
  try {
    await fetch(`/api/shopping/collections/${id}`, {
      method: 'DELETE'
    })
    await loadData()
  } catch (err) {
    console.error('Failed to delete:', err)
  }
}

function getItemName(itemId: string): string {
  return items.value.find(i => i.id === itemId)?.name || 'Unbekannt'
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="router.push('/shopping')">
          <ArrowLeft class="w-5 h-5" />
        </Button>
        <div>
          <h1 class="text-2xl font-bold">Sammlungen</h1>
          <p class="text-muted-foreground">Gruppen von Items für schnelles Hinzufügen</p>
        </div>
      </div>
      <Button @click="startNewCollection" v-if="!editingCollection">
        <Plus class="w-4 h-4 mr-2" />
        Neue Sammlung
      </Button>
    </div>

    <!-- Editor -->
    <Card v-if="editingCollection">
      <CardHeader>
        <CardTitle>{{ editingCollection.id ? 'Sammlung bearbeiten' : 'Neue Sammlung' }}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm font-medium">Name</label>
          <Input v-model="editingCollection.name" placeholder="z.B. Frühstück, Pasta Bolognese..." />
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Available Items -->
          <div class="space-y-2">
            <h3 class="text-sm font-medium">Verfügbare Items</h3>
            <div class="space-y-1 max-h-64 overflow-y-auto border border-border rounded-lg p-2">
              <div
                v-for="item in items"
                :key="item.id"
                class="flex items-center justify-between p-2 rounded hover:bg-secondary cursor-pointer"
                @click="addItemToCollection(item.id)"
              >
                <span>{{ item.name }}</span>
                <Plus class="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </div>

          <!-- Collection Items -->
          <div class="space-y-2">
            <h3 class="text-sm font-medium">In der Sammlung</h3>
            <div class="space-y-1 max-h-64 overflow-y-auto border border-border rounded-lg p-2">
              <div v-if="editingCollection.items.length === 0" class="text-center py-4 text-muted-foreground">
                Items links anklicken zum Hinzufügen
              </div>
              <div
                v-for="item in editingCollection.items"
                :key="item.itemId"
                class="flex items-center justify-between p-2 rounded bg-secondary/50"
              >
                <span>{{ getItemName(item.itemId) }}</span>
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    :value="item.quantity"
                    min="1"
                    class="w-14 h-7 rounded border border-input bg-transparent px-2 text-center text-sm"
                    @change="(e) => updateItemQuantity(item.itemId, parseInt((e.target as HTMLInputElement).value) || 1)"
                  />
                  <Button variant="ghost" size="icon" class="h-7 w-7" @click="removeItemFromCollection(item.itemId)">
                    <X class="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex gap-2 justify-end">
          <Button variant="outline" @click="cancelEdit">Abbrechen</Button>
          <Button @click="saveCollection" :disabled="!editingCollection.name.trim()">
            <Save class="w-4 h-4 mr-2" />
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Collections List -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card
        v-for="collection in collections"
        :key="collection.id"
        class="cursor-pointer hover:border-primary/50 transition-colors"
        @click="editCollection(collection)"
      >
        <CardHeader class="pb-2">
          <div class="flex items-center justify-between">
            <CardTitle class="text-lg">{{ collection.name }}</CardTitle>
            <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive" @click.stop="deleteCollection(collection.id)">
              <Trash2 class="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p class="text-sm text-muted-foreground">{{ collection.items.length }} Items</p>
          <div class="flex flex-wrap gap-1 mt-2">
            <span
              v-for="item in collection.items.slice(0, 5)"
              :key="item.itemId"
              class="text-xs px-2 py-0.5 rounded bg-secondary"
            >
              {{ item.quantity }}x {{ getItemName(item.itemId) }}
            </span>
            <span v-if="collection.items.length > 5" class="text-xs text-muted-foreground">
              +{{ collection.items.length - 5 }} mehr
            </span>
          </div>
        </CardContent>
      </Card>

      <div v-if="collections.length === 0" class="col-span-full text-center py-12 text-muted-foreground">
        Noch keine Sammlungen vorhanden
      </div>
    </div>
  </div>
</template>

