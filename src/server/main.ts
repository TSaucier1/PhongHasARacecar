import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { Server as IOServer } from 'socket.io';
import { openDb } from './db';
import * as ev from './events';
import { Hardware } from './hardware';
import { VERSION } from '../shared/version';

// ---------- where things live ----------
let sea: any = null;
try { sea = require('node:sea'); if (!sea.isSea()) sea = null; } catch { sea = null; }

const exeDir = sea ? path.dirname(process.execPath) : process.cwd();
const dataDir = process.env.AX_DATA_DIR || path.join(exeDir, sea ? 'axtime-data' : 'data');
const port = Number(process.env.PORT || process.env.AX_PORT || 8080);
fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, 'axtime.db');

if (!fs.existsSync(dbFile)) {
  // First run: start from the bundled starter database (club history + a demo event).
  let seed: Buffer | null = null;
  if (sea) { try { seed = Buffer.from(sea.getRawAsset('seed.db')); } catch { seed = null; } }
  else if (fs.existsSync(path.join(process.cwd(), 'data', 'seed.db'))) seed = fs.readFileSync(path.join(process.cwd(), 'data', 'seed.db'));
  if (seed) { fs.writeFileSync(dbFile, seed); console.log('First run: created database from the bundled starter data.'); }
}
const db = openDb(dbFile);

// ---------- web assets ----------
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.json': 'application/json', '.ico': 'image/x-icon',
};
const webDir = path.join(process.cwd(), 'dist', 'web');
function readAsset(rel: string): Buffer | null {
  rel = rel.replace(/^\/+/, '');
  if (rel.includes('..')) return null;
  if (sea) { try { return Buffer.from(sea.getRawAsset('web/' + rel)); } catch { return null; } }
  const f = path.join(webDir, rel);
  return fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f) : null;
}

// ---------- server ----------
const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 });
const io = new IOServer(app.server, { cors: { origin: true } });
const who = (req: any) => String(req.headers['x-ax-who'] || 'unknown').slice(0, 40);

// Push a fresh copy of the event to everyone watching it (batched so a burst of changes sends once).
const pending = new Set<number>();
function changed(eventId: number) {
  if (pending.has(eventId)) return;
  pending.add(eventId);
  setTimeout(() => {
    pending.delete(eventId);
    try { io.to(`event:${eventId}`).emit('state', ev.eventState(db, eventId)); } catch (e) { console.error('push failed', e); }
  }, 60);
}

io.on('connection', socket => {
  socket.on('watch', (eventId: number) => {
    for (const r of socket.rooms) if (r.startsWith('event:')) socket.leave(r);
    socket.join(`event:${eventId}`);
    try { socket.emit('state', ev.eventState(db, Number(eventId))); } catch { /* unknown event */ }
  });
});

app.setErrorHandler((err: any, _req, reply) => {
  const status = err instanceof ev.HttpError ? err.status : err.statusCode || 500;
  if (status >= 500) console.error(err);
  reply.status(status).send({ error: err.message || 'Error' });
});

const id = (p: any, k = 'id') => { const n = Number(p[k]); if (!Number.isInteger(n)) throw new ev.HttpError(400, 'Bad id'); return n; };

app.get('/api/info', async () => ({ version: VERSION, dataDir, urls: lanUrls(), hardware: hardware.status() }));
app.get('/api/events', async () => ev.listEvents(db));
app.post('/api/events', async (req: any) => ({ id: ev.createEvent(db, req.body || {}) }));
app.get('/api/events/:id', async (req: any) => ev.eventState(db, id(req.params)));
app.put('/api/events/:id', async (req: any) => { const e = id(req.params); ev.updateEvent(db, e, req.body || {}); ev.audit(db, e, who(req), 'Updated event settings'); changed(e); return { ok: true }; });
app.get('/api/events/:id/audit', async (req: any) => ev.auditLog(db, id(req.params)));
app.get('/api/seasons/:year/classes', async (req: any) => ev.seasonClasses(db, id(req.params, 'year')));
app.get('/api/members', async (req: any) => ev.searchMembers(db, String(req.query.q || '')));

