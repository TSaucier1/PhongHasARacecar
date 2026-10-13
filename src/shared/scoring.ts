// Scoring engine: pure functions, no database. Everything the club might want to change lives in EventRules.
// All times are whole milliseconds.

export interface EventRules {
  conePenaltyMs: number;          // seconds added per cone, in ms (legacy default 2000)
  maxRuns: number;                // counted runs per driver; 0 = unlimited. Re-runs don't count toward this.
  countConesOnOffRuns: boolean;   // legacy: true (matches 99.8% of published totals)
  paxRounding: 'truncate' | 'round';
  paxExcludeClassesContaining: string[]; // classes left out of PAX ranking (legacy: anything containing "fun")
}

// Season-level points rules (legacy season settings).
export interface PointsRules {
  paxPoints: number[];        // points for PAX rank 1, 2, 3...
  classPoints: number[];      // points for class rank 1, 2, 3...
  minPaxPoints: number;       // points for ranks beyond the table
  minClassPoints: number;
  classMethod: 'table' | 'besttimediffpct'; // besttimediffpct = class best / your time x 1000
}

export function pointsRulesFromSeason(settings: any): PointsRules {
  const pts = (list: any[]) => (list || []).map(p => Number(p.points) || 0);
  return {
    paxPoints: pts(settings?.paxPoints),
    classPoints: pts(settings?.classPoints),
    minPaxPoints: Number(settings?.minimumPaxParticipationPoints) || 0,
    minClassPoints: Number(settings?.minimumClassParticipationPoints) || 0,
    classMethod: settings?.classPointsCalcMethod === 'besttimediffpct' ? 'besttimediffpct' : 'table',
  };
}

export const DEFAULT_RULES: EventRules = {
  conePenaltyMs: 2000,
  maxRuns: 0,
  countConesOnOffRuns: true,
  paxRounding: 'truncate',
  paxExcludeClassesContaining: ['fun'],
};

export interface RegIn {
  id: number;
  class_name: string;
  pax_class?: string;   // classes sharing a PAX group are ranked together on PAX time
  pax_index: number;
}
export interface RunIn {
  id: number;
  registration_id: number;
  seq: number;
  status: string;   // Q, R, F
  raw_ms: number;
  cones: number;
  dnf: number | boolean;
  rerun: number | boolean;
  off_course: number | boolean;
}

export interface RunScore {
  id: number;
  totalMs: number;      // raw + cones (0 if no raw time)
  paxMs: number;
  driverRun: number;    // 1-based counted run number for this driver (re-runs share the next number)
  counted: boolean;     // within the run limit and not a re-run
  clean: boolean;       // eligible to be a best time
}

export interface RegResult {
  id: number;
  bestMs: number;       // 0 = no clean time
  bestPaxMs: number;
  totalRuns: number;
  countedRuns: number;
  cones: number;
  dnfs: number;
  reruns: number;
  rankOverall: number;
  rankClass: number;
  rankPax: number;
  diffOverallMs: number;  // behind fastest
  diffPrevOverallMs: number; // behind the car one place ahead
  diffClassMs: number;
  diffPrevClassMs: number;
  diffPaxMs: number;
  diffPrevPaxMs: number;
  classGroup: string;
  paxPoints: number;
  classPoints: number;
}

export interface EventResults {
  regs: Map<number, RegResult>;
  runs: Map<number, RunScore>;
}

export function paxOf(totalMs: number, index: number, rules: EventRules): number {
  if (totalMs <= 0) return 0;
  // Legacy computed floor(seconds * index * 1000) in floating point; match it, then nudge for float noise.
  const exact = (totalMs / 1000) * index * 1000;
  return rules.paxRounding === 'round' ? Math.round(exact) : Math.floor(exact + 1e-7);
}

