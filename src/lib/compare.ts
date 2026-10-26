import "server-only";
import { db, type Source } from "@/lib/db";

export type Night = {
  source: Source;
  date: string;
  start: string | null;
  end: string | null;
  total_sleep_s: number | null;
  deep_s: number | null;
  light_s: number | null;
  rem_s: number | null;
  awake_s: number | null;
  resp_rate: number | null;
  spo2: number | null;
  avg_hr: number | null;
  hrv: number | null;
  rhr: number | null;
  sleep_score: number | null;
  readiness: number | null;
  state: string | null;
};

export type Day = {
  source: Source;
  date: string;
  steps: number | null;
  kcal_total: number | null;
  kcal_active: number | null;
  rhr: number | null;
  min_hr: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  load: number | null;
  /** Length of the WHOOP cycle or Garmin day; null while still running. */
  hours: number | null;
  /** Derived: values scaled to 24 h so cycles and calendar days compare fairly. */
  kcal_24h: number | null;
  steps_24h: number | null;
};

export type Workout = {
  source: Source;
  id: string;
  start: string;
  end: string;
  sport: string | null;
  distance_m: number | null;
  elevation_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  kcal: number | null;
  load: number | null;
  zones_s: string | null;
  hr_source: HrSource | null;
};

/** Garmin heart rate source per activity; only "strap" is treated as reference. */
export type HrSource = "strap" | "wrist" | "import";

export type Pair<T> = { date: string; whoop?: T; garmin?: T };

