<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DashboardView from './views/DashboardView.vue'
import NodesView from './views/NodesView.vue'
import GraphView from './views/GraphView.vue'
import ConfigView from './views/ConfigView.vue'
import NodeEditorModal from './components/NodeEditorModal.vue'
import { api } from './api/client'

const tabs = ['仪表盘', '图谱', '节点列表', '配置'] as const
const activeTab = ref<typeof tabs[number]>('仪表盘')
const showEditor = ref(false)
const connected = ref(false)
const wsStatus = ref('未连接')

let ws: WebSocket | null = null

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const t = localStorage.getItem('bm_token')
  ws = new WebSocket(`${proto}//${location.host}/ws?token=${t || ''}`)
  ws.onopen = () => { connected.value = true; wsStatus.value = '已连接' }
  ws.onclose = () => { connected.value = false; wsStatus.value = '已断开' }
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.event === 'stats:updated') {
        // 可触发组件内刷新
        window.dispatchEvent(new CustomEvent('bm:stats-updated', { detail: msg.data }))
      }
    } catch {}
  }
}

onMounted(() => {
  connectWs()
  // 尝试从 URL 参数获取 token
  const urlToken = new URLSearchParams(location.search).get('token')
  if (urlToken) {
    api.setToken(urlToken)
  }
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>🧠 brain-memory</h1>
      <div class="header-right">
        <span class="ws-dot" :class="{ connected }"></span>
        <span class="ws-text">{{ wsStatus }}</span>
      </div>
    </header>

    <nav class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab"
      >{{ tab }}</button>
    </nav>

    <main class="main-content">
      <DashboardView v-if="activeTab === '仪表盘'" />
      <GraphView v-if="activeTab === '图谱'" />
      <NodesView v-if="activeTab === '节点列表'" />
      <ConfigView v-if="activeTab === '配置'" />
    </main>

    <!-- 浮动添加按钮 -->
    <button class="fab" @click="showEditor = true" title="手动添加记忆">+</button>
    <NodeEditorModal :show="showEditor" @close="showEditor = false" @saved="showEditor = false" />
  </div>
</template>

<style>
.app { min-height: 100vh; display: flex; flex-direction: column; }
.app-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 20px; background: #161b22; border-bottom: 1px solid #30363d;
}
.app-header h1 { font-size: 18px; font-weight: 600; }
.header-right { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #8b949e; }
.ws-dot { width: 8px; height: 8px; border-radius: 50%; background: #f85149; }
.ws-dot.connected { background: #3fb950; }

.tab-bar {
  display: flex; gap: 0; background: #0d1117; border-bottom: 1px solid #30363d;
  padding: 0 20px;
}
.tab-bar button {
  background: none; border: none; color: #8b949e; padding: 10px 20px;
  font-size: 14px; cursor: pointer; border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.tab-bar button:hover { color: #e1e4e8; }
.tab-bar button.active { color: #58a6ff; border-bottom-color: #58a6ff; }

.main-content { flex: 1; padding: 20px; max-width: 1200px; margin: 0 auto; width: 100%; }

.fab {
  position: fixed; bottom: 24px; right: 24px;
  width: 48px; height: 48px; border-radius: 50%;
  background: #238636; color: white; border: none;
  font-size: 24px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s; z-index: 50;
}
.fab:hover { background: #2ea043; }
</style>
