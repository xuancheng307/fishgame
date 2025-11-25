// D:\徐景輝\魚市場遊戲3\public\js\common.js
const API_BASE = '/api';

export function authHeaders() {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiPost(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body || {})
  });
  const data = await r.json().catch(()=> ({}));
  if (!r.ok) throw new Error(data?.error?.message || r.statusText);
  return data;
}