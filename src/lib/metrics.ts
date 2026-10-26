import type { Day, Night } from "@/lib/compare";

export type Kind = "direct" | "method" | "proprietary";

export type Metric<T> = {
  key: keyof T & string;
  label: string;
  unit: "duration" | "bpm" | "ms" | "%" | "/min" | "kcal" | "steps" | "score" | "hours";
  kind: Kind;
  /** What each provider actually reports, when the labels differ. */
  note?: string;
};

export const KIND_LABEL: Record<Kind, string> = {
  direct: "direkt vergleichbar",
  method: "gleiche Einheit, andere Methode",
  proprietary: "proprietär – nur Trend",
};

export const NIGHT_METRICS: Metric<Night>[] = [
  { key: "total_sleep_s", label: "Schlafdauer", unit: "duration", kind: "direct" },
  { key: "deep_s", label: "Tiefschlaf", unit: "duration", kind: "direct" },
  { key: "rem_s", label: "REM", unit: "duration", kind: "direct" },
  { key: "light_s", label: "Leichtschlaf", unit: "duration", kind: "direct" },
  { key: "awake_s", label: "Wach", unit: "duration", kind: "direct" },
  {
    key: "hrv",
    label: "HRV (RMSSD)",
    unit: "ms",
    kind: "method",
    note: "WHOOP: letzte Tiefschlafphase · Garmin: Nacht-Ø",
  },
  { key: "rhr", label: "Ruhepuls", unit: "bpm", kind: "method", note: "WHOOP: im Schlaf · Garmin: Tageswert" },
  { key: "resp_rate", label: "Atemfrequenz", unit: "/min", kind: "direct" },
  { key: "spo2", label: "SpO2", unit: "%", kind: "direct" },
  {
    key: "sleep_score",
    label: "Schlaf-Score",
    unit: "score",
    kind: "proprietary",
    note: "WHOOP: Sleep Performance · Garmin: Sleep Score",
  },
  {
    key: "readiness",
    label: "Erholung",
    unit: "score",
    kind: "proprietary",
    note: "WHOOP: Recovery % · Garmin: Body Battery max",
  },
];

export const DAY_METRICS: Metric<Day>[] = [
  {
    key: "kcal_24h",
    label: "Kalorien je 24 h",
    unit: "kcal",
    kind: "direct",
    note: "Auf 24 h hochgerechnet – gleicht unterschiedliche Cycle-Längen aus",
  },
  {
    key: "kcal_total",
    label: "Kalorien roh",
    unit: "kcal",
    kind: "method",
    note: "WHOOP: ganzer Cycle (22–27 h) · Garmin: Kalendertag",
  },
  { key: "rhr", label: "Ruhepuls", unit: "bpm", kind: "method" },
  { key: "max_hr", label: "Max. Puls", unit: "bpm", kind: "direct" },
  { key: "load", label: "Belastung", unit: "score", kind: "proprietary", note: "WHOOP: Strain · Garmin: Ø Stress" },
  { key: "steps_24h", label: "Schritte je 24 h", unit: "steps", kind: "direct", note: "Auf 24 h hochgerechnet" },
  { key: "hours", label: "Länge Cycle/Tag", unit: "hours", kind: "method", note: "Offener Cycle/heutiger Tag: –" },
];

export function fmt(value: number | null | undefined, unit: Metric<unknown>["unit"]): string {
  if (value == null) return "–";
  switch (unit) {
    case "duration": {
      const sign = value < 0 ? "−" : "";
      const min = Math.round(Math.abs(value) / 60);
      return `${sign}${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} h`;
    }
    case "bpm":
      return `${Math.round(value)} bpm`;
    case "ms":
      return `${Math.round(value)} ms`;
    case "%":
      return `${value.toFixed(1)} %`;
    case "/min":
      return `${value.toFixed(1)} /min`;
    case "kcal":
      return `${Math.round(value).toLocaleString("de-DE")} kcal`;
    case "steps":
      return Math.round(value).toLocaleString("de-DE");
    case "score":
      return value.toFixed(value % 1 ? 1 : 0);
    case "hours":
      return `${value.toFixed(1)} h`;
  }
}

/** Signed difference WHOOP − Garmin, formatted in the metric's unit. */
export function fmtDiff(w: number | null | undefined, g: number | null | undefined, unit: Metric<unknown>["unit"]) {
  if (w == null || g == null) return { text: "", pct: null as number | null };
  const d = w - g;
  const text = (d > 0 ? "+" : "") + fmt(d, unit);
  return { text, pct: g !== 0 ? (d / g) * 100 : null };
}
