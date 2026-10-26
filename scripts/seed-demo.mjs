// Writes six weeks of synthetic WHOOP + Garmin raw data into data/demo.db.
// The records mirror the real API shapes, so the app normalizes them exactly like pulled data.
// Usage: npm run demo (seeds, then starts the app in demo mode).
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DAYS = 42;
const OFFSET = "+01:00";
const OFFSET_MS = 3600_000;

const dataDir = path.join(process.cwd(), "data");
const file = path.join(dataDir, "demo.db");
mkdirSync(dataDir, { recursive: true });
for (const suffix of ["", "-shm", "-wal"]) rmSync(file + suffix, { force: true });

const db = new DatabaseSync(file);
db.exec(`
CREATE TABLE raw (provider TEXT, kind TEXT, key TEXT, data TEXT, fetched_at TEXT, PRIMARY KEY (provider, kind, key));
CREATE TABLE tokens (provider TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE positions (kind TEXT, ref TEXT, device TEXT, position TEXT, PRIMARY KEY (kind, ref, device));
`);
const insertRaw = db.prepare("INSERT OR REPLACE INTO raw VALUES (?, ?, ?, ?, ?)");
const insertPos = db.prepare("INSERT OR REPLACE INTO positions VALUES (?, ?, ?, ?)");
const now = new Date().toISOString();
const raw = (provider, kind, key, data) => insertRaw.run(provider, kind, String(key), JSON.stringify(data), now);

// Deterministic noise so screenshots stay stable between runs.
let seed = 20261026;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const noise = (sd) => (rand() + rand() + rand() - 1.5) * sd * 1.4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

/** Local wall-clock time on a given day -> UTC Date. */
const local = (day, hours) => new Date(Date.parse(`${day}T00:00:00Z`) + hours * 3600_000 - OFFSET_MS);
const dayStr = (d) => d.toISOString().slice(0, 10);
const addDays = (day, n) => dayStr(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));
const gmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const localToday = new Date(Date.now() + OFFSET_MS).toISOString().slice(0, 10);

// WHOOP is worn on the bicep for the first half, on the wrist for the second (shows the position split).
const whoopPosition = (i) => (i < DAYS / 2 ? "bicep" : "wrist");

const nights = [];
let garminActivityId = 30_000_000_000;
let cycleId = 900_000;

for (let i = 0; i < DAYS; i++) {
  const day = addDays(localToday, i - DAYS + 1); // wake-up date; last one is today
  const fitness = Math.sin(i / 6) * 4; // slow HRV/recovery trend

  // ---- night ending on `day`
  const onset = clamp(22.7 + noise(0.4), 21.8, 23.9);
  const asleepH = clamp(7.4 + noise(0.5), 6.2, 8.8);
  const gStart = local(addDays(day, -1), onset);
  const gEnd = new Date(gStart.getTime() + (asleepH + 0.2) * 3600_000);
  const gTotal = asleepH * 3600;
  const gDeep = gTotal * clamp(0.15 + noise(0.03), 0.08, 0.24);
  const gRem = gTotal * clamp(0.22 + noise(0.04), 0.12, 0.3);
  const gAwake = clamp(600 + noise(400), 0, 2400);
  const hrvG = round(52 + fitness + noise(6));
  const rhrG = round(50 - fitness / 3 + noise(1.5));
  const bodyBattery = round(clamp(62 + (hrvG - 50) * 2 + noise(9), 20, 100));

  raw("garmin", "sleep", day, {
    calendarDate: day,
    sleepStartTimestampGMT: gStart.getTime(),
    sleepEndTimestampGMT: gEnd.getTime(),
    sleepTimeSeconds: round(gTotal),
    deepSleepSeconds: round(gDeep),
    remSleepSeconds: round(gRem),
    lightSleepSeconds: round(gTotal - gDeep - gRem),
    awakeSleepSeconds: round(gAwake),
    averageSpO2Value: round(clamp(97 + noise(0.6), 94, 99)),
    averageRespirationValue: round(13 + noise(0.5)),
    avgHeartRate: rhrG + 2,
    sleepScores: { overall: { value: round(clamp(80 + noise(7), 50, 98)) } },
  });
  raw("garmin", "hrv", day, { calendarDate: day, lastNightAvg: hrvG, status: hrvG >= 48 ? "BALANCED" : "UNBALANCED" });

  const wStart = new Date(gStart.getTime() + noise(6) * 60_000);
  const wEnd = new Date(gEnd.getTime() + noise(8) * 60_000);
  const wTotal = gTotal + (7 + noise(25)) * 60;
  const wDeep = gDeep + (30 + noise(18)) * 60;
  const wRem = gRem + (9 + noise(22)) * 60;
  const sleepId = randomUUID();
  raw("whoop", "sleep", sleepId, {
    id: sleepId,
    start: wStart.toISOString(),
    end: wEnd.toISOString(),
    timezone_offset: OFFSET,
    nap: false,
    score_state: "SCORED",
    score: {
      stage_summary: {
        total_in_bed_time_milli: (wEnd - wStart),
        total_awake_time_milli: round((gAwake + (23 + noise(12)) * 60) * 1000),
        total_slow_wave_sleep_time_milli: round(wDeep * 1000),
        total_rem_sleep_time_milli: round(wRem * 1000),
        total_light_sleep_time_milli: round((wTotal - wDeep - wRem) * 1000),
      },
      respiratory_rate: round(13.9 + noise(0.3), 2),
      sleep_performance_percentage: round(clamp(85 + noise(8), 50, 100)),
    },
  });
  nights.push({ day, sleepId, wStart, hrvG, rhrG, bodyBattery });

  insertPos.run("night", day, "whoop", whoopPosition(i));
  insertPos.run("night", day, "garmin", "wrist");
}

