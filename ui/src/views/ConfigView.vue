<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../api/client'

const config = ref<Record<string, any>>({})
const schema = ref<Record<string, any>>({})
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)

const sectionNames: Record<string, string> = {
  engine: '引擎配置', storage: '存储', dbPath: '路径', llm: 'LLM 模型',
  embedding: 'Embedding', decay: '衰减', reflection: '反思',
  noiseFilter: '噪声过滤', workingMemory: '工作记忆', fusion: '知识融合',
  reasoning: '推理检索', rerank: '重排序', memoryInjection: '记忆注入',
  memorySharing: '多Agent共享', compactTurnCount: '压缩', recallMaxNodes: '召回',
  recallMaxDepth: '深度', recallCacheSize: '缓存', recallCacheTtlMs: '缓存TTL',
  recallStrategy: '召回策略', dedupThreshold: '去重', pagerankDamping: 'PageRank',
  pagerankIterations: 'PageRank迭代',
}

async function fetchConfig() {
  try {
    loading.value = true
    const data = await api.getConfig()
    config.value = data.config
    schema.value = data.schema
    saved.value = false
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  try {
    saving.value = true
    await api.saveConfig(config.value)
    saved.value = true
    setTimeout(() => saved.value = false, 5000)
  } catch (e: any) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

// 扁平化 schema properties，区分基础字段和对象字段
const flatFields = ref<Array<{ key: string; schema: any; value: any }>>([])
const objectFields = ref<Array<{ key: string; schema: any; value: Record<string, any> }>>([])

function buildFields() {
  const props = schema.value?.properties || {}
  const flat: any[] = []
  const objects: any[] = []
  for (const [key, prop] of Object.entries(props)) {
    const s = prop as any
    if (s.type === 'object') {
      objects.push({ key, schema: s, value: config.value[key] || {} })
    } else {
      flat.push({ key, schema: s, value: config.value[key] })
    }
  }
  flatFields.value = flat
  objectFields.value = objects
}

function updateField(key: string, value: any) {
  config.value[key] = value
}

function updateNestedField(parentKey: string, subKey: string, value: any) {
  if (!config.value[parentKey]) config.value[parentKey] = {}
  config.value[parentKey][subKey] = value
}

onMounted(async () => {
  await fetchConfig()
  buildFields()
})
</script>

<template>
  <div class="config-view">
    <div v-if="loading" class="loading">加载中...</div>
    <div v-if="error" class="error">⚠ {{ error }}</div>

    <template v-if="!loading && Object.keys(schema).length">
      <div class="config-header">
        <h2>配置管理</h2>
        <span class="config-source">来源: openclaw.json</span>
      </div>

      <!-- 基础字段 -->
      <div class="section" v-if="flatFields.length">
        <h3>基础设置</h3>
        <div class="field-grid">
          <div v-for="f in flatFields" :key="f.key" class="field">
            <label>{{ sectionNames[f.key] || f.key }}</label>
            <select v-if="f.schema.enum" :value="f.value" @change="updateField(f.key, ($event.target as HTMLSelectElement).value)">
              <option v-for="opt in f.schema.enum" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <input v-else-if="f.schema.type === 'number'" type="number" :value="f.value" @input="updateField(f.key, Number(($event.target as HTMLInputElement).value))" />
            <input v-else-if="f.schema.type === 'boolean'" type="checkbox" :checked="f.value" @change="updateField(f.key, ($event.target as HTMLInputElement).checked)" />
            <input v-else type="text" :value="f.value" @input="updateField(f.key, ($event.target as HTMLInputElement).value)" />
          </div>
        </div>
      </div>

      <!-- 嵌套对象字段 -->
      <div v-for="obj in objectFields" :key="obj.key" class="section">
        <h3>{{ sectionNames[obj.key] || obj.key }}</h3>
        <div class="field-grid">
          <div v-for="(subSchema, subKey) in (obj.schema.properties || {})" :key="subKey" class="field">
            <label>{{ subKey }}</label>
            <select v-if="(subSchema as any).enum" :value="obj.value[subKey]" @change="updateNestedField(obj.key, subKey, ($event.target as HTMLSelectElement).value)">
              <option v-for="opt in (subSchema as any).enum" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <input v-else-if="(subSchema as any).type === 'number'" type="number" :value="obj.value[subKey]" @input="updateNestedField(obj.key, subKey, Number(($event.target as HTMLInputElement).value))" />
            <input v-else-if="(subSchema as any).type === 'boolean'" type="checkbox" :checked="obj.value[subKey]" @change="updateNestedField(obj.key, subKey, ($event.target as HTMLInputElement).checked)" />
            <input v-else type="text" :value="obj.value[subKey]" @input="updateNestedField(obj.key, subKey, ($event.target as HTMLInputElement).value)" />
          </div>
        </div>
      </div>

      <div class="config-actions">
        <button class="btn-save" :disabled="saving" @click="saveConfig">
          {{ saving ? '保存中...' : '保存配置' }}
        </button>
        <span v-if="saved" class="saved-msg">✅ 已保存，重启 Gateway 后生效</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.config-view { display: flex; flex-direction: column; gap: 16px; }
.loading, .error { text-align: center; padding: 40px; color: #8b949e; }
.error { color: #f85149; }
.config-header { display: flex; justify-content: space-between; align-items: center; }
.config-header h2 { font-size: 16px; }
.config-source { font-size: 12px; color: #484f58; }

.section {
  background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px;
}
.section h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #58a6ff; }

.field-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 12px; color: #8b949e; }
.field input, .field select {
  padding: 6px 8px; background: #0d1117; border: 1px solid #30363d;
  border-radius: 4px; color: #e1e4e8; font-size: 13px; outline: none;
}
.field input:focus, .field select:focus { border-color: #58a6ff; }
.field input[type="checkbox"] { width: 16px; height: 16px; accent-color: #238636; }

.config-actions { display: flex; align-items: center; gap: 12px; }
.btn-save {
  padding: 8px 20px; background: #238636; border: none; border-radius: 6px;
  color: white; cursor: pointer; font-size: 13px; font-weight: 500;
}
.btn-save:disabled { opacity: 0.5; }
.btn-save:hover:not(:disabled) { background: #2ea043; }
.saved-msg { font-size: 13px; color: #3fb950; }
</style>
