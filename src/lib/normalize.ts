import "server-only";
import { localDay, today } from "@/lib/dates";
import { db, readRaw, upsert } from "@/lib/db";
import { env } from "@/lib/env";
import type { HrSource } from "@/lib/compare";
import type {
  GarminActivity,
  GarminActivityDetail,
  GarminDaily,
  GarminHrv,
  GarminSleep,
} from "@/lib/garmin/client";
import type { WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout } from "@/lib/whoop/client";

const KJ_PER_KCAL = 4.184;
const s = (ms?: number) => (ms == null ? null : ms / 1000);

/**
 * Nights are keyed by the local date of waking up (Garmin's sleep `calendarDate` uses the same rule).
 * WHOOP cycles run sleep-onset to sleep-onset; they are assigned to the day that starts after that sleep.
 */
function rebuildWhoop() {
  const sleeps = readRaw<WhoopSleep>("whoop", "sleep").filter((x) => !x.nap);
  const recoveryBySleep = new Map(readRaw<WhoopRecovery>("whoop", "recovery").map((r) => [r.sleep_id, r]));

  for (const sl of sleeps) {
    const st = sl.score?.stage_summary;
    const rec = recoveryBySleep.get(sl.id)?.score;
    const asleep = st
      ? st.total_light_sleep_time_milli + st.total_slow_wave_sleep_time_milli + st.total_rem_sleep_time_milli
      : undefined;
    upsert("nights", {
      source: "whoop",
      date: localDay(sl.end, sl.timezone_offset),
      start: sl.start,
      end: sl.end,
      total_sleep_s: s(asleep),
      deep_s: s(st?.total_slow_wave_sleep_time_milli),
      light_s: s(st?.total_light_sleep_time_milli),
      rem_s: s(st?.total_rem_sleep_time_milli),
      awake_s: s(st?.total_awake_time_milli),
      resp_rate: sl.score?.respiratory_rate,
      spo2: rec?.spo2_percentage,
      hrv: rec?.hrv_rmssd_milli,
      rhr: rec?.resting_heart_rate,
      sleep_score: sl.score?.sleep_performance_percentage,
      readiness: rec?.recovery_score,
      state: sl.score_state,
    });
  }

  const rhrByCycle = new Map(
    readRaw<WhoopRecovery>("whoop", "recovery").map((r) => [r.cycle_id, r.score?.resting_heart_rate]),
  );
  for (const c of readRaw<WhoopCycle>("whoop", "cycle")) {
    // Shift by 6h so a cycle starting late in the evening counts for the following day.
    const shifted = new Date(new Date(c.start).getTime() + 6 * 3600_000).toISOString();
    upsert("days", {
      source: "whoop",
      date: localDay(shifted, c.timezone_offset),
      steps: c.step_count,
      kcal_total: c.score ? c.score.kilojoule / KJ_PER_KCAL : null,
      rhr: rhrByCycle.get(c.id),
      avg_hr: c.score?.average_heart_rate,
      max_hr: c.score?.max_heart_rate,
      load: c.score?.strain,
      // Open (current) cycles have no end yet and stay out of per-24h comparisons.
      hours: c.end ? (new Date(c.end).getTime() - new Date(c.start).getTime()) / 3600_000 : null,
    });
  }

  for (const w of readRaw<WhoopWorkout>("whoop", "workout")) {
    const z = w.score?.zone_durations;
    upsert("workouts", {
      source: "whoop",
      id: w.id,
      start: w.start,
      end: w.end,
      sport: w.sport_name,
      distance_m: w.score?.distance_meter,
      elevation_m: w.score?.altitude_gain_meter,
      avg_hr: w.score?.average_heart_rate,
      max_hr: w.score?.max_heart_rate,
      kcal: w.score ? w.score.kilojoule / KJ_PER_KCAL : null,
      load: w.score?.strain,
      zones_s: z
        ? JSON.stringify(
            ["zone_one_milli", "zone_two_milli", "zone_three_milli", "zone_four_milli", "zone_five_milli"].map(
              (k) => (z[k] ?? 0) / 1000,
            ),
          )
        : null,
    });
  }
}

/**
 * Where Garmin's heart rate came from: a paired ANT+/BLE heart rate sensor (chest strap), the watch's
 * optical sensor, or a third-party upload such as Zwift whose sensors are not reported.
 */