// ---- cycles (sleep onset to sleep onset) and calendar days; today stays open/partial
for (let i = 0; i < DAYS; i++) {
  const n = nights[i];
  const next = nights[i + 1];
  const id = cycleId++;
  const hours = next ? (next.wStart - n.wStart) / 3600_000 : null;
  const gTotal = round(2650 + noise(260));
  const gSteps = round(clamp(8500 + noise(3000), 2500, 20000));
  const recovery = round(clamp(n.bodyBattery - 18 + noise(10), 5, 99));

  raw("whoop", "recovery", id, {
    cycle_id: id,
    sleep_id: n.sleepId,
    score_state: "SCORED",
    score: {
      recovery_score: recovery,
      resting_heart_rate: n.rhrG + round(6 + noise(1.5)),
      hrv_rmssd_milli: clamp(n.hrvG - 4 + noise(3.5), 20, 120),
      spo2_percentage: round(97 + noise(0.7), 2),
    },
  });

  if (n.day < localToday) {
    raw("garmin", "daily", n.day, {
      calendarDate: n.day,
      wellnessChronology: { totalDurationInMillis: 86_400_000 },
      movement: { steps: { value: gSteps } },
      calories: { burnedResting: 1950, burnedActive: gTotal - 1950, burnedTotal: gTotal },
      heartRate: { minValue: n.rhrG - 6, maxValue: round(125 + noise(15)), restingValue: n.rhrG },
      stress: { avgLevel: round(clamp(26 + noise(6), 10, 60)) },
      bodyBattery: { maxValue: n.bodyBattery, minValue: round(n.bodyBattery / 3) },
    });
  }

  const share = hours ? hours / 24 : 0.5;
  const kcal = gTotal * (0.8 + noise(0.03)) * share;
  raw("whoop", "cycle", id, {
    id,
    start: n.wStart.toISOString(),
    end: next ? next.wStart.toISOString() : undefined,
    timezone_offset: OFFSET,
    step_count: round(gSteps * (1.12 + noise(0.06)) * share),
    score_state: "SCORED",
    score: {
      strain: round(clamp(10 + noise(3), 3, 19), 1),
      kilojoule: round(kcal * 4.184),
      average_heart_rate: n.rhrG + 18,
      max_heart_rate: round(130 + noise(15)),
    },
  });
}

// ---- workouts: weekly pattern; chest strap on runs/rides, optical on strength and walks
const PLAN = {
  2: { sport: "running", whoop: "running", hour: 17.5, minutes: [40, 60], avg: 148, max: 172, kmh: 11.2, strap: true },
  4: { sport: "running", whoop: "running", hour: 17.5, minutes: [30, 45], avg: 158, max: 178, kmh: 12, strap: true },
  3: { sport: "strength_training", whoop: "weightlifting", hour: 18, minutes: [40, 55], avg: 100, max: 135, strap: false },
  6: { sport: "road_biking", whoop: "cycling", hour: 9.5, minutes: [100, 180], avg: 136, max: 165, kmh: 27, strap: true },
  0: { sport: "virtual_ride", whoop: "cycling", hour: 10, minutes: [60, 80], avg: 140, max: 156, kmh: 30, strap: true, zwift: true },
};

