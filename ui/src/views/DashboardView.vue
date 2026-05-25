<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../api/client'

interface Stats {
  totalNodes: number; activeNodes: number; deprecatedNodes: number
  totalEdges: number; vectorCount: number; communityCount: number
  schemaVersion: number
  nodesByCategory: Record<string, number>
  edgeTypes: Record<string, number>
  decay: { healthy: number; fading: number; forgotten: number }
  dbSizeReadable: string
}

const stats = ref<Stats | null>(null)
const loading = ref(true)
const error = ref('')

const categoryColors: Record<string, string> = {
  tasks: '#4CAF50', skills: '#2196F3', events: '#F44336',
  entities: '#FF9800', patterns: '#9C27B0', cases: '#00BCD4',
  profile: '#795548', preferences: '#607D8B',
}

const categoryNames: Record<string, string> = {
  tasks: '任务', skills: '技能', events: '事件',
  entities: '实体', patterns: '模式', cases: '案例',
  profile: '画像', preferences: '偏好',
}

async function fetchStats() {
  try {
    loading.value = true
    stats.value = await api.getStats()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function onWsUpdate() { fetchStats() }

onMounted(() => {
  fetchStats()
  window.addEventListener('bm:stats-updated', onWsUpdate)
})

onUnmounted(() => {
  window.removeEventListener('bm:stats-updated', onWsUpdate)
})
</script>

<template>
  <div class="dashboard">
    <div v-if="loading" class="loading">加载中...</div>
    <div v-if="error" class="error">⚠ {{ error }}</div>

    <template v-if="stats">
      <!-- 统计卡片 -->
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-value">{{ stats.activeNodes }}</div>
          <div class="stat-label">活跃节点</div>
          <div class="stat-sub">共 {{ stats.totalNodes }} · 弃用 {{ stats.deprecatedNodes }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.totalEdges }}</div>
          <div class="stat-label">边关系</div>
          <div class="stat-sub">{{ stats.communityCount }} 个社区</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.vectorCount }}</div>
          <div class="stat-label">向量索引</div>
          <div class="stat-sub">schema v{{ stats.schemaVersion }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.dbSizeReadable }}</div>
          <div class="stat-label">存储大小</div>
          <div class="stat-sub">{{ stats.decay.healthy }} 健康 · {{ stats.decay.fading }} 衰退中</div>
        </div>
      </div>

      <!-- 分类分布 -->
      <div class="section">
        <h2>分类分布</h2>
        <div class="category-bars">
          <div
            v-for="(count, cat) in stats.nodesByCategory"
            :key="cat"
            class="category-bar"
            v-show="count > 0"
          >
            <div class="bar-label">
              <span class="bar-dot" :style="{ background: categoryColors[cat] || '#666' }"></span>
              {{ categoryNames[cat] || cat }}
              <span class="bar-count">{{ count }}</span>
            </div>
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{
                  width: Math.max(count / stats.activeNodes * 100, 2) + '%',
                  background: categoryColors[cat] || '#666',
                }"
              ></div>
            </div>
          </div>
        </div>
        <div v-if="!Object.keys(stats.nodesByCategory).length" class="empty">暂无数据</div>
      </div>

      <!-- 衰减状态 -->
      <div class="section">
        <h2>衰减状态</h2>
        <div class="decay-circles">
          <div class="decay-item healthy">
            <div class="decay-num">{{ stats.decay.healthy }}</div>
            <div class="decay-label">健康</div>
          </div>
          <div class="decay-item fading">
            <div class="decay-num">{{ stats.decay.fading }}</div>
            <div class="decay-label">衰退中</div>
          </div>
          <div class="decay-item forgotten">
            <div class="decay-num">{{ stats.decay.forgotten }}</div>
            <div class="decay-label">被遗忘</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 20px; }
.loading, .error { text-align: center; padding: 40px; color: #8b949e; }
.error { color: #f85149; }

.stat-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.stat-card {
  background: #161b22; border: 1px solid #30363d; border-radius: 8px;
  padding: 16px;
}
.stat-value { font-size: 28px; font-weight: 700; color: #58a6ff; }
.stat-label { font-size: 13px; color: #8b949e; margin-top: 4px; }
.stat-sub { font-size: 12px; color: #484f58; margin-top: 6px; }

.section {
  background: #161b22; border: 1px solid #30363d; border-radius: 8px;
  padding: 16px;
}
.section h2 { font-size: 15px; font-weight: 600; margin-bottom: 12px; }

.category-bars { display: flex; flex-direction: column; gap: 8px; }
.bar-label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.bar-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.bar-count { margin-left: auto; color: #8b949e; font-size: 12px; }
.bar-track { height: 6px; background: #21262d; border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }

.decay-circles { display: flex; gap: 24px; justify-content: center; }
.decay-item { text-align: center; }
.decay-num { font-size: 24px; font-weight: 700; }
.healthy .decay-num { color: #3fb950; }
.fading .decay-num { color: #d29922; }
.forgotten .decay-num { color: #f85149; }
.decay-label { font-size: 12px; color: #8b949e; margin-top: 4px; }

.empty { text-align: center; padding: 20px; color: #484f58; font-size: 13px; }
</style>
