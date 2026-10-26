import { Empty } from "@/components/Compare";
import { BulkPositions, PositionSelect } from "@/components/Positions";
import { resolveRange, Shell, type RangeParams } from "@/components/Shell";
import { agreement, workoutMatches, type HrSource, type Workout, type WorkoutMatch } from "@/lib/compare";
import { TIME_ZONE } from "@/lib/dates";
import { fmt, fmtDiff, type Metric } from "@/lib/metrics";
import { POSITION_LABEL, POSITIONS, type Position } from "@/lib/position-labels";
import { loadPositions, positionKey, type PositionMap } from "@/lib/positions";

export const dynamic = "force-dynamic";

type Row = { label: string; unit: Metric<unknown>["unit"]; get: (w?: Workout) => number | null | undefined };

const durationS = (w?: Workout) => (w ? (new Date(w.end).getTime() - new Date(w.start).getTime()) / 1000 : null);

const ROWS: Row[] = [
  { label: "Dauer", unit: "duration", get: durationS },
  { label: "Ø Puls", unit: "bpm", get: (w) => w?.avg_hr },
  { label: "Max. Puls", unit: "bpm", get: (w) => w?.max_hr },
  { label: "Kalorien", unit: "kcal", get: (w) => w?.kcal },
  { label: "Distanz (km)", unit: "score", get: (w) => (w?.distance_m != null ? w.distance_m / 1000 : null) },
  { label: "Höhenmeter", unit: "score", get: (w) => w?.elevation_m },
];

const HR_SOURCE: Record<HrSource, { label: string; title: string; group: string }> = {
  strap: {
    label: "Brustgurt · Referenz",
    title: "Garmin-Puls vom Brustgurt (EKG) – Abweichung = Messfehler WHOOP",
    group: "vs. Brustgurt",
  },
  wrist: { label: "Optisch (Cirqa)", title: "Beide Geräte messen optisch – keine Referenz", group: "vs. Cirqa (optisch)" },
  import: { label: "Import", title: "Fremd-Upload – Pulssensor nicht bekannt", group: "vs. Import" },
};

const whoopPosition = (m: WorkoutMatch, positions: PositionMap): Position | null =>
  m.whoop ? (positions.get(positionKey("workout", "whoop", m.whoop.id)) ?? null) : null;

