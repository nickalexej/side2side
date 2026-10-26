/** "2026-10-22" -> Date at UTC midnight. */
export function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDay(d);
}

/** Split an inclusive day range into chunks of at most `size` days. */
export function chunkDays(from: string, to: string, size: number): [string, string][] {
  const chunks: [string, string][] = [];
  for (let start = from; start <= to; start = addDays(start, size)) {
    const end = addDays(start, size - 1);
    chunks.push([start, end < to ? end : to]);
  }
  return chunks;
}

/** Local calendar date of an ISO timestamp, given an offset like "+01:00". */
export function localDay(iso: string, offset: string): string {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [h, m] = offset.replace(/^[+-]/, "").split(":").map(Number);
  const ms = new Date(iso).getTime() + sign * (h * 60 + (m || 0)) * 60_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Display and "today" time zone; set TIMEZONE in .env (IANA name). */
export const TIME_ZONE = process.env.TIMEZONE || "Europe/Berlin";

export function today(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TIME_ZONE });
}