app.post('/api/events/:id/registrations', async (req: any) => {
  const e = id(req.params); const rid = ev.saveRegistration(db, e, req.body || {}, who(req)); changed(e); return { id: rid };
});
app.post('/api/events/:id/registrations/:rid/flags', async (req: any) => {
  const e = id(req.params); ev.setRegFlags(db, e, id(req.params, 'rid'), req.body || {}, who(req)); changed(e); return { ok: true };
});
app.post('/api/events/:id/queue', async (req: any) => { const e = id(req.params); ev.addToQueue(db, e, Number(req.body?.registrationId), who(req)); changed(e); return { ok: true }; });
app.post('/api/events/:id/queue/order', async (req: any) => { const e = id(req.params); ev.reorderQueue(db, e, (req.body?.runIds || []).map(Number), who(req)); changed(e); return { ok: true }; });
app.post('/api/events/:id/current', async (req: any) => { const e = id(req.params); ev.setCurrent(db, e, req.body?.runGroup, req.body?.session, who(req)); changed(e); return { ok: true }; });
app.post('/api/events/:id/timer/start', async (req: any) => { const e = id(req.params); const r = ev.timerStart(db, e, req.body?.source || 'manual'); changed(e); return { runId: r }; });
app.post('/api/events/:id/timer/finish', async (req: any) => {
  const e = id(req.params); const ms = Math.round(Number(req.body?.rawMs));
  if (!(ms > 0)) throw new ev.HttpError(400, 'Time must be a positive number of milliseconds');
  const r = ev.timerFinish(db, e, ms, req.body?.source || 'manual'); changed(e); return { runId: r };
});
app.put('/api/events/:id/runs/:rid', async (req: any) => { const e = id(req.params); ev.editRun(db, e, id(req.params, 'rid'), req.body || {}, who(req)); changed(e); return { ok: true }; });
app.delete('/api/events/:id/runs/:rid', async (req: any) => { const e = id(req.params); ev.deleteRun(db, e, id(req.params, 'rid'), who(req)); changed(e); return { ok: true }; });
app.post('/api/events/:id/runs/:rid/cones', async (req: any) => {
  const e = id(req.params); ev.coneCall(db, e, id(req.params, 'rid'), String(req.body?.station ?? ''), Number(req.body?.delta) || 0, who(req)); changed(e); return { ok: true };
});

// Timing hardware (serial). Times from hardware go to whichever event is marked live.
const hardware = new Hardware(dataDir);
let liveEventId: number | null = null;
app.get('/api/hardware', async () => ({ ...hardware.status(), liveEventId, ports: await hardware.listPorts() }));
app.post('/api/hardware', async (req: any) => {
  liveEventId = req.body?.liveEventId ? Number(req.body.liveEventId) : liveEventId;
  await hardware.configure(req.body || {});
  return { ...hardware.status(), liveEventId };
});
hardware.on('start', () => { if (liveEventId) { ev.timerStart(db, liveEventId, 'hardware'); changed(liveEventId); } });
hardware.on('finish', (ms: number) => { if (liveEventId) { ev.timerFinish(db, liveEventId, ms, 'hardware'); changed(liveEventId); } });

// Web app (single page): any other path serves index.html.
app.get('/*', async (req: any, reply) => {
  const url = String(req.params['*'] || '');
  const file = url && !url.startsWith('api/') ? readAsset(url) : null;
  if (file) {
    reply.header('Cache-Control', url.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    return reply.type(MIME[path.extname(url)] || 'application/octet-stream').send(file);
  }
  if (url.startsWith('api/')) return reply.status(404).send({ error: 'Not found' });
  const index = readAsset('index.html');
  if (!index) return reply.type('text/plain').send('Web app not built. Run: npm run build:web');
  return reply.header('Cache-Control', 'no-cache').type(MIME['.html']).send(index);
});

function lanUrls() {
  const urls: string[] = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}${port === 80 ? '' : ':' + port}`);
  return urls;
}

function shutdown() { try { db.close(); } catch { /* already closed */ } process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`\n  AXtime Next ${VERSION}`);
  console.log(`  Data folder: ${dataDir}`);
  if (process.env.AX_DOCKER) console.log(`  Running in Docker: open http://<server-ip>:<the port you mapped to ${port}>`);
  else {
    console.log(`  Open on this computer:  http://localhost:${port}`);
    for (const u of lanUrls()) console.log(`  Phones/tablets on the same Wi-Fi:  ${u}`);
  }
  console.log('\n  Keep this window open while the event runs. Close it (or press Ctrl+C) to stop.\n');
}).catch(e => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the other copy, or set AX_PORT to a different number.` : e);
  process.exit(1);
});