function pairByDate<T extends { source: Source; date: string }>(rows: T[]): Pair<T>[] {
  const map = new Map<string, Pair<T>>();
  for (const r of rows) {
    const p = map.get(r.date) ?? { date: r.date };
    p[r.source] = r;
    map.set(r.date, p);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function nightPairs(from: string, to: string): Pair<Night>[] {
  const rows = db()
    .prepare("SELECT * FROM nights WHERE date BETWEEN ? AND ?")
    .all(from, to) as unknown as Night[];
  return pairByDate(rows);
}

const per24h = (value: number | null, hours: number | null) =>
  value != null && hours ? (value * 24) / hours : null;

export function dayPairs(from: string, to: string): Pair<Day>[] {
  const rows = db()
    .prepare("SELECT * FROM days WHERE date BETWEEN ? AND ?")
    .all(from, to) as unknown as Day[];
  return pairByDate(
    rows.map((r) => ({ ...r, kcal_24h: per24h(r.kcal_total, r.hours), steps_24h: per24h(r.steps, r.hours) })),
  );
}

export type WeekSum = {
  week: string;
  days: number;
  whoopHours: number;
  garminHours: number;
  whoopKcal24h: number;
  garminKcal24h: number;
  whoopSteps24h: number | null;
  garminSteps24h: number | null;
};

/** Monday of the ISO week, as YYYY-MM-DD. */
function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Weekly totals over days where both sides are complete. Consecutive cycles tile the timeline, so
 * over a week the shifted day boundaries mostly cancel; dividing by total hours removes the rest.
 */
export function weekSums(pairs: Pair<Day>[]): WeekSum[] {
  const weeks = new Map<string, Pair<Day>[]>();
  for (const p of pairs) {
    if (!p.whoop?.hours || !p.garmin?.hours || p.whoop.kcal_total == null || p.garmin.kcal_total == null) continue;
    const key = weekStart(p.date);
    weeks.set(key, [...(weeks.get(key) ?? []), p]);
  }
  const sum = (ps: Pair<Day>[], f: (p: Pair<Day>) => number | null | undefined) =>
    ps.reduce((a, p) => a + (f(p) ?? 0), 0);
  const stepsPer24h = (ps: Pair<Day>[], side: "whoop" | "garmin") => {
    const withSteps = ps.filter((p) => p[side]!.steps != null);
    const hours = sum(withSteps, (p) => p[side]!.hours);
    return hours ? (sum(withSteps, (p) => p[side]!.steps) * 24) / hours : null;
  };

  return [...weeks.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([week, ps]) => {
      const whoopHours = sum(ps, (p) => p.whoop!.hours);
      const garminHours = sum(ps, (p) => p.garmin!.hours);
      return {
        week,
        days: ps.length,
        whoopHours,
        garminHours,
        whoopKcal24h: (sum(ps, (p) => p.whoop!.kcal_total) * 24) / whoopHours,
        garminKcal24h: (sum(ps, (p) => p.garmin!.kcal_total) * 24) / garminHours,
        whoopSteps24h: stepsPer24h(ps, "whoop"),
        garminSteps24h: stepsPer24h(ps, "garmin"),
      };
    });
}

export type WorkoutMatch = { whoop?: Workout; garmin?: Workout; overlap: number };

/**
 * Match workouts by time overlap: a pair counts when the overlap covers at least half of the shorter one.
 * Greedy by largest overlap; unmatched workouts are returned on their own.
 */
export function workoutMatches(from: string, to: string): WorkoutMatch[] {
  const rows = db()
    .prepare("SELECT * FROM workouts WHERE substr(start, 1, 10) BETWEEN ? AND ?")
    .all(from, to) as unknown as Workout[];
  const whoop = rows.filter((r) => r.source === "whoop");
  const garmin = rows.filter((r) => r.source === "garmin");
  const ms = (iso: string) => new Date(iso).getTime();

  const candidates: { w: Workout; g: Workout; overlap: number }[] = [];
  for (const w of whoop) {
    for (const g of garmin) {
      const overlap = Math.min(ms(w.end), ms(g.end)) - Math.max(ms(w.start), ms(g.start));
      const shorter = Math.min(ms(w.end) - ms(w.start), ms(g.end) - ms(g.start));
      if (overlap > 0 && shorter > 0 && overlap / shorter >= 0.5) {
        candidates.push({ w, g, overlap: overlap / shorter });
      }
    }
  }
  candidates.sort((a, b) => b.overlap - a.overlap);

  const used = new Set<string>();
  const matches: WorkoutMatch[] = [];
  for (const c of candidates) {
    if (used.has(c.w.id) || used.has(c.g.id)) continue;
    used.add(c.w.id).add(c.g.id);
    matches.push({ whoop: c.w, garmin: c.g, overlap: c.overlap });
  }
  for (const r of rows) if (!used.has(r.id)) matches.push({ [r.source]: r, overlap: 0 });

  const startOf = (m: WorkoutMatch) => (m.whoop ?? m.garmin)!.start;
  return matches.sort((a, b) => startOf(b).localeCompare(startOf(a)));
}

export type Stats = { n: number; meanDiff: number; mae: number; r: number | null };

/** Agreement stats for paired values (diff = WHOOP − Garmin). */
export function agreement(pairs: [number, number][]): Stats | null {
  const n = pairs.length;
  if (n === 0) return null;
  const diffs = pairs.map(([w, g]) => w - g);
  const meanDiff = diffs.reduce((a, b) => a + b, 0) / n;
  const mae = diffs.reduce((a, b) => a + Math.abs(b), 0) / n;
  if (n < 3) return { n, meanDiff, mae, r: null };
  const mw = pairs.reduce((a, [w]) => a + w, 0) / n;
  const mg = pairs.reduce((a, [, g]) => a + g, 0) / n;
  let cov = 0;
  let vw = 0;
  let vg = 0;
  for (const [w, g] of pairs) {
    cov += (w - mw) * (g - mg);
    vw += (w - mw) ** 2;
    vg += (g - mg) ** 2;
  }
  const r = vw && vg ? cov / Math.sqrt(vw * vg) : null;
  return { n, meanDiff, mae, r };
}

export function pairedValues<T>(pairs: Pair<T>[], key: keyof T): [number, number][] {
  const out: [number, number][] = [];
  for (const p of pairs) {
    const w = p.whoop?.[key];
    const g = p.garmin?.[key];
    if (typeof w === "number" && typeof g === "number") out.push([w, g]);
  }
  return out;
}

export function lastPull(): string | null {
  const row = db().prepare("SELECT max(fetched_at) AS t FROM raw").get() as { t: string | null };
  return row.t;
}