export function scoreEvent(regs: RegIn[], runs: RunIn[], rulesIn: Partial<EventRules> = {}, points?: PointsRules): EventResults {
  const rules = { ...DEFAULT_RULES, ...rulesIn };
  const regById = new Map(regs.map(r => [r.id, r]));
  const byReg = new Map<number, RunIn[]>();
  for (const r of runs) {
    if (r.status !== 'F' || !regById.has(r.registration_id)) continue;
    let list = byReg.get(r.registration_id);
    if (!list) byReg.set(r.registration_id, (list = []));
    list.push(r);
  }

  const runScores = new Map<number, RunScore>();
  const results = new Map<number, RegResult>();

  for (const reg of regs) {
    const list = (byReg.get(reg.id) || []).slice().sort((a, b) => a.seq - b.seq || a.id - b.id); // always in run order
    const res: RegResult = {
      id: reg.id, bestMs: 0, bestPaxMs: 0, totalRuns: 0, countedRuns: 0, cones: 0, dnfs: 0, reruns: 0,
      rankOverall: 0, rankClass: 0, rankPax: 0,
      diffOverallMs: 0, diffPrevOverallMs: 0, diffClassMs: 0, diffPrevClassMs: 0, diffPaxMs: 0, diffPrevPaxMs: 0,
      classGroup: reg.pax_class || reg.class_name.replace(':', ''), paxPoints: 0, classPoints: 0,
    };
    let driverRun = 0;
    for (const run of list) {
      const rerun = !!run.rerun, dnf = !!run.dnf, off = !!run.off_course;
      res.totalRuns++;
      if (!rerun) { driverRun++; res.countedRuns++; }
      const totalMs = run.raw_ms > 0 ? run.raw_ms + run.cones * rules.conePenaltyMs : 0;
      const paxMs = paxOf(totalMs, reg.pax_index, rules);
      const counted = !rerun && (rules.maxRuns === 0 || driverRun <= rules.maxRuns);
      const clean = counted && !dnf && !off && run.raw_ms > 0;
      runScores.set(run.id, { id: run.id, totalMs, paxMs, driverRun: rerun ? driverRun + 1 : driverRun, counted, clean });
      if (dnf) res.dnfs++;
      if (rerun) res.reruns++;
      if (!off || rules.countConesOnOffRuns) res.cones += run.cones;
      if (clean && (res.bestMs === 0 || totalMs < res.bestMs)) res.bestMs = totalMs;
      if (clean && (res.bestPaxMs === 0 || paxMs < res.bestPaxMs)) res.bestPaxMs = paxMs;
    }
    results.set(reg.id, res);
  }

  rank([...results.values()], r => r.bestMs, (r, rk, d, dp) => { r.rankOverall = rk; r.diffOverallMs = d; r.diffPrevOverallMs = dp; });

  const excluded = (name: string) => rules.paxExcludeClassesContaining.some(x => x && name.toLowerCase().includes(x.toLowerCase()));
  const paxList = regs.filter(r => !excluded(r.class_name)).map(r => results.get(r.id)!);
  rank(paxList, r => r.bestPaxMs, (r, rk, d, dp) => {
    r.rankPax = rk; r.diffPaxMs = d; r.diffPrevPaxMs = dp;
    if (points && rk > 0) r.paxPoints = points.paxPoints[rk - 1] ?? points.minPaxPoints;
  });
  for (const r of regs) if (excluded(r.class_name)) results.get(r.id)!.rankPax = 0;

  // Class ranking. Classes that belong to a PAX group are ranked together on PAX time.
  const groups = new Map<string, { usePax: boolean; list: RegResult[] }>();
  for (const reg of regs) {
    const res = results.get(reg.id)!;
    const g = groups.get(res.classGroup) || { usePax: !!reg.pax_class, list: [] };
    g.list.push(res); groups.set(res.classGroup, g);
  }
  for (const { usePax, list } of groups.values()) {
    const key = (r: RegResult) => (r.bestMs > 0 ? (usePax ? r.bestPaxMs : r.bestMs) : 0);
    rank(list, key, (r, rk, d, dp) => {
      r.rankClass = rk; r.diffClassMs = d; r.diffPrevClassMs = dp;
      if (!points || rk === 0) { r.classPoints = 0; return; }
      if (points.classMethod === 'besttimediffpct') {
        const best = key(list.find(x => x.rankClass === 1) || r);
        r.classPoints = Math.floor((best / key(r)) * 1000 * 1000 + 1e-7) / 1000;
      } else r.classPoints = points.classPoints[rk - 1] ?? points.minClassPoints;
    });
  }

  return { regs: results, runs: runScores };
}

// Drivers with a time are ranked fastest first; drivers with no clean time get rank 0.
function rank(list: RegResult[], key: (r: RegResult) => number, set: (r: RegResult, rank: number, diff: number, diffPrev: number) => void) {
  const timed = list.filter(r => key(r) > 0).sort((a, b) => key(a) - key(b) || a.id - b.id);
  const best = timed.length ? key(timed[0]) : 0;
  timed.forEach((r, i) => set(r, i + 1, key(r) - best, i === 0 ? 0 : key(r) - key(timed[i - 1])));
  for (const r of list) if (key(r) <= 0) set(r, 0, 0, 0);
}

export function fmt(ms: number): string {
  return ms > 0 ? (ms / 1000).toFixed(3) : '-';
}
