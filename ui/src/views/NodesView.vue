<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '../api/client'

interface NodeRow {
  id: string; type: string; category: string; name: string
  description: string; status: string
  pagerank: number; importance: number; validatedCount: number
  source: string; scopePlatform: string; scopeAgent: string; scopeChat: string
  updatedAt: number; createdAt: number
}

const nodes = ref<NodeRow[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')
const search = ref('')
const page = ref(0)
const limit = 50
const selectedNode = ref<NodeRow | null>(null)
const nodeDetail = ref<any>(null)
const detailLoading = ref(false)

const typeColors: Record<string, string> = { TASK: '#4CAF50', SKILL: '#2196F3', EVENT: '#F44336' }
const typeNames: Record<string, string> = { TASK: '任务', SKILL: '技能', EVENT: '事件' }

const canPrev = computed(() => page.value > 0)
const canNext = computed(() => (page.value + 1) * limit < total.value)

async function fetchNodes() {
  try {
    loading.value = true
    const params: Record<string, string> = { limit: String(limit), offset: String(page.value * limit), sort: 'pagerank' }
    if (search.value.trim()) params.search = search.value.trim()
    const data = await api.getNodes(params)
    nodes.value = data.nodes
    total.value = data.total
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function onSearch() { page.value = 0; fetchNodes() }

async function openDetail(node: NodeRow) {
  selectedNode.value = node
  detailLoading.value = true
  try {
    nodeDetail.value = await api.getNodeDetail(node.id)
  } catch {
    nodeDetail.value = null
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() { selectedNode.value = null; nodeDetail.value = null }

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return `${Math.floor(diff / 86400000)}天前`
}

onMounted(fetchNodes)
</script>

<template>
  <div class="nodes-view">
    <!-- 搜索 -->
    <div class="search-bar">
      <input
        v-model="search"
        placeholder="搜索节点名称、描述..."
        @keyup.enter="onSearch"
      />
      <button @click="onSearch">搜索</button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-if="error" class="error">⚠ {{ error }}</div>

    <!-- 节点列表 -->
    <div v-if="!loading && nodes.length" class="node-list">
      <div class="list-header">
        <span>节点 ({{ total }})</span>
      </div>
      <div
        v-for="node in nodes"
        :key="node.id"
        class="node-row"
        @click="openDetail(node)"
      >
        <span class="node-type" :style="{ color: typeColors[node.type] || '#666' }">●</span>
        <div class="node-info">
          <div class="node-name">
            {{ node.name }}
            <span class="node-type-label">{{ typeNames[node.type] || node.type }}</span>
            <span class="node-cat">{{ node.category }}</span>
          </div>
          <div class="node-meta">
            PR {{ (node.pagerank * 100).toFixed(0) }}%
            · 验证 {{ node.validatedCount }}次
            · {{ timeAgo(node.updatedAt) }}
            <span v-if="node.scopePlatform" class="scope-tag">{{ node.scopePlatform }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!loading && !nodes.length" class="empty">暂无节点数据</div>

    <!-- 分页 -->
    <div v-if="total > limit" class="pagination">
      <button :disabled="!canPrev" @click="page--; fetchNodes()">上一页</button>
      <span>{{ page + 1 }} / {{ Math.ceil(total / limit) }}</span>
      <button :disabled="!canNext" @click="page++; fetchNodes()">下一页</button>
    </div>

    <!-- 节点详情弹窗 -->
    <div v-if="selectedNode" class="modal-overlay" @click.self="closeDetail">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ selectedNode.name }}</h2>
          <button class="close-btn" @click="closeDetail">×</button>
        </div>
        <div v-if="detailLoading" class="loading">加载详情...</div>
        <template v-else-if="nodeDetail">
          <div class="detail-grid">
            <div class="detail-item">
              <div class="detail-label">类型</div>
              <div class="detail-value">{{ typeNames[selectedNode.type] }} · {{ selectedNode.category }}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">PageRank</div>
              <div class="detail-value">{{ (selectedNode.pagerank * 100).toFixed(1) }}%</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">重要性</div>
              <div class="detail-value">{{ ((selectedNode.importance || 0.5) * 100).toFixed(0) }}%</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">来源</div>
              <div class="detail-value">{{ selectedNode.source === 'user' ? '用户' : selectedNode.source === 'assistant' ? 'AI' : '手动' }}</div>
            </div>
          </div>
          <div class="detail-section" v-if="selectedNode.description">
            <div class="detail-label">描述</div>
            <div class="detail-text">{{ selectedNode.description }}</div>
          </div>
          <div class="detail-section" v-if="nodeDetail.node.content">
            <div class="detail-label">内容</div>
            <div class="detail-text content-box">{{ nodeDetail.node.content }}</div>
          </div>
          <div class="detail-section" v-if="nodeDetail.edges.length">
            <div class="detail-label">关联边 ({{ nodeDetail.edgeCount }})</div>
            <div v-for="e in nodeDetail.edges" :key="e.id" class="edge-row">
              {{ e.direction === 'out' ? '→' : '←' }}
              <strong>{{ e.type }}</strong>
              {{ e.otherName }}
              <span class="edge-instruction">{{ e.instruction }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nodes-view { display: flex; flex-direction: column; gap: 16px; }

.search-bar { display: flex; gap: 8px; }
.search-bar input {
  flex: 1; padding: 8px 12px; background: #0d1117; border: 1px solid #30363d;
  border-radius: 6px; color: #e1e4e8; font-size: 14px; outline: none;
}
.search-bar input:focus { border-color: #58a6ff; }
.search-bar button {
  padding: 8px 16px; background: #238636; border: none; border-radius: 6px;
  color: white; cursor: pointer; font-size: 14px;
}
.search-bar button:hover { background: #2ea043; }

.loading, .error { text-align: center; padding: 40px; color: #8b949e; }
.error { color: #f85149; }
.empty { text-align: center; padding: 40px; color: #484f58; font-size: 14px; }

.list-header { font-size: 13px; color: #8b949e; padding: 8px 0; }
.node-list { display: flex; flex-direction: column; gap: 2px; }

.node-row {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px;
  background: #161b22; border: 1px solid #21262d; border-radius: 6px;
  cursor: pointer; transition: border-color 0.15s;
}
.node-row:hover { border-color: #30363d; }
.node-type { font-size: 12px; flex-shrink: 0; }
.node-info { flex: 1; min-width: 0; }
.node-name { font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.node-type-label { font-size: 11px; color: #8b949e; background: #21262d; padding: 1px 6px; border-radius: 3px; }
.node-cat { font-size: 11px; color: #484f58; }
.node-meta { font-size: 12px; color: #484f58; margin-top: 3px; display: flex; gap: 8px; align-items: center; }
.scope-tag { font-size: 10px; background: #1f2a37; color: #58a6ff; padding: 1px 5px; border-radius: 3px; }

.pagination { display: flex; justify-content: center; align-items: center; gap: 12px; padding: 8px 0; }
.pagination button {
  padding: 6px 12px; background: #21262d; border: 1px solid #30363d;
  border-radius: 6px; color: #c9d1d9; cursor: pointer; font-size: 13px;
}
.pagination button:disabled { opacity: 0.4; cursor: default; }
.pagination button:not(:disabled):hover { background: #30363d; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; justify-content: center; align-items: flex-start; padding-top: 40px; z-index: 100;
}
.modal {
  background: #161b22; border: 1px solid #30363d; border-radius: 12px;
  width: 700px; max-width: 95vw; max-height: 85vh; overflow-y: auto; padding: 24px;
}
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.modal-header h2 { font-size: 18px; font-weight: 600; }
.close-btn {
  background: none; border: none; color: #8b949e; font-size: 24px;
  cursor: pointer; padding: 0 4px; line-height: 1;
}
.close-btn:hover { color: #e1e4e8; }

.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.detail-item { background: #0d1117; padding: 10px; border-radius: 6px; }
.detail-label { font-size: 11px; color: #484f58; margin-bottom: 4px; text-transform: uppercase; }
.detail-value { font-size: 14px; color: #e1e4e8; }
.detail-section { margin-bottom: 16px; }
.detail-text { font-size: 13px; color: #8b949e; margin-top: 6px; line-height: 1.5; }
.content-box {
  background: #0d1117; padding: 12px; border-radius: 6px; white-space: pre-wrap;
  font-family: 'Courier New', monospace; font-size: 12px; max-height: 300px; overflow-y: auto;
}
.edge-row { font-size: 13px; padding: 6px 0; border-bottom: 1px solid #21262d; color: #c9d1d9; }
.edge-instruction { color: #484f58; font-size: 12px; margin-left: 8px; }
</style>