function hrSource(a: GarminActivity, meta?: GarminActivityDetail["metadataDTO"]): HrSource | null {
  const manufacturer = meta?.manufacturer ?? a.manufacturer;
  if (manufacturer && manufacturer !== "GARMIN") {
    // Imports carry no sensor list; GARMIN_STRAP_IMPORTS says which ones used a chest strap.
    return env.garminStrapImports().includes(manufacturer.toUpperCase()) ? "strap" : "import";
  }
  if (!meta) return null;
  return meta.sensors?.some((s) => s.antplusDeviceType === "HEART_RATE") ? "strap" : "wrist";
}

function rebuildGarmin() {
  const dailies = new Map(readRaw<GarminDaily>("garmin", "daily").map((d) => [d.calendarDate, d]));
  const hrv = new Map(readRaw<GarminHrv>("garmin", "hrv").map((h) => [h.calendarDate, h]));

  for (const sl of readRaw<GarminSleep>("garmin", "sleep")) {
    if (!sl.sleepStartTimestampGMT) continue;
    upsert("nights", {
      source: "garmin",
      date: sl.calendarDate,
      start: new Date(sl.sleepStartTimestampGMT).toISOString(),
      end: sl.sleepEndTimestampGMT ? new Date(sl.sleepEndTimestampGMT).toISOString() : null,
      total_sleep_s: sl.sleepTimeSeconds,
      deep_s: sl.deepSleepSeconds,
      light_s: sl.lightSleepSeconds,
      rem_s: sl.remSleepSeconds,
      awake_s: sl.awakeSleepSeconds,
      resp_rate: sl.averageRespirationValue,
      spo2: sl.averageSpO2Value,
      avg_hr: sl.avgHeartRate,
      hrv: hrv.get(sl.calendarDate)?.lastNightAvg,
      rhr: dailies.get(sl.calendarDate)?.heartRate?.restingValue,
      sleep_score: sl.sleepScores?.overall?.value,
      readiness: dailies.get(sl.calendarDate)?.bodyBattery?.maxValue,
      state: hrv.get(sl.calendarDate)?.status,
    });
  }

  for (const d of dailies.values()) {
    upsert("days", {
      source: "garmin",
      date: d.calendarDate,
      steps: d.movement?.steps?.value,
      kcal_total: d.calories?.burnedTotal,
      kcal_active: d.calories?.burnedActive,
      rhr: d.heartRate?.restingValue,
      min_hr: d.heartRate?.minValue,
      max_hr: d.heartRate?.maxValue,
      load: d.stress?.avgLevel,
      // 23 or 25 h on DST changes; today's partial day is excluded like WHOOP's open cycle.
      hours: d.calendarDate < today() ? (d.wellnessChronology?.totalDurationInMillis ?? 86_400_000) / 3600_000 : null,
    });
  }

  const details = new Map(
    readRaw<GarminActivityDetail>("garmin", "activity_detail").map((d) => [String(d.activityId), d.metadataDTO]),
  );

  for (const a of readRaw<GarminActivity>("garmin", "activity")) {
    const start = new Date(a.startTimeGMT.replace(" ", "T") + "Z");
    const seconds = a.elapsedDuration ?? a.duration ?? 0;
    upsert("workouts", {
      source: "garmin",
      id: String(a.activityId),
      start: start.toISOString(),
      end: new Date(start.getTime() + seconds * 1000).toISOString(),
      sport: a.activityType?.typeKey ?? a.activityName,
      distance_m: a.distance,
      elevation_m: a.elevationGain,
      avg_hr: a.averageHR,
      max_hr: a.maxHR,
      kcal: a.calories,
      load: a.activityTrainingLoad,
      zones_s: JSON.stringify([1, 2, 3, 4, 5].map((i) => a[`hrTimeInZone_${i}` as keyof GarminActivity] ?? 0)),
      hr_source: hrSource(a, details.get(String(a.activityId))),
    });
  }
}

export function rebuild() {
  const conn = db();
  conn.exec("BEGIN");
  try {
    conn.exec("DELETE FROM nights; DELETE FROM days; DELETE FROM workouts;");
    rebuildWhoop();
    rebuildGarmin();
    conn.exec("COMMIT");
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}
