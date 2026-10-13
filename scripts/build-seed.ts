// Builds data/seed.db: the club's history imported from the old AXtime export, plus a "Demo Day" event to play with.
// Usage: tsx scripts/build-seed.ts <old export json folder>
import fs from 'node:fs';
import { openDb } from '../src/server/db';
import { importLegacy } from '../src/server/import-legacy';
import { createEvent, saveRegistration } from '../src/server/events';

const dir = process.argv[2];
fs.mkdirSync('data', { recursive: true });
for (const f of ['data/seed.db', 'data/seed.db-wal', 'data/seed.db-shm']) if (fs.existsSync(f)) fs.rmSync(f);
const db = openDb('data/seed.db');
console.log(importLegacy(dir, db));

const src: any = db.prepare(`SELECT * FROM events ORDER BY date DESC LIMIT 1`).get();
const rules = JSON.parse(src.rules);
const id = createEvent(db, {
  name: 'Demo Day', location: src.location, eventNumber: 'DEMO', countsForPoints: false,
  runGroups: JSON.parse(src.run_groups), coneStations: ['A', 'B', 'C', 'D', 'E', 'F'], rules: { ...rules, maxRuns: 0 },
} as any);
const regs: any[] = db.prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY last_name').all(src.id);
for (const r of regs)
  saveRegistration(db, id, {
    memberId: r.member_id, firstName: r.first_name, lastName: r.last_name, carNumber: r.car_number, car: r.car, carColor: r.car_color,
    className: r.class_name, paxClass: r.pax_class, paxIndex: r.pax_index, isLadies: !!r.is_ladies, runGroup: r.run_group,
    checkedIn: true, teched: true, paid: true,
  } as any, 'setup');
db.prepare('DELETE FROM audit').run();
db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
db.close();
console.log(`Demo Day event #${id} with ${regs.length} drivers copied from "${src.name}"`);