for (let i = 0; i < DAYS - 1; i++) {
  const day = nights[i].day;
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  const p = PLAN[weekday];
  const pos = whoopPosition(i);

  if (p) {
    const minutes = p.minutes[0] + rand() * (p.minutes[1] - p.minutes[0]);
    const start = local(day, p.hour + noise(0.3));
    const end = new Date(start.getTime() + minutes * 60_000);
    const gAvg = round(p.avg + noise(5));
    const gMax = round(p.max + noise(4));
    const gKcal = round(minutes * (p.strap ? 11 : 5.2));
    const distance = p.kmh ? round((p.kmh * minutes * 1000) / 60) : undefined;
    const elevation = p.kmh ? round(clamp(minutes * 2 + noise(60), 20, 900)) : undefined;

    // WHOOP vs. chest strap: close on the bicep and indoors, larger dropouts on the wrist outdoors.
    let avgErr = p.zwift ? noise(1) : pos === "bicep" ? -1 + noise(1.5) : -6 + noise(4);
    if (p.sport === "road_biking") avgErr -= pos === "bicep" ? 2 : 6;
    const cadenceLock = p.sport === "running" && pos === "wrist" && rand() < 0.35;
    const wMax = gMax + (cadenceLock ? round(12 + noise(3)) : round(noise(1.5)));
    const wKcal = p.strap ? gKcal * (0.97 + noise(0.03)) : gKcal * 0.45;

    const activityId = garminActivityId++;
    raw("garmin", "activity", activityId, {
      activityId,
      activityName: p.zwift ? "Zwift - Watopia" : p.sport,
      manufacturer: p.zwift ? "ZWIFT" : "GARMIN",
      startTimeGMT: gmt(start),
      duration: minutes * 60,
      elapsedDuration: minutes * 60,
      distance,
      elevationGain: elevation,
      averageHR: gAvg,
      maxHR: gMax,
      calories: gKcal,
      activityType: { typeKey: p.sport },
    });
    raw("garmin", "activity_detail", activityId, {
      activityId,
      metadataDTO: {
        manufacturer: p.zwift ? "ZWIFT" : "GARMIN",
        sensors: p.strap && !p.zwift ? [{ antplusDeviceType: "HEART_RATE", sourceType: "ANTPLUS" }] : [],
      },
    });

    const workoutId = randomUUID();
    raw("whoop", "workout", workoutId, {
      id: workoutId,
      start: start.toISOString(),
      end: end.toISOString(),
      sport_name: p.whoop,
      score_state: "SCORED",
      score: {
        strain: round(clamp(8 + minutes / 15 + noise(1.5), 4, 20), 1),
        average_heart_rate: round(gAvg + avgErr),
        max_heart_rate: wMax,
        kilojoule: round(wKcal * 4.184),
        distance_meter: distance,
        altitude_gain_meter: elevation != null ? elevation + noise(8) : undefined,
      },
    });
    insertPos.run("workout", workoutId, "whoop", pos);
    insertPos.run("workout", String(activityId), "garmin", "wrist");
  }

  // Walks WHOOP detects on its own, without a Garmin counterpart.
  if (rand() < 0.3) {
    const start = local(day, 13 + noise(1.5));
    const minutes = 25 + rand() * 20;
    const id = randomUUID();
    raw("whoop", "workout", id, {
      id,
      start: start.toISOString(),
      end: new Date(start.getTime() + minutes * 60_000).toISOString(),
      sport_name: "walking",
      score_state: "SCORED",
      score: { strain: round(4 + rand() * 3, 1), average_heart_rate: round(92 + noise(6)), max_heart_rate: round(112 + noise(6)), kilojoule: round(minutes * 4.5 * 4.184) },
    });
  }
}

db.prepare("INSERT OR REPLACE INTO tokens VALUES (?, ?)").run(
  "whoop",
  JSON.stringify({ accessToken: "demo", expiresAt: Date.now() + 365 * 86_400_000 }),
);
db.close();
console.log(`Demo-Daten geschrieben: ${path.relative(process.cwd(), file)} (${DAYS} Tage bis ${localToday})`);
