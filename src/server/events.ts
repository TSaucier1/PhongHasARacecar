// Event-day operations: registrations, queue, timing, cones. Every change returns the event id so the caller can
// push fresh state to everyone watching that event.
import { DB, tx } from './db';
import { scoreEvent, pointsRulesFromSeason, DEFAULT_RULES, EventRules } from '../shared/scoring';
import type { EventState, EventInfo, RegistrationRow, RunRow } from '../shared/types';

const now = () => new Date().toISOString();
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export function audit(db: DB, eventId: number | null, who: string, action: string) {
  db.prepare('INSERT INTO audit (event_id, at, who, action) VALUES (?,?,?,?)').run(eventId, now(), who || '', action);
}

export function eventInfo(db: DB, id: number): EventInfo {
  const e: any = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!e) throw new HttpError(404, 'Event not found');
  return {
    id: e.id, name: e.name, date: e.date, seasonYear: e.season_year, location: e.location, eventNumber: e.event_number,
    countsForPoints: !!e.counts_for_points, runGroups: JSON.parse(e.run_groups), coneStations: JSON.parse(e.cone_stations),
    rules: { ...DEFAULT_RULES, ...JSON.parse(e.rules) }, currentRunGroup: e.current_run_group, currentSession: e.current_session,
  };
}

export function listEvents(db: DB) {
  return db.prepare(`SELECT e.id, e.name, e.date, e.location, e.season_year AS seasonYear,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) AS drivers,
      (SELECT COUNT(*) FROM runs u WHERE u.event_id = e.id AND u.status = 'F') AS runs
    FROM events e ORDER BY e.date DESC, e.id DESC`).all();
}

export function eventState(db: DB, id: number): EventState {
  const event = eventInfo(db, id);
  const regs = db.prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY last_name, first_name').all(id) as any[];
  const runs = db.prepare('SELECT * FROM runs WHERE event_id = ? ORDER BY seq, id').all(id) as any[];
  const hits = db.prepare('SELECT h.* FROM cone_hits h JOIN runs r ON r.id = h.run_id WHERE r.event_id = ?').all(id) as any[];
  const season: any = db.prepare('SELECT settings FROM seasons WHERE year = ?').get(event.seasonYear);
  const scored = scoreEvent(regs, runs, event.rules, season ? pointsRulesFromSeason(JSON.parse(season.settings)) : undefined);
  const hitsByRun = new Map<number, { station: string; cones: number }[]>();
  for (const h of hits) { const l = hitsByRun.get(h.run_id) || []; l.push({ station: h.station, cones: h.cones }); hitsByRun.set(h.run_id, l); }

  const registrations: RegistrationRow[] = regs.map(r => ({
    id: r.id, memberId: r.member_id, firstName: r.first_name, lastName: r.last_name, carNumber: r.car_number, car: r.car,
    carColor: r.car_color, className: r.class_name, paxClass: r.pax_class, paxIndex: r.pax_index, isLadies: !!r.is_ladies,
    runGroup: r.run_group, checkedIn: !!r.checked_in, teched: !!r.teched, paid: !!r.paid, isRookie: !!r.is_rookie,
    workerRole: r.worker_role, result: scored.regs.get(r.id)!,
  }));
  const runRows: RunRow[] = runs.map(r => {
    const s = scored.runs.get(r.id);
    return {
      id: r.id, registrationId: r.registration_id, seq: r.seq, session: r.session, status: r.status, queuePos: r.queue_pos,
      rawMs: r.raw_ms, cones: r.cones, dnf: !!r.dnf, rerun: !!r.rerun, off: !!r.off_course, finishedAt: r.finished_at,
      coneHits: hitsByRun.get(r.id) || [], totalMs: s?.totalMs ?? 0, paxMs: s?.paxMs ?? 0, driverRun: s?.driverRun ?? 0,
      counted: s?.counted ?? false, clean: s?.clean ?? false,
    };
  });
  return { event, registrations, runs: runRows, generatedAt: now() };
}

// ---------- event setup ----------

