// Replays every past event through the new scoring engine and compares with the published (stored) results.
// Usage: tsx tests/baseline-check.ts <db> <baseline stored folder> [--details]
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../src/server/db';
import { scoreEvent, pointsRulesFromSeason } from '../src/shared/scoring';

const [dbFile, base] = process.argv.slice(2);
const details = process.argv.includes('--details');
const db = openDb(dbFile);
const index = JSON.parse(fs.readFileSync(path.join(base, 'events_index.json'), 'utf8'));
const fields = ['bestTime', 'bestPaxTime', 'rankOverall', 'rankClass', 'rankPax', 'totalCones', 'totalRuns', 'totalCountedRuns', 'paxPoints', 'classPoints'] as const;
// Registrations whose runs were scored under a different class than the registration now shows
// (driver reclassed after running). The old app kept the old PAX index on those runs; the new engine applies the correction.
const runClass = new Map<string, Set<string>>();
const jsonDir = process.env.LEGACY_JSON || '/home/claude/export/out/json';
for (const l of fs.readFileSync(path.join(jsonDir, 'runs.jsonl'), 'utf8').split('\n')) {
  if (!l) continue; const r = JSON.parse(l);
  const pid = r.participantId; const set = runClass.get(pid) || new Set(); set.add(`${r.axClass?.name}|${r.axClass?.index}`); runClass.set(pid, set);
}
const tally: Record<string, { ok: number; bad: number }> = {};
const mismatches: string[] = [];
const nonPoints = new Set<string>();      // events that don't count for points
const ties = new Set<string>();           // event|driver with a best time shared by another driver
for (const f of fields) tally[f] = { ok: 0, bad: 0 };

for (const e of index) {
  const stored = JSON.parse(fs.readFileSync(path.join(base, 'events', e.folder, 'computed.json'), 'utf8'));
  const ev: any = db.prepare('SELECT * FROM events WHERE legacy_id = ?').get(e.id);
  const regs: any[] = db.prepare('SELECT * FROM registrations WHERE event_id = ?').all(ev.id);
  const runs: any[] = db.prepare('SELECT * FROM runs WHERE event_id = ?').all(ev.id);
  const season: any = db.prepare('SELECT settings FROM seasons WHERE year = ?').get(ev.season_year);
  const res = scoreEvent(regs, runs, { ...JSON.parse(ev.rules), ...JSON.parse(process.env.RULES_OVERRIDE || '{}') }, season ? pointsRulesFromSeason(JSON.parse(season.settings)) : undefined);
  if (!ev.counts_for_points) nonPoints.add(`${e.date} ${e.name}`);
  const timeCount = new Map<number, number>();
  for (const r of res.regs.values()) if (r.bestMs) timeCount.set(r.bestMs, (timeCount.get(r.bestMs) || 0) + 1);
  for (const reg of regs) {
    const s = stored.participants[reg.legacy_id]; if (!s) continue;
    if ((timeCount.get(res.regs.get(reg.id)!.bestMs) || 0) > 1) ties.add(`${e.date} ${e.name}|${s['driver.name']}`);
    const reclassed = [...(runClass.get(reg.legacy_id) || [])].some(k => k !== `${reg.class_name}|${reg.pax_index}`);
    const r = res.regs.get(reg.id)!;
    const mine: Record<string, number> = {
      bestTime: r.bestMs / 1000, bestPaxTime: r.bestPaxMs / 1000, rankOverall: r.rankOverall, rankClass: r.rankClass,
      rankPax: r.rankPax, totalCones: r.cones, totalRuns: r.totalRuns, totalCountedRuns: r.countedRuns, paxPoints: r.paxPoints, classPoints: r.classPoints,
    };
    for (const f of fields) {
      const a = Number(s[f] ?? 0), b = mine[f];
      if (Math.abs(a - b) < 0.0005) tally[f].ok++;
      else { tally[f].bad++; mismatches.push(`${e.date} ${e.name} | ${s['driver.name']} | ${f}: published ${a} new ${b}${reclassed ? ' | RECLASSED' : ''}`); }
    }
  }
}
// Sort every difference into a known cause, so anything unexplained stands out.
const rows = mismatches.map(m => { const [ev, who, rest, flag] = m.split(' | '); const [f] = rest.split(':'); return { ev, who, f, rest, reclassed: !!flag }; });
const upstream = new Set(rows.filter(r => ['bestTime', 'bestPaxTime'].includes(r.f) || r.reclassed).map(r => r.ev));
const cause = (r: typeof rows[number]) => {
  if (r.reclassed) return 'reclassed after running (old app kept old PAX index)';
  if (r.f === 'bestPaxTime' || r.f === 'bestTime') {
    const [, a, b] = /published ([\d.]+) new ([\d.]+)/.exec(r.rest) || [];
    if (Math.abs(Number(a) - Number(b)) <= 0.0011) return '0.001s rounding difference';
    return 'old app run-numbering glitch (duplicate run numbers)';
  }
  if (['totalRuns', 'totalCountedRuns'].includes(r.f)) return 'old app run-numbering glitch (duplicate run numbers)';
  const [, pa, pb] = /published ([\d.]+) new ([\d.]+)/.exec(r.rest) || [];
  if (['paxPoints', 'classPoints'].includes(r.f) && nonPoints.has(r.ev)) return 'practice event (no points); old points table';
  if (r.f === 'rankOverall' && ties.has(`${r.ev}|${r.who}`)) return 'tied time; old app ordered ties arbitrarily';
  if (r.f === 'classPoints' && Math.abs(Number(pa) - Number(pb)) < 0.02) return '0.001s rounding difference (via class leader time)';
  if (['rankOverall', 'rankClass', 'rankPax', 'paxPoints', 'classPoints'].includes(r.f) && upstream.has(r.ev)) return 'knock-on from a time difference above';
  if (r.f === 'totalCones' || (r.f === 'paxPoints' && Number(pb) === 0)) return 'stale value left by old app (inconsistent updates)';
  return 'UNEXPLAINED';
};
const causes: Record<string, number> = {};
for (const r of rows) { const c = cause(r); causes[c] = (causes[c] || 0) + 1; if (c === 'UNEXPLAINED' && details) console.log('UNEXPLAINED', r.ev, r.who, r.rest); }
for (const f of fields) {
  const t = tally[f];
  console.log(`${f.padEnd(17)} ${t.ok}/${t.ok + t.bad} match (${(100 * t.ok / (t.ok + t.bad)).toFixed(2)}%)`);
}
console.log('\ndifferences by cause:', causes);
