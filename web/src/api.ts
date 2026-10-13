// Talks to the server and keeps one live copy of the event being viewed (pushed over Socket.IO).
import { ref, shallowRef, computed, watch } from 'vue';
import { io, Socket } from 'socket.io-client';
import type { EventState, RegistrationRow, RunRow } from '@shared/types';

export const role = ref<string>((() => { try { return localStorage.getItem('ax-role') || 'Club Admin'; } catch { return 'Club Admin'; } })());
watch(role, v => { try { localStorage.setItem('ax-role', v); } catch { /* private mode */ } });
export const ROLES = ['Club Admin', 'Registrar', 'Time Keeper', 'Cone Counter', 'Car Queuer', 'Announcer', 'Tech Inspector'];

export const lastError = ref('');
export async function api<T = any>(method: string, url: string, body?: any): Promise<T> {
  const res = await fetch('/api' + url, {
    method, headers: { 'content-type': 'application/json', 'x-ax-who': role.value }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { lastError.value = data.error || `Request failed (${res.status})`; throw new Error(lastError.value); }
  return data as T;
}

let socket: Socket | null = null;
export const connected = ref(false);
export const state = shallowRef<EventState | null>(null);
let watching: number | null = null;

export function watchEvent(id: number) {
  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => { connected.value = true; if (watching) socket!.emit('watch', watching); });
    socket.on('disconnect', () => { connected.value = false; });
    socket.on('state', (s: EventState) => { if (s.event.id === watching) state.value = s; });
  }
  if (watching !== id) { watching = id; state.value = null; }
  if (socket.connected) socket.emit('watch', id);
}

export const regById = computed(() => new Map<number, RegistrationRow>((state.value?.registrations || []).map(r => [r.id, r])));
export const queue = computed<RunRow[]>(() => (state.value?.runs || []).filter(r => r.status !== 'F')
  .sort((a, b) => (a.status === b.status ? a.queuePos - b.queuePos || a.seq - b.seq : a.status === 'R' ? -1 : 1)));
export const finished = computed<RunRow[]>(() => (state.value?.runs || []).filter(r => r.status === 'F').sort((a, b) => b.seq - a.seq));

export const sec = (ms: number) => (ms > 0 ? (ms / 1000).toFixed(3) : '—');
export const fullName = (r?: RegistrationRow) => (r ? `${r.firstName} ${r.lastName}`.trim() : '');
export const groupColor = (name: string) => state.value?.event.runGroups.find(g => g.name === name)?.color || '#999';