/** HR agreement for matched workouts, split by Garmin's heart rate source and WHOOP's wearing position. */
function HrAccuracy({ matches, positions }: { matches: WorkoutMatch[]; positions: PositionMap }) {
  const groups = (Object.keys(HR_SOURCE) as HrSource[]).flatMap((source) =>
    [...POSITIONS, null].map((position) => ({ source, position })),
  );
  const rows = groups
    .map((g) => {
      const pairs = matches.filter(
        (m) => m.whoop && m.garmin?.hr_source === g.source && whoopPosition(m, positions) === g.position,
      );
      const stat = (key: "avg_hr" | "max_hr") =>
        agreement(
          pairs.flatMap((m) => {
            const w = m.whoop![key];
            const gv = m.garmin![key];
            return w != null && gv != null ? [[w, gv] as [number, number]] : [];
          }),
        );
      return { ...g, avg: stat("avg_hr"), max: stat("max_hr") };
    })
    .filter((r) => r.avg);

  if (rows.length === 0) return null;
  const cell = (s: ReturnType<typeof agreement>) =>
    s ? `${s.meanDiff > 0 ? "+" : ""}${s.meanDiff.toFixed(1)} / ${s.mae.toFixed(1)} bpm` : "–";

  return (
    <section className="card overflow-x-auto">
      <h2 className="mb-1 text-sm font-semibold">Puls-Genauigkeit nach Garmin-Quelle und WHOOP-Position</h2>
      <p className="mb-3 text-xs text-muted">
        Werte: Ø Δ (WHOOP − Garmin) / Ø |Δ|. Nur bei Brustgurt ist Garmin eine echte Referenz.
      </p>
      <table className="w-full text-sm tabular-nums">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1 pr-4 font-normal">Vergleich</th>
            <th className="py-1 pr-4 font-normal">Workouts</th>
            <th className="py-1 pr-4 font-normal">Ø Puls</th>
            <th className="py-1 font-normal">Max. Puls</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.source}-${r.position}`} className="border-t border-line">
              <td className="py-1.5 pr-4">
                <span className="text-whoop">WHOOP {r.position ? `am ${POSITION_LABEL[r.position]}` : "(Position ?)"}</span>{" "}
                {HR_SOURCE[r.source].group}
              </td>
              <td className="py-1.5 pr-4">{r.avg!.n}</td>
              <td className="py-1.5 pr-4">{cell(r.avg)}</td>
              <td className="py-1.5">{cell(r.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const dt = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });

export default async function WorkoutsPage({ searchParams }: { searchParams: RangeParams }) {
  const { from, to } = await resolveRange(searchParams);
  const matches = workoutMatches(from, to);
  const positions = loadPositions();
  const pos = (w: Workout) => positions.get(positionKey("workout", w.source, w.id)) ?? null;

  const paired = matches.filter((m) => m.whoop && m.garmin).length;
  const onlyWhoop = matches.filter((m) => m.whoop && !m.garmin).length;
  const onlyGarmin = matches.filter((m) => !m.whoop && m.garmin).length;
  const missing = matches.flatMap((m) =>
    [m.whoop, m.garmin].filter((w): w is Workout => !!w && !pos(w)).map((w) => ({ ref: w.id, device: w.source })),
  );

  return (
    <Shell active="/workouts" from={from} to={to}>
      {matches.length === 0 ? (
        <Empty />
      ) : (
        <>
          <section className="card flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-2xl font-semibold tabular-nums">{paired}</div>
              <div className="text-muted">von beiden erkannt</div>
            </div>
            <div>
              <div className="text-whoop text-2xl font-semibold tabular-nums">{onlyWhoop}</div>
              <div className="text-muted">nur WHOOP</div>
            </div>
            <div>
              <div className="text-garmin text-2xl font-semibold tabular-nums">{onlyGarmin}</div>
              <div className="text-muted">nur Garmin</div>
            </div>
            <p className="max-w-md text-xs text-muted">
              Zuordnung über Zeitüberlappung (≥ 50 % des kürzeren Workouts). Belastung ist proprietär (WHOOP Strain vs.
              Garmin Training Load) und nicht direkt vergleichbar.
            </p>
          </section>
          <BulkPositions kind="workout" missing={missing} />
          <HrAccuracy matches={matches} positions={positions} />
          <div className="grid gap-4 md:grid-cols-2">
            {matches.map((m) => {
              const ref = (m.whoop ?? m.garmin)!;
              return (
                <article key={`${m.whoop?.id}-${m.garmin?.id}`} className="card">
                  <header className="mb-2 flex items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{dt(ref.start)}</h3>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {m.garmin?.hr_source && (
                        <span
                          className={`pill ${m.garmin.hr_source === "strap" ? "pill-ref" : "bg-surface-2"}`}
                          title={HR_SOURCE[m.garmin.hr_source].title}
                        >
                          {HR_SOURCE[m.garmin.hr_source].label}
                        </span>
                      )}
                      {m.whoop && m.garmin ? `${Math.round(m.overlap * 100)} % Überlappung` : "kein Gegenstück"}
                    </span>
                  </header>
                  <div className="mb-2 flex flex-wrap justify-end gap-2">
                    {[m.whoop, m.garmin]
                      .filter((w): w is Workout => !!w)
                      .map((w) => (
                        <PositionSelect
                          key={`${w.source}-${pos(w)}`}
                          kind="workout"
                          refId={w.id}
                          device={w.source}
                          value={pos(w)}
                        />
                      ))}
                  </div>
                  <table className="w-full text-sm tabular-nums">
                    <thead className="text-left text-xs">
                      <tr>
                        <th className="py-1 font-normal text-muted"></th>
                        <th className="py-1 text-right font-medium text-whoop">{m.whoop?.sport ?? "WHOOP"}</th>
                        <th className="py-1 text-right font-medium text-garmin">{m.garmin?.sport ?? "Garmin"}</th>
                        <th className="py-1 text-right font-normal text-muted">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ROWS.map((r) => {
                        const w = r.get(m.whoop);
                        const g = r.get(m.garmin);
                        return (
                          <tr key={r.label} className="border-t border-line">
                            <td className="py-1 pr-2 text-muted">{r.label}</td>
                            <td className="py-1 text-right">{fmt(w, r.unit)}</td>
                            <td className="py-1 text-right">{fmt(g, r.unit)}</td>
                            <td className="py-1 text-right text-xs text-muted">{fmtDiff(w, g, r.unit).text}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </article>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
