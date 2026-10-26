import "server-only";
import { getToken, setToken } from "@/lib/db";
import { env } from "@/lib/env";

const API = "https://api.prod.whoop.com/developer";
const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const SCOPES = "offline read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement";

type StoredToken = { accessToken: string; refreshToken?: string; expiresAt: number };

export function authorizeUrl(state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.whoopClientId());
  url.searchParams.set("redirect_uri", env.whoopRedirectUri());
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

async function requestToken(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.whoopClientId(),
      client_secret: env.whoopClientSecret(),
      ...params,
    }),
  });
  if (!res.ok) throw new Error(`WHOOP Token-Anfrage fehlgeschlagen: HTTP ${res.status} ${await res.text()}`);
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const previous = getToken<StoredToken>("whoop");
  setToken("whoop", {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? previous?.refreshToken,
    expiresAt: Date.now() + t.expires_in * 1000,
  });
}

export function exchangeCode(code: string) {
  return requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.whoopRedirectUri(),
  });
}

export function isConnected(): boolean {
  return getToken<StoredToken>("whoop") !== null;
}

async function accessToken(): Promise<string> {
  const t = getToken<StoredToken>("whoop");
  if (!t) throw new Error("WHOOP nicht verbunden – erst „Mit WHOOP verbinden“ klicken.");
  if (t.expiresAt - 60_000 > Date.now()) return t.accessToken;
  if (!t.refreshToken) throw new Error("WHOOP-Token abgelaufen – bitte neu verbinden.");
  await requestToken({ grant_type: "refresh_token", refresh_token: t.refreshToken, scope: "offline" });
  return getToken<StoredToken>("whoop")!.accessToken;
}

// WHOOP allows 100 requests/minute (10,000/day) – keep at least 650 ms between calls.
const MIN_INTERVAL_MS = 650;
let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function get<T>(path: string, query: Record<string, string>, attempt = 0): Promise<T> {
  await throttle();
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (res.status === 429 && attempt < 5) {
    const wait = Number(res.headers.get("retry-after") ?? 2 ** attempt) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return get(path, query, attempt + 1);
  }
  if (!res.ok) throw new Error(`WHOOP ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Pull every record of a paginated v2 collection between two ISO timestamps. */
async function collect<T>(path: string, start: string, end: string): Promise<T[]> {
  const out: T[] = [];
  let nextToken: string | undefined;
  do {
    const page = await get<{ records: T[]; next_token?: string | null }>(path, {
      start,
      end,
      limit: "25",
      ...(nextToken ? { nextToken } : {}),
    });
    out.push(...page.records);
    nextToken = page.next_token ?? undefined;
  } while (nextToken);
  return out;
}

type Scored<S> = { score_state: string; score?: S };

export type WhoopCycle = Scored<{
  strain: number;
  kilojoule: number;
  average_heart_rate: number;
  max_heart_rate: number;
}> & { id: number; start: string; end?: string; timezone_offset: string; step_count?: number };

export type WhoopRecovery = Scored<{
  recovery_score: number;
  resting_heart_rate: number;
  hrv_rmssd_milli: number;
  spo2_percentage?: number;
  skin_temp_celsius?: number;
}> & { cycle_id: number; sleep_id: string };

export type WhoopSleep = Scored<{
  stage_summary: {
    total_in_bed_time_milli: number;
    total_awake_time_milli: number;
    total_light_sleep_time_milli: number;
    total_slow_wave_sleep_time_milli: number;
    total_rem_sleep_time_milli: number;
  };
  respiratory_rate?: number;
  sleep_performance_percentage?: number;
}> & { id: string; start: string; end: string; timezone_offset: string; nap: boolean };

export type WhoopWorkout = Scored<{
  strain: number;
  average_heart_rate: number;
  max_heart_rate: number;
  kilojoule: number;
  distance_meter?: number;
  altitude_gain_meter?: number;
  zone_durations?: Record<string, number>;
}> & { id: string; start: string; end: string; sport_name?: string };

export const fetchCycles = (s: string, e: string) => collect<WhoopCycle>("/v2/cycle", s, e);
export const fetchRecoveries = (s: string, e: string) => collect<WhoopRecovery>("/v2/recovery", s, e);
export const fetchSleeps = (s: string, e: string) => collect<WhoopSleep>("/v2/activity/sleep", s, e);
export const fetchWorkouts = (s: string, e: string) => collect<WhoopWorkout>("/v2/activity/workout", s, e);
