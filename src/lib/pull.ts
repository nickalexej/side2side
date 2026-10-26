import "server-only";
import { addDays } from "@/lib/dates";
import { hasRaw, saveRaw, type Source } from "@/lib/db";
import { env } from "@/lib/env";
import * as garmin from "@/lib/garmin/client";
import { rebuild } from "@/lib/normalize";
import * as whoop from "@/lib/whoop/client";

export type PullResult = { source: Source; ok: boolean; counts?: Record<string, number>; error?: string };

async function pullWhoop(from: string, to: string): Promise<Record<string, number>> {
  // WHOOP filters by timestamps; widen by a day so the night before `from` and the full `to` day are included.
  const start = `${addDays(from, -1)}T12:00:00.000Z`;
  const end = `${addDays(to, 1)}T12:00:00.000Z`;
  const [cycles, recoveries, sleeps, workouts] = [
    await whoop.fetchCycles(start, end),
    await whoop.fetchRecoveries(start, end),
    await whoop.fetchSleeps(start, end),
    await whoop.fetchWorkouts(start, end),
  ];
  cycles.forEach((c) => saveRaw("whoop", "cycle", String(c.id), c));
  recoveries.forEach((r) => saveRaw("whoop", "recovery", String(r.cycle_id), r));
  sleeps.forEach((s) => saveRaw("whoop", "sleep", s.id, s));
  workouts.forEach((w) => saveRaw("whoop", "workout", w.id, w));
  return { cycles: cycles.length, recoveries: recoveries.length, sleeps: sleeps.length, workouts: workouts.length };
}

async function pullGarmin(from: string, to: string): Promise<Record<string, number>> {
  const dailies = await garmin.fetchDailies(from, to);
  const sleeps = await garmin.fetchSleeps(from, to);
  const hrv = await garmin.fetchHrv(from, to);
  const activities = await garmin.fetchActivities(from, to);
  // Days without recorded data come back with calendarDate = null; skip them.
  dailies.filter((d) => d.calendarDate).forEach((d) => saveRaw("garmin", "daily", d.calendarDate, d));
  sleeps.filter((s) => s.calendarDate).forEach((s) => saveRaw("garmin", "sleep", s.calendarDate, s));
  hrv.filter((h) => h.calendarDate).forEach((h) => saveRaw("garmin", "hrv", h.calendarDate, h));
  activities.forEach((a) => saveRaw("garmin", "activity", String(a.activityId), a));
  // Sensor details never change after upload, so each activity is fetched only once.
  let details = 0;
  for (const a of activities) {
    if (hasRaw("garmin", "activity_detail", String(a.activityId))) continue;
    const detail = await garmin.fetchActivityDetail(a.activityId);
    if (detail) {
      saveRaw("garmin", "activity_detail", String(a.activityId), detail);
      details++;
    }
  }
  return { dailies: dailies.length, sleeps: sleeps.length, hrv: hrv.length, activities: activities.length, details };
}

/** Pull both providers independently, so one failing does not block the other. */
export async function pullAll(from: string, to: string): Promise<PullResult[]> {
  if (env.demo()) {
    rebuild();
    return [
      { source: "whoop", ok: true, counts: { demo: 1 } },
      { source: "garmin", ok: true, counts: { demo: 1 } },
    ];
  }
  const results: PullResult[] = [];
  for (const [source, fn] of [
    ["whoop", pullWhoop],
    ["garmin", pullGarmin],
  ] as const) {
    try {
      results.push({ source, ok: true, counts: await fn(from, to) });
    } catch (e) {
      results.push({ source, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  rebuild();
  return results;
}
