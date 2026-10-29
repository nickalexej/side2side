import "server-only";
import { getToken, setToken } from "@/lib/db";
import { chunkDays } from "@/lib/dates";
import { env } from "@/lib/env";

const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_URL = `${BASE}/personalapitoken-service/personal-api/personal-api-key/token`;

type StoredToken = { accessToken: string; expiresAt: number };

/** Exchange the personal API key for a JWT (valid 24h) and cache it until shortly before expiry. */
async function accessToken(): Promise<string> {
  const cached = getToken<StoredToken>("garmin");
  if (cached && cached.expiresAt - 5 * 60_000 > Date.now()) return cached.accessToken;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `ApiKey ${env.garminApiKey()}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Garmin-API-Key abgelaufen oder ungültig – in Garmin Connect neu erzeugen und in .env eintragen " +
        "(GARMIN_API_KEY, GARMIN_API_KEY_EXPIRES).",
    );
  }
  if (!res.ok) throw new Error(`Garmin Token-Tausch fehlgeschlagen: HTTP ${res.status}`);
  const jwt = (await res.text()).trim();
  const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()) as {
    exp: number;
  };
  setToken("garmin", { accessToken: jwt, expiresAt: payload.exp * 1000 });
  return jwt;
}

// Garmin's gateways occasionally time out (502/503/504); these are transient, so retry with backoff.
const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 3;

async function get<T>(path: string, query: Record<string, string | number> = {}, attempt = 0): Promise<T | null> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (RETRY_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
    await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    return get(path, query, attempt + 1);
  }
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Garmin ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export type GarminDaily = {
  calendarDate: string;
  wellnessChronology?: { totalDurationInMillis?: number };
  movement?: { steps?: { value?: number } };
  calories?: { burnedResting?: number; burnedActive?: number; burnedTotal?: number };
  heartRate?: { minValue?: number; maxValue?: number; restingValue?: number };
  stress?: { avgLevel?: number };
  bodyBattery?: { minValue?: number; maxValue?: number; chargedValue?: number; drainedValue?: number };
};

export type GarminSleep = {
  calendarDate: string;
  sleepStartTimestampGMT?: number;
  sleepEndTimestampGMT?: number;
  sleepTimeSeconds?: number;
  deepSleepSeconds?: number;
  lightSleepSeconds?: number;
  remSleepSeconds?: number;
  awakeSleepSeconds?: number;
  averageSpO2Value?: number;
  averageRespirationValue?: number;
  avgHeartRate?: number;
  sleepScores?: { overall?: { value?: number } };
};

export type GarminHrv = { calendarDate: string; lastNightAvg?: number; status?: string };

export type GarminActivity = {
  activityId: number;
  activityName?: string;
  manufacturer?: string;
  startTimeGMT: string;
  duration?: number;
  elapsedDuration?: number;
  distance?: number;
  elevationGain?: number;
  averageHR?: number;
  maxHR?: number;
  calories?: number;
  activityTrainingLoad?: number;
  activityType?: { typeKey?: string };
  hrTimeInZone_1?: number;
  hrTimeInZone_2?: number;
  hrTimeInZone_3?: number;
  hrTimeInZone_4?: number;
  hrTimeInZone_5?: number;
};

export type GarminActivityDetail = {
  activityId: number;
  metadataDTO?: {
    manufacturer?: string;
    sensors?: { antplusDeviceType?: string; sourceType?: string; sku?: string }[];
  };
};

/** Activity detail; only needed for the paired sensors (chest strap or not). */
export async function fetchActivityDetail(activityId: number): Promise<GarminActivityDetail | null> {
  return get<GarminActivityDetail>(`/activity-service/activity/${activityId}`);
}

/** Days until the personal API key expires, or null when no expiry is configured. */
export function apiKeyDaysLeft(): number | null {
  const expires = env.garminApiKeyExpires();
  if (!expires) return null;
  return Math.ceil((new Date(`${expires}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
}

// Range limits as documented in the Personal API Swagger:
// https://developer.garmin.com/gc-developer-program/personal/swagger-docs/
export async function fetchDailies(from: string, to: string): Promise<GarminDaily[]> {
  const out: GarminDaily[] = [];
  for (const [s, e] of chunkDays(from, to, 365)) {
    const res = await get<{ data: GarminDaily[] }>("/usersummary-service/v2/dailysummaries", {
      startDate: s,
      endDate: e,
    });
    out.push(...(res?.data ?? []));
  }
  return out;
}

export async function fetchSleeps(from: string, to: string): Promise<GarminSleep[]> {
  const out: GarminSleep[] = [];
  for (const [s, e] of chunkDays(from, to, 31)) {
    const res = await get<GarminSleep[]>("/sleep-service/sleep/dailySleepSummariesByDate", {
      startDate: s,
      endDate: e,
    });
    out.push(...(res ?? []));
  }
  return out;
}

export async function fetchHrv(from: string, to: string): Promise<GarminHrv[]> {
  const out: GarminHrv[] = [];
  for (const [s, e] of chunkDays(from, to, 31)) {
    const res = await get<{ hrvSummaries?: GarminHrv[] }>(`/hrv-service/hrv/daily/${s}/${e}`);
    out.push(...(res?.hrvSummaries ?? []));
  }
  return out;
}

export async function fetchActivities(from: string, to: string): Promise<GarminActivity[]> {
  const out: GarminActivity[] = [];
  const limit = 100;
  for (let start = 0; ; start += limit) {
    const page = await get<GarminActivity[]>("/activitylist-service/activities/search/activities", {
      startDate: from,
      endDate: to,
      start,
      limit,
    });
    out.push(...(page ?? []));
    if (!page || page.length < limit) return out;
  }
}
