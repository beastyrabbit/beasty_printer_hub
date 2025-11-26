<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { Printer, ShoppingCart, Settings, FileText, ExternalLink } from 'lucide-vue-next'

const donotickUrl = ref('')

onMounted(async () => {
  try {
    const res = await fetch('/api/config')
    const data = await res.json()
    // Use web URL if set, otherwise fall back to base URL
    donotickUrl.value = data.config?.donotickWebUrl || data.config?.donotickBaseUrl || ''
  } catch {
    // Ignore - link just won't show
  }
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div class="container mx-auto px-4">
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <RouterLink to="/" class="flex items-center gap-3 text-foreground hover:text-primary transition-colors">
            <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Printer class="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 class="text-lg font-semibold">Printer Hub</h1>
              <p class="text-xs text-muted-foreground">Print tasks, lists & more</p>
            </div>
          </RouterLink>

          <!-- Navigation -->
          <nav class="flex items-center gap-1">
            <a
              v-if="donotickUrl"
              :href="donotickUrl"
              target="_blank"
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink class="w-4 h-4" />
              <span>Donotick</span>
            </a>
            <RouterLink
              to="/"
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              active-class="!text-primary !bg-primary/10"
            >
              <Printer class="w-4 h-4" />
              <span>Dashboard</span>
            </RouterLink>
            <RouterLink
              to="/shopping"
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              active-class="!text-primary !bg-primary/10"
            >
              <ShoppingCart class="w-4 h-4" />
              <span>Einkaufsliste</span>
            </RouterLink>
            <RouterLink
              to="/settings"
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              active-class="!text-primary !bg-primary/10"
            >
              <Settings class="w-4 h-4" />
              <span>Einstellungen</span>
            </RouterLink>
            <RouterLink
              to="/logs"
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              active-class="!text-primary !bg-primary/10"
            >
              <FileText class="w-4 h-4" />
              <span>Aktivität</span>
            </RouterLink>
          </nav>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
