import { agreement, pairedValues, type Pair } from "@/lib/compare";
import { fmt, fmtDiff, KIND_LABEL, type Metric } from "@/lib/metrics";

function diffClass(pct: number | null) {
  if (pct == null) return "text-muted";
  const a = Math.abs(pct);
  return a < 5 ? "text-ok" : a < 15 ? "text-warn" : "text-err";
}

/** Agreement summary over the selected range: one row per metric. */
export function AgreementTable<T>(props: { pairs: Pair<T>[]; metrics: Metric<T>[] }) {
  return (
    <section className="card overflow-x-auto">
      <h2 className="mb-3 text-sm font-semibold">Übereinstimmung im Zeitraum</h2>
      <table className="w-full text-sm tabular-nums">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1 pr-4 font-normal">Metrik</th>
            <th className="py-1 pr-4 font-normal">Paare</th>
            <th className="py-1 pr-4 font-normal">Ø Δ (WHOOP − Garmin)</th>
            <th className="py-1 pr-4 font-normal">Ø |Δ|</th>
            <th className="py-1 pr-4 font-normal">Korrelation r</th>
            <th className="py-1 font-normal">Vergleichbarkeit</th>
          </tr>
        </thead>
        <tbody>
          {props.metrics.map((m) => {
            const s = agreement(pairedValues(props.pairs, m.key));
            return (
              <tr key={m.key} className="border-t border-line">
                <td className="py-1.5 pr-4">{m.label}</td>
                <td className="py-1.5 pr-4">{s?.n ?? 0}</td>
                <td className="py-1.5 pr-4">{s ? (s.meanDiff > 0 ? "+" : "") + fmt(s.meanDiff, m.unit) : "–"}</td>
                <td className="py-1.5 pr-4">{s ? fmt(s.mae, m.unit) : "–"}</td>
                <td className="py-1.5 pr-4">{s?.r != null ? s.r.toFixed(2) : "–"}</td>
                <td className="py-1.5 text-xs text-muted">{KIND_LABEL[m.kind]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** One date with both providers side by side. */
export function PairCard<T>(props: {
  title: string;
  subtitle?: React.ReactNode;
  pair: Pair<T>;
  metrics: Metric<T>[];
  /** Rendered between header and table, e.g. position selects. */
  actions?: React.ReactNode;
}) {
  const { whoop, garmin } = props.pair;
  return (
    <article className="card">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{props.title}</h3>
        {props.subtitle && <span className="text-xs text-muted">{props.subtitle}</span>}
      </header>
      {props.actions && <div className="mb-2 flex flex-wrap justify-end gap-2">{props.actions}</div>}
      <table className="w-full text-sm tabular-nums">
        <thead className="text-left text-xs">
          <tr>
            <th className="py-1 font-normal text-muted"></th>
            <th className="py-1 text-right font-medium text-whoop">WHOOP</th>
            <th className="py-1 text-right font-medium text-garmin">Garmin</th>
            <th className="py-1 text-right font-normal text-muted">Δ</th>
          </tr>
        </thead>
        <tbody>
          {props.metrics.map((m) => {
            const w = whoop?.[m.key] as number | null | undefined;
            const g = garmin?.[m.key] as number | null | undefined;
            const d = fmtDiff(w, g, m.unit);
            return (
              <tr key={m.key} className="border-t border-line" title={m.note}>
                <td className="py-1 pr-2 text-muted">
                  {m.label}
                  {m.kind !== "direct" && <sup className="ml-0.5">{m.kind === "method" ? "*" : "†"}</sup>}
                </td>
                <td className="py-1 text-right">{fmt(w, m.unit)}</td>
                <td className="py-1 text-right">{fmt(g, m.unit)}</td>
                <td className={`py-1 text-right text-xs ${diffClass(d.pct)}`}>{d.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}

export function Legend() {
  return (
    <p className="text-xs text-muted">
      Δ = WHOOP − Garmin · Farbe: <span className="text-ok">&lt;5 %</span> /{" "}
      <span className="text-warn">5–15 %</span> / <span className="text-err">&gt;15 %</span> Abweichung · * gleiche
      Einheit, andere Messmethode · † proprietärer Score, nur als Trend vergleichbar (Details per Hover)
    </p>
  );
}

export function Empty() {
  return (
    <p className="card text-sm text-muted">
      Keine Daten im Zeitraum. Zeitraum wählen und „Daten ziehen“ klicken.
    </p>
  );
}