export function createEvent(db: DB, input: Partial<EventInfo>): number {
  const last: any = db.prepare('SELECT * FROM events ORDER BY date DESC, id DESC LIMIT 1').get();
  const date = input.date || localDate();
  const year = Number(date.slice(0, 4));
  const r = db.prepare(`INSERT INTO events (name, date, season_year, location, event_number, counts_for_points, run_groups, cone_stations, rules)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    input.name || `${year} Event`, date, year, input.location ?? last?.location ?? '', input.eventNumber || '',
    input.countsForPoints === false ? 0 : 1,
    JSON.stringify(input.runGroups || (last ? JSON.parse(last.run_groups) : [{ name: 'Red', color: 'red' }, { name: 'Blue', color: 'blue' }, { name: 'Green', color: 'green' }])),
    JSON.stringify(input.coneStations || ['A', 'B', 'C', 'D', 'E', 'F']),
    JSON.stringify({ ...DEFAULT_RULES, ...(last ? JSON.parse(last.rules) : {}), ...(input.rules || {}) }));
  return Number(r.lastInsertRowid);
}

export function updateEvent(db: DB, id: number, input: Partial<EventInfo>) {
  const cur = eventInfo(db, id);
  const next = { ...cur, ...input, rules: { ...cur.rules, ...(input.rules || {}) } as EventRules };
  db.prepare(`UPDATE events SET name=?, date=?, season_year=?, location=?, event_number=?, counts_for_points=?, run_groups=?,
      cone_stations=?, rules=?, current_run_group=?, current_session=? WHERE id=?`).run(
    next.name, next.date, Number(String(next.date).slice(0, 4)) || cur.seasonYear, next.location, next.eventNumber,
    next.countsForPoints ? 1 : 0, JSON.stringify(next.runGroups), JSON.stringify(next.coneStations.map(s => String(s).trim()).filter(Boolean)),
    JSON.stringify(next.rules), next.currentRunGroup || '', next.currentSession || 1, id);
  return id;
}

export function seasonClasses(db: DB, year: number) {
  let rows = db.prepare('SELECT name, pax_class AS paxClass, pax_index AS paxIndex, is_ladies AS isLadies, category, description FROM season_classes WHERE season_year = ? ORDER BY name').all(year);
  if (!rows.length) {
    const latest: any = db.prepare('SELECT MAX(season_year) y FROM season_classes WHERE season_year <= ?').get(year) ||
      db.prepare('SELECT MAX(season_year) y FROM season_classes').get();
    rows = db.prepare('SELECT name, pax_class AS paxClass, pax_index AS paxIndex, is_ladies AS isLadies, category, description FROM season_classes WHERE season_year = ? ORDER BY name').all(latest?.y ?? 0);
  }
  return rows;
}

export function searchMembers(db: DB, q: string) {
  const like = `%${q.trim()}%`;
  return (db.prepare(`SELECT id, first_name AS firstName, last_name AS lastName, dedicated_number AS dedicatedNumber, last_class AS lastClass, cars
    FROM members WHERE first_name || ' ' || last_name LIKE ? OR dedicated_number = ? ORDER BY last_name, first_name LIMIT 25`).all(like, q.trim()) as any[])
    .map(m => ({ ...m, cars: JSON.parse(m.cars) }));
}

// ---------- registration ----------

export function saveRegistration(db: DB, eventId: number, r: Partial<RegistrationRow>, who: string) {
  const cls: any = r.className ? (seasonClasses(db, eventInfo(db, eventId).seasonYear) as any[]).find(c => c.name === r.className) : null;
  const vals = [r.firstName ?? '', r.lastName ?? '', r.carNumber ?? '', r.car ?? '', r.carColor ?? '', r.className ?? '',
    cls?.paxClass ?? r.paxClass ?? '', cls?.paxIndex ?? r.paxIndex ?? 1, cls?.isLadies ?? (r.isLadies ? 1 : 0), r.runGroup ?? '',
    r.checkedIn ? 1 : 0, r.teched ? 1 : 0, r.paid ? 1 : 0, r.isRookie ? 1 : 0, r.memberId ?? null];
  if (r.id) {
    db.prepare(`UPDATE registrations SET first_name=?, last_name=?, car_number=?, car=?, car_color=?, class_name=?, pax_class=?, pax_index=?,
      is_ladies=?, run_group=?, checked_in=?, teched=?, paid=?, is_rookie=?, member_id=? WHERE id=? AND event_id=?`).run(...vals, r.id, eventId);
    audit(db, eventId, who, `Updated registration #${r.carNumber} ${r.firstName} ${r.lastName} (${r.className})`);
    return r.id;
  }
  const res = db.prepare(`INSERT INTO registrations (first_name, last_name, car_number, car, car_color, class_name, pax_class, pax_index,
      is_ladies, run_group, checked_in, teched, paid, is_rookie, member_id, event_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...vals, eventId);
  audit(db, eventId, who, `Registered #${r.carNumber} ${r.firstName} ${r.lastName} (${r.className})`);
  return Number(res.lastInsertRowid);
}

export function setRegFlags(db: DB, eventId: number, regId: number, flags: { checkedIn?: boolean; teched?: boolean; paid?: boolean }, who: string) {
  for (const [k, col] of [['checkedIn', 'checked_in'], ['teched', 'teched'], ['paid', 'paid']] as const)
    if (flags[k] !== undefined) db.prepare(`UPDATE registrations SET ${col} = ? WHERE id = ? AND event_id = ?`).run(flags[k] ? 1 : 0, regId, eventId);
  audit(db, eventId, who, `Registration ${regId}: ${JSON.stringify(flags)}`);
}

// ---------- queue & timing ----------

function nextSeq(db: DB, eventId: number) {
  return ((db.prepare('SELECT MAX(seq) m FROM runs WHERE event_id = ?').get(eventId) as any).m || 0) + 1;
}

export function addToQueue(db: DB, eventId: number, regId: number, who: string) {
  const reg: any = db.prepare('SELECT * FROM registrations WHERE id = ? AND event_id = ?').get(regId, eventId);
  if (!reg) throw new HttpError(404, 'Driver not registered for this event');
  const ev = eventInfo(db, eventId);
  const max: any = db.prepare(`SELECT MAX(queue_pos) m FROM runs WHERE event_id = ? AND status IN ('Q','R')`).get(eventId);
  db.prepare(`INSERT INTO runs (event_id, registration_id, seq, session, status, queue_pos) VALUES (?,?,?,?, 'Q', ?)`)
    .run(eventId, regId, nextSeq(db, eventId), ev.currentSession, (max.m || 0) + 1);
  audit(db, eventId, who, `Queued #${reg.car_number} ${reg.first_name} ${reg.last_name}`);
}

export function reorderQueue(db: DB, eventId: number, runIds: number[], who: string) {
  tx(db, () => runIds.forEach((id, i) => db.prepare(`UPDATE runs SET queue_pos = ? WHERE id = ? AND event_id = ? AND status = 'Q'`).run(i + 1, id, eventId)));
  audit(db, eventId, who, `Reordered queue`);
}

export function deleteRun(db: DB, eventId: number, runId: number, who: string) {
  const run: any = db.prepare('SELECT * FROM runs WHERE id = ? AND event_id = ?').get(runId, eventId);
  if (!run) throw new HttpError(404, 'Run not found');
  db.prepare('DELETE FROM runs WHERE id = ?').run(runId);
  audit(db, eventId, who, `Deleted run ${runId} (status ${run.status}, ${run.raw_ms}ms)`);
}

function queueHead(db: DB, eventId: number, status: string): any {
  return db.prepare(`SELECT * FROM runs WHERE event_id = ? AND status = ? ORDER BY queue_pos, seq LIMIT 1`).get(eventId, status);
}

/** A car leaves the start line: the first queued car is now on course. */
export function timerStart(db: DB, eventId: number, source: string) {
  const run = queueHead(db, eventId, 'Q');
  db.prepare('INSERT INTO timer_log (event_id, at, source, kind, run_id) VALUES (?,?,?,?,?)').run(eventId, now(), source, 'start', run?.id ?? null);
  if (!run) return null;
  db.prepare(`UPDATE runs SET status = 'R', started_at = ? WHERE id = ?`).run(now(), run.id);
  return run.id as number;
}

/** A finish time arrives: it belongs to the car that has been on course longest (or the first queued car, if no start was seen). */
export function timerFinish(db: DB, eventId: number, rawMs: number, source: string) {
  const run = queueHead(db, eventId, 'R') || queueHead(db, eventId, 'Q');
  db.prepare('INSERT INTO timer_log (event_id, at, source, kind, value_ms, run_id) VALUES (?,?,?,?,?,?)').run(eventId, now(), source, 'time', rawMs, run?.id ?? null);
  if (!run) return null;
  db.prepare(`UPDATE runs SET status = 'F', raw_ms = ?, finished_at = ?, queue_pos = 0 WHERE id = ?`).run(rawMs, now(), run.id);
  return run.id as number;
}

export function editRun(db: DB, eventId: number, runId: number, input: { rawMs?: number; dnf?: boolean; rerun?: boolean; off?: boolean }, who: string) {
  const run: any = db.prepare('SELECT * FROM runs WHERE id = ? AND event_id = ?').get(runId, eventId);
  if (!run) throw new HttpError(404, 'Run not found');
  if (input.rawMs !== undefined) db.prepare(`UPDATE runs SET raw_ms = ?, status = CASE WHEN ? > 0 THEN 'F' ELSE status END, finished_at = COALESCE(finished_at, ?) WHERE id = ?`).run(Math.max(0, Math.round(input.rawMs)), input.rawMs, now(), runId);
  if (input.dnf !== undefined) db.prepare('UPDATE runs SET dnf = ? WHERE id = ?').run(input.dnf ? 1 : 0, runId);
  if (input.rerun !== undefined) db.prepare('UPDATE runs SET rerun = ? WHERE id = ?').run(input.rerun ? 1 : 0, runId);
  if (input.off !== undefined) db.prepare('UPDATE runs SET off_course = ? WHERE id = ?').run(input.off ? 1 : 0, runId);
  audit(db, eventId, who, `Edited run ${runId}: ${JSON.stringify(input)}`);
}

/** Cone call from a station. delta adds/removes cones at that station; total cones for the run = sum over stations. */
export function coneCall(db: DB, eventId: number, runId: number, station: string, delta: number, who: string) {
  const run: any = db.prepare('SELECT * FROM runs WHERE id = ? AND event_id = ?').get(runId, eventId);
  if (!run) throw new HttpError(404, 'Run not found');
  station = String(station ?? '').trim();
  tx(db, () => {
    const cur: any = db.prepare('SELECT cones FROM cone_hits WHERE run_id = ? AND station = ?').get(runId, station);
    const n = Math.max(0, (cur?.cones || 0) + delta);
    if (n === 0) db.prepare('DELETE FROM cone_hits WHERE run_id = ? AND station = ?').run(runId, station);
    else db.prepare('INSERT OR REPLACE INTO cone_hits (run_id, station, cones) VALUES (?,?,?)').run(runId, station, n);
    const total: any = db.prepare('SELECT COALESCE(SUM(cones),0) t FROM cone_hits WHERE run_id = ?').get(runId);
    db.prepare('UPDATE runs SET cones = ? WHERE id = ?').run(total.t, runId);
  });
  audit(db, eventId, who, `Cone ${delta > 0 ? '+' : ''}${delta} at ${station || 'n/a'} on run ${runId}`);
}

export function setCurrent(db: DB, eventId: number, runGroup: string | undefined, session: number | undefined, who: string) {
  if (runGroup !== undefined) db.prepare('UPDATE events SET current_run_group = ? WHERE id = ?').run(runGroup, eventId);
  if (session !== undefined) db.prepare('UPDATE events SET current_session = ? WHERE id = ?').run(session, eventId);
  audit(db, eventId, who, `Now running: group ${runGroup ?? '-'} session ${session ?? '-'}`);
}

export function auditLog(db: DB, eventId: number) {
  return db.prepare('SELECT at, who, action FROM audit WHERE event_id = ? ORDER BY id DESC LIMIT 300').all(eventId);
}
