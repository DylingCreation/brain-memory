<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../api/client'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits(['close', 'saved'])

const name = ref('')
const type = ref<'TASK' | 'SKILL' | 'EVENT'>('TASK')
const category = ref('tasks')
const description = ref('')
const content = ref('')
const scopePlatform = ref('')
const scopeAgent = ref('')
const scopeChat = ref('')
const saving = ref(false)
const error = ref('')

const categories = [
  { value: 'tasks', label: '任务' }, { value: 'skills', label: '技能' },
  { value: 'events', label: '事件' }, { value: 'entities', label: '实体' },
  { value: 'patterns', label: '模式' }, { value: 'cases', label: '案例' },
  { value: 'profile', label: '画像' }, { value: 'preferences', label: '偏好' },
]

function reset() {
  name.value = ''; type.value = 'TASK'; category.value = 'tasks'
  description.value = ''; content.value = ''
  scopePlatform.value = ''; scopeAgent.value = ''; scopeChat.value = ''
  saving.value = false; error.value = ''
}

async function submit() {
  if (!name.value.trim() || !content.value.trim()) {
    error.value = '名称和内容不能为空'
    return
  }
  try {
    saving.value = true
    await api.createNode({
      name: name.value.trim(),
      type: type.value,
      category: category.value,
      description: description.value,
      content: content.value,
      scopePlatform: scopePlatform.value || undefined,
      scopeAgent: scopeAgent.value || undefined,
      scopeChat: scopeChat.value || undefined,
    })
    reset()
    emit('saved')
    emit('close')
  } catch (e: any) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

function onClose() { reset(); emit('close') }
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="onClose">
    <div class="modal">
      <div class="modal-header">
        <h2>手动添加记忆</h2>
        <button class="close-btn" @click="onClose">×</button>
      </div>

      <div v-if="error" class="error-msg">{{ error }}</div>

      <form @submit.prevent="submit" class="form">
        <div class="form-row">
          <div class="form-group flex-2">
            <label>名称 *</label>
            <input v-model="name" placeholder="记忆名称" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>类型</label>
            <select v-model="type">
              <option value="TASK">任务</option>
              <option value="SKILL">技能</option>
              <option value="EVENT">事件</option>
            </select>
          </div>
          <div class="form-group">
            <label>分类</label>
            <select v-model="category">
              <option v-for="c in categories" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>描述</label>
          <input v-model="description" placeholder="简短描述" />
        </div>

        <div class="form-group">
          <label>内容 *</label>
          <textarea v-model="content" rows="5" placeholder="完整记忆内容"></textarea>
        </div>

        <fieldset class="scope-fieldset">
          <legend>Scope 作用域（可选）</legend>
          <div class="form-row">
            <div class="form-group">
              <label>平台</label>
              <input v-model="scopePlatform" placeholder="e.g. qqbot, webchat" />
            </div>
            <div class="form-group">
              <label>Agent</label>
              <input v-model="scopeAgent" placeholder="e.g. main, todo" />
            </div>
          </div>
          <div class="form-group">
            <label>Chat</label>
            <input v-model="scopeChat" placeholder="会话/频道 ID" />
          </div>
        </fieldset>

        <div class="form-actions">
          <button type="button" class="btn-cancel" @click="onClose">取消</button>
          <button type="submit" class="btn-save" :disabled="saving">
            {{ saving ? '保存中...' : '添加记忆' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; justify-content: center; align-items: flex-start; padding-top: 40px; z-index: 100;
}
.modal {
  background: #161b22; border: 1px solid #30363d; border-radius: 12px;
  width: 600px; max-width: 95vw; max-height: 85vh; overflow-y: auto; padding: 24px;
}
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.modal-header h2 { font-size: 16px; font-weight: 600; }
.close-btn {
  background: none; border: none; color: #8b949e; font-size: 22px;
  cursor: pointer; padding: 0 4px;
}
.close-btn:hover { color: #e1e4e8; }
.error-msg {
  background: #3d1f1f; color: #f85149; padding: 8px 12px; border-radius: 6px;
  font-size: 13px; margin-bottom: 12px;
}

.form { display: flex; flex-direction: column; gap: 12px; }
.form-row { display: flex; gap: 10px; }
.form-group { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.form-group.flex-2 { flex: 2; }
.form-group label { font-size: 12px; color: #8b949e; }
.form-group input, .form-group select, .form-group textarea {
  padding: 8px 10px; background: #0d1117; border: 1px solid #30363d;
  border-radius: 6px; color: #e1e4e8; font-size: 13px; outline: none;
  font-family: inherit;
}
.form-group input:focus, .form-group select:focus, .form-group textarea:focus {
  border-color: #58a6ff;
}
.form-group textarea { resize: vertical; min-height: 80px; }

.scope-fieldset {
  border: 1px solid #21262d; border-radius: 6px; padding: 12px;
}
.scope-fieldset legend { font-size: 12px; color: #8b949e; padding: 0 4px; }

.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
.btn-cancel {
  padding: 8px 16px; background: #21262d; border: 1px solid #30363d;
  border-radius: 6px; color: #c9d1d9; cursor: pointer; font-size: 13px;
}
.btn-save {
  padding: 8px 20px; background: #238636; border: none; border-radius: 6px;
  color: white; cursor: pointer; font-size: 13px; font-weight: 500;
}
.btn-save:disabled { opacity: 0.5; cursor: default; }
.btn-save:not(:disabled):hover { background: #2ea043; }
</style>
