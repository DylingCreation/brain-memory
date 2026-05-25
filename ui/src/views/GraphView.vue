<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as d3 from 'd3'
import { api } from '../api/client'

interface GraphNode {
  id: string; name: string; type: string; category: string
  pagerank: number; communityId: string | null
}
interface GraphEdge { id: string; source: string; target: string; type: string }
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; communities: Array<{ id: string; count: number }> }

const data = ref<GraphData | null>(null)
const loading = ref(true)
const error = ref('')
const svgRef = ref<SVGSVGElement | null>(null)
const selectedNode = ref<GraphNode | null>(null)
const maxNodes = ref(200)
const simulation = ref<d3.Simulation<any, any> | null>(null)

const typeColors: Record<string, string> = { TASK: '#4CAF50', SKILL: '#2196F3', EVENT: '#F44336' }
const defaultColor = '#666'

async function fetchGraph() {
  try {
    loading.value = true
    data.value = await api.getGraph({ maxNodes: String(maxNodes.value) })
    await nextTick()
    if (data.value) renderGraph()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function renderGraph() {
  if (!svgRef.value || !data.value) return
  simulation.value?.stop()

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const width = svgRef.value.clientWidth || 900
  const height = 550

  const g = svg.append('g')

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 3])
    .on('zoom', (event) => g.attr('transform', event.transform))
  svg.call(zoom)

  const nodes: GraphNode[] = data.value.nodes
  const edges: GraphEdge[] = data.value.edges

  const sim = d3.forceSimulation(nodes as any)
    .force('link', d3.forceLink(edges).id((d: any) => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(20))

  const link = g.append('g').selectAll('line')
    .data(edges)
    .join('line')
    .attr('stroke', '#30363d')
    .attr('stroke-width', 1)
    .attr('stroke-opacity', 0.6)

  const nodeGroup = g.append('g').selectAll('g')
    .data(nodes)
    .join('g')
    .attr('cursor', 'pointer')
    .call(d3.drag<any, any>()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
    )
    .on('click', (_, d) => selectedNode.value = d)

  nodeGroup.append('circle')
    .attr('r', (d: GraphNode) => 5 + (d.pagerank || 0) * 20)
    .attr('fill', (d: GraphNode) => typeColors[d.type] || defaultColor)
    .attr('stroke', '#161b22')
    .attr('stroke-width', 1.5)

  nodeGroup.append('text')
    .text((d: GraphNode) => d.name.length > 12 ? d.name.slice(0, 12) + '…' : d.name)
    .attr('x', 10)
    .attr('y', 3)
    .attr('font-size', '10px')
    .attr('fill', '#8b949e')

  sim.on('tick', () => {
    link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y)
    nodeGroup.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
  })

  simulation.value = sim as any
}

function clearSelection() { selectedNode.value = null }

onMounted(fetchGraph)
onUnmounted(() => simulation.value?.stop())
</script>

<template>
  <div class="graph-view">
    <div class="graph-toolbar">
      <label>节点数:</label>
      <select v-model.number="maxNodes" @change="fetchGraph">
        <option :value="50">50</option>
        <option :value="100">100</option>
        <option :value="200">200</option>
        <option :value="400">400</option>
      </select>
      <button @click="fetchGraph">刷新</button>
      <span v-if="data" class="graph-info">{{ data.nodes.length }} 节点 · {{ data.edges.length }} 边</span>
    </div>

    <div v-if="loading" class="loading">加载图谱...</div>
    <div v-if="error" class="error">⚠ {{ error }}</div>

    <div class="graph-container">
      <svg ref="svgRef" width="100%" height="550"></svg>
    </div>

    <!-- 图例 -->
    <div class="graph-legend" v-if="data">
      <span v-for="(color, type) in typeColors" :key="type" class="legend-item">
        <span class="legend-dot" :style="{ background: color }"></span>
        {{ type === 'TASK' ? '任务' : type === 'SKILL' ? '技能' : '事件' }}
      </span>
    </div>

    <!-- 选中节点 info -->
    <div v-if="selectedNode" class="node-tooltip">
      <strong>{{ selectedNode.name }}</strong>
      <span>{{ selectedNode.type }} · {{ selectedNode.category }}</span>
      <span>PR: {{ ((selectedNode.pagerank || 0) * 100).toFixed(0) }}%</span>
      <button @click="clearSelection">关闭</button>
    </div>
  </div>
</template>

<style scoped>
.graph-view { display: flex; flex-direction: column; gap: 12px; }
.graph-toolbar { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.graph-toolbar select {
  padding: 4px 8px; background: #0d1117; border: 1px solid #30363d;
  border-radius: 4px; color: #e1e4e8; font-size: 13px;
}
.graph-toolbar button {
  padding: 4px 12px; background: #21262d; border: 1px solid #30363d;
  border-radius: 4px; color: #c9d1d9; cursor: pointer; font-size: 13px;
}
.graph-toolbar button:hover { background: #30363d; }
.graph-info { color: #484f58; margin-left: auto; }
.graph-container {
  background: #0d1117; border: 1px solid #30363d; border-radius: 8px;
  overflow: hidden;
}
.graph-legend { display: flex; gap: 16px; font-size: 12px; color: #8b949e; }
.legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
.loading, .error { text-align: center; padding: 40px; color: #8b949e; }
.error { color: #f85149; }
.node-tooltip {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: #161b22; border: 1px solid #30363d; border-radius: 8px;
  padding: 12px 20px; display: flex; align-items: center; gap: 16px;
  font-size: 13px; z-index: 50;
}
.node-tooltip button {
  padding: 4px 8px; background: #21262d; border: 1px solid #30363d;
  border-radius: 4px; color: #8b949e; cursor: pointer; font-size: 12px;
}
</style>
