const BASE = '/api';

function token(): string | null {
  return localStorage.getItem('bm_token') || null;
}

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const t = token();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {}),
  };
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getStats: () => request('/stats'),
  getDecay: () => request('/stats/decay'),
  getNodes: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/nodes${qs}`);
  },
  getNodeDetail: (id: string) => request(`/nodes/${id}`),
  getGraph: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/graph${qs}`);
  },
  createNode: (body: any) => request('/nodes', { method: 'POST', body: JSON.stringify(body) }),
  updateNode: (id: string, body: any) => request(`/nodes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteNode: (id: string) => request(`/nodes/${id}`, { method: 'DELETE' }),
  getConfig: () => request('/config'),
  saveConfig: (body: any) => request('/config', { method: 'PUT', body: JSON.stringify(body) }),
  setToken: (t: string) => localStorage.setItem('bm_token', t),
};
