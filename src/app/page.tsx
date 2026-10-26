import Link from "next/link";
import { AgreementTable, Empty, Legend, PairCard } from "@/components/Compare";
import { BulkPositions, PositionSelect } from "@/components/Positions";
import { resolveRange, Shell, type RangeParams } from "@/components/Shell";
import { nightPairs, type Night } from "@/lib/compare";
import { TIME_ZONE } from "@/lib/dates";
import { NIGHT_METRICS } from "@/lib/metrics";
import { POSITION_LABEL } from "@/lib/position-labels";
import { loadPositions, positionKey } from "@/lib/positions";

export const dynamic = "force-dynamic";

const time = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }) : "–";

function sleepWindow(n?: Night) {
  return n ? `${time(n.start)}–${time(n.end)}` : "–";
}

const FILTERS = [
  { value: undefined, label: "Alle" },
  { value: "bicep", label: POSITION_LABEL.bicep },
  { value: "wrist", label: POSITION_LABEL.wrist },
  { value: "none", label: "ohne Angabe" },
] as const;

export default async function NightsPage({ searchParams }: { searchParams: RangeParams }) {
  const { from, to, whoop, wpos } = await resolveRange(searchParams);
  const positions = loadPositions();
  const pos = (device: "whoop" | "garmin", date: string) => positions.get(positionKey("night", device, date)) ?? null;

  const all = nightPairs(from, to);
  const pairs = all.filter((p) => !wpos || (pos("whoop", p.date) ?? "none") === wpos);
  const missing = all.flatMap((p) =>
    (["whoop", "garmin"] as const).filter((d) => p[d] && !pos(d, p.date)).map((d) => ({ ref: p.date, device: d })),
  );

  return (
    <Shell active="/" from={from} to={to} whoop={whoop}>
      {all.length === 0 ? (
        <Empty />
      ) : (
        <>
          <BulkPositions kind="night" missing={missing} />
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <span className="mr-1 text-xs text-muted">WHOOP-Position:</span>
            {FILTERS.map((f) => (
              <Link
                key={f.label}
                href={`/?from=${from}&to=${to}${f.value ? `&wpos=${f.value}` : ""}`}
                className={`rounded-md px-2.5 py-1 ${wpos === f.value ? "bg-surface-2 font-medium" : "text-muted hover:text-fg"}`}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <AgreementTable pairs={pairs} metrics={NIGHT_METRICS} />
          <Legend />
          <div className="grid gap-4 md:grid-cols-2">
            {pairs.map((p) => (
              <PairCard
                key={p.date}
                title={new Date(p.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                subtitle={
                  <>
                    <span className="text-whoop">{sleepWindow(p.whoop)}</span> ·{" "}
                    <span className="text-garmin">{sleepWindow(p.garmin)}</span>
                  </>
                }
                actions={(["whoop", "garmin"] as const)
                  .filter((d) => p[d])
                  .map((d) => (
                    <PositionSelect key={`${d}-${pos(d, p.date)}`} kind="night" refId={p.date} device={d} value={pos(d, p.date)} />
                  ))}
                pair={p}
                metrics={NIGHT_METRICS}
              />
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
