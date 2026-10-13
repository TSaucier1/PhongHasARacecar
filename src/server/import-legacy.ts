// Import an old AXtime RM database (the json/ folder of the CSV/JSON export) into a new database.
// Usage: tsx src/server/import-legacy.ts <export json folder> <new database file>
import fs from 'node:fs';
import path from 'node:path';
import { openDb, tx, DB } from './db';

type Doc = Record<string, any>;

function readJsonl(dir: string, name: string): Doc[] {
  const f = path.join(dir, name + '.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}
const oid = (v: any): string => (v && typeof v === 'object' && '$oid' in v ? v.$oid : v == null ? '' : String(v));
const date = (v: any): string | null => {
  if (!v) return null;
  if (typeof v === 'object' && '$date' in v) {
    const d = v.$date;
    return new Date(typeof d === 'object' && '$numberLong' in d ? Number(d.$numberLong) : d).toISOString();
  }
  return String(v);
};
const b = (v: any) => (v ? 1 : 0);
const ms = (sec: any) => Math.round((Number(sec) || 0) * 1000);

function usDateToIso(d: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d || '');
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : d;
}

export function importLegacy(dir: string, db: DB) {
  const seasons = readJsonl(dir, 'seasons');
  const members = readJsonl(dir, 'members');
  const events = readJsonl(dir, 'events');
  const regs = readJsonl(dir, 'registrations');
  const runs = readJsonl(dir, 'runs');
  const counts: Record<string, number> = {};

  tx(db, () => {
    const insSeason = db.prepare('INSERT OR IGNORE INTO seasons (year, settings) VALUES (?, ?)');
    const insClass = db.prepare(`INSERT OR REPLACE INTO season_classes (season_year, name, pax_class, pax_index, is_ladies, category, description) VALUES (?,?,?,?,?,?,?)`);
    for (const s of seasons) {
      const { classes, _id, __v, ...rest } = s;
      insSeason.run(s.seasonYear, JSON.stringify(rest));
      for (const c of classes || []) insClass.run(s.seasonYear, c.name, c.paxClass || '', c.index ?? 1, b(c.isLadies), c.category || '', c.description || '');
    }
    counts.seasons = seasons.length;

    const insMember = db.prepare(`INSERT INTO members (first_name, last_name, club_member_id, dedicated_number, last_class, email, cars, legacy_id) VALUES (?,?,?,?,?,?,?,?)`);
    const memberId = new Map<string, number>();
    for (const m of members) {
      const email = (m.emails || [])[0]?.address || (m.emails || [])[0]?.email || '';
      const r = insMember.run(m.firstName || '', m.lastName || '', m.clubMemberId || '', m.dedicatedNumber || '', m.lastAxClass || '', email,
        JSON.stringify((m.cars || []).map((c: Doc) => ({ year: c.year || null, make: c.make || '', model: c.model || '', color: c.color || '', description: c.description || '' }))),
        oid(m._id));
      memberId.set(oid(m._id), Number(r.lastInsertRowid));
    }
    counts.members = members.length;

    const insEvent = db.prepare(`INSERT INTO events (name, date, season_year, location, event_number, counts_for_points, run_groups, cone_stations, rules, legacy_id) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const eventId = new Map<string, number>();
    for (const e of events) {
      const num = /#\s*([\d.]+)\s*$/.exec(e.name || '')?.[1] ?? String(e.eventNumber ?? '');
      const stations = (e.stations || []).map((s: Doc) => s.name).filter((n: string) => /^Course #/.test(n)).map((n: string) => n.replace('Course #', ''));
      const rules = { conePenaltyMs: ms(e.conePenalty ?? 2), maxRuns: e.maxRunsPerDriver || 0, countConesOnOffRuns: true, paxRounding: 'truncate', paxExcludeClassesContaining: ['fun'] };
      const r = insEvent.run(e.name, usDateToIso(e.date), e.season, e.location?.name || '', num, b(e.countForPoints),
        JSON.stringify((e.runGroups || []).map((g: Doc) => ({ name: g.name, color: g.color }))), JSON.stringify(stations), JSON.stringify(rules), oid(e._id));
      eventId.set(oid(e._id), Number(r.lastInsertRowid));
    }
    counts.events = events.length;

    const insReg = db.prepare(`INSERT INTO registrations (event_id, member_id, first_name, last_name, car_number, car, car_color, class_name, pax_class, pax_index, is_ladies, run_group, checked_in, teched, paid, is_rookie, worker_role, legacy_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const regId = new Map<string, number>();
    let skipped = 0;
    for (const p of regs) {
      const ev = eventId.get(oid(p.eventId));
      if (!ev) { skipped++; continue; }
      const d = p.driver || {}, car = d.car || {};
      let first = d.firstName || '', last = d.lastName || '';
      if (!first && !last && d.name) { const parts = String(d.name).trim().split(/\s+/); first = parts.shift() || ''; last = parts.join(' '); }
      const carDesc = car.description || [car.year, car.make, car.model].filter(Boolean).join(' ');
      const r = insReg.run(ev, memberId.get(oid(p.memberId)) ?? null, first, last, d.carNumber || '', carDesc, car.color || '',
        p.axClass?.name || '', p.axClass?.paxClass || '', p.axClass?.index ?? 1, b(p.axClass?.isLadies), p.runGroup?.name || '',
        b(p.checkedIn), b(p.isTechd), b(p.paid), b(p.isRookie), p.workerRole && p.workerRole !== 'None' ? p.workerRole : '', oid(p._id));
      regId.set(oid(p._id), Number(r.lastInsertRowid));
    }
    counts.registrations = regId.size; counts.registrations_skipped = skipped;

    const insRun = db.prepare(`INSERT INTO runs (event_id, registration_id, seq, session, status, raw_ms, cones, dnf, rerun, off_course, finished_at, legacy_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insHit = db.prepare('INSERT OR REPLACE INTO cone_hits (run_id, station, cones) VALUES (?,?,?)');
    let runSkipped = 0, n = 0;
    for (const r of runs) {
      const ev = eventId.get(oid(r.eventId)), reg = regId.get(oid(r.participantId));
      if (!ev || !reg) { runSkipped++; continue; }
      const res = insRun.run(ev, reg, r.runNumber || 0, r.session || 1, r.status || 'F', ms(r.rawTime), r.cones || 0, b(r.isDnf), b(r.getsRerun), b(r.isOff), date(r.finishTimestamp), oid(r._id));
      const id = Number(res.lastInsertRowid); n++;
      let hitSum = 0;
      for (const h of r.coneHits || []) {
        if (!h.cones) continue;
        const st = h.station && h.station !== 0 ? String(h.station) : '';
        insHit.run(id, st, h.cones); hitSum += h.cones;
      }
      if ((r.cones || 0) > hitSum) insHit.run(id, '', (r.cones || 0) - hitSum); // cones recorded without a station
    }
    counts.runs = n; counts.runs_skipped = runSkipped;
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('imported_from', JSON.stringify({ dir: path.basename(dir), at: new Date().toISOString(), counts }));
  });
  return counts;
}

if (require.main === module) {
  const [dir, file] = process.argv.slice(2);
  if (!dir || !file) { console.error('usage: import-legacy <json folder> <db file>'); process.exit(1); }
  if (fs.existsSync(file)) fs.rmSync(file);
  const db = openDb(file);
  console.log(importLegacy(dir, db));
  db.close();
}
