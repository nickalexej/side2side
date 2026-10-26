import { AgreementTable, Empty, Legend, PairCard } from "@/components/Compare";
import { resolveRange, Shell, type RangeParams } from "@/components/Shell";
import { dayPairs, weekSums, type WeekSum } from "@/lib/compare";
import { addDays } from "@/lib/dates";
import { DAY_METRICS, fmt, fmtDiff } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const shortDate = (day: string) =>
  new Date(day).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });

function WeekTable({ weeks }: { weeks: WeekSum[] }) {
  if (weeks.length === 0) return null;
  const pct = (w: number | null, g: number | null) => {
    const d = fmtDiff(w, g, "kcal");
    return d.pct == null ? "–" : `${d.pct > 0 ? "+" : ""}${d.pct.toFixed(1)} %`;
  };
  return (
    <section className="card overflow-x-auto">
      <h2 className="mb-1 text-sm font-semibold">Wochenvergleich</h2>
      <p className="mb-3 text-xs text-muted">
        Summe über alle Tage mit vollständigen Daten auf beiden Seiten, geteilt durch die abgedeckten Stunden. Über eine
        Woche gleichen sich die verschobenen Tagesgrenzen fast vollständig aus – die robusteste Vergleichsbasis.
      </p>
      <table className="w-full text-sm tabular-nums">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1 pr-4 font-normal">Woche</th>
            <th className="py-1 pr-4 font-normal">Tage</th>
            <th className="py-1 pr-4 font-normal">Stunden W / G</th>
            <th className="py-1 pr-4 text-right font-normal">
              <span className="text-whoop">WHOOP</span> kcal/24 h
            </th>
            <th className="py-1 pr-4 text-right font-normal">
              <span className="text-garmin">Garmin</span> kcal/24 h
            </th>
            <th className="py-1 pr-4 text-right font-normal">Δ kcal</th>
            <th className="py-1 text-right font-normal">Δ Schritte</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week} className="border-t border-line">
              <td className="py-1.5 pr-4">
                {shortDate(w.week)}–{shortDate(addDays(w.week, 6))}
              </td>
              <td className="py-1.5 pr-4">{w.days}</td>
              <td className="py-1.5 pr-4 text-muted">
                {w.whoopHours.toFixed(0)} / {w.garminHours.toFixed(0)}
              </td>
              <td className="py-1.5 pr-4 text-right">{fmt(w.whoopKcal24h, "kcal")}</td>
              <td className="py-1.5 pr-4 text-right">{fmt(w.garminKcal24h, "kcal")}</td>
              <td className="py-1.5 pr-4 text-right">{pct(w.whoopKcal24h, w.garminKcal24h)}</td>
              <td className="py-1.5 text-right text-muted">{pct(w.whoopSteps24h, w.garminSteps24h)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function DaysPage({ searchParams }: { searchParams: RangeParams }) {
  const { from, to } = await resolveRange(searchParams);
  const pairs = dayPairs(from, to);

  return (
    <Shell active="/tage" from={from} to={to}>
      {pairs.length === 0 ? (
        <Empty />
      ) : (
        <>
          <WeekTable weeks={weekSums(pairs)} />
          <AgreementTable pairs={pairs} metrics={DAY_METRICS} />
          <Legend />
          <p className="text-xs text-muted">
            WHOOP rechnet pro Cycle (Einschlafen bis Einschlafen, 22–27 h), Garmin pro Kalendertag. „je 24 h“ rechnet beide
            auf gleiche Länge hoch. Offene Cycles und der heutige Tag bleiben außen vor.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {pairs.map((p) => (
              <PairCard
                key={p.date}
                title={new Date(p.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                pair={p}
                metrics={DAY_METRICS}
              />
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
