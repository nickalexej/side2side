import { Empty } from "@/components/Compare";
import { resolveRange, Shell, type RangeParams } from "@/components/Shell";
import { TrendChart, type Point } from "@/components/TrendChart";
import { nightPairs, type Night } from "@/lib/compare";
import { NIGHT_METRICS } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const CHARTS: { key: keyof Night & string; unit: string; scale?: number }[] = [
  { key: "hrv", unit: "ms" },
  { key: "rhr", unit: "bpm" },
  { key: "total_sleep_s", unit: "h", scale: 1 / 3600 },
  { key: "deep_s", unit: "h", scale: 1 / 3600 },
  { key: "rem_s", unit: "h", scale: 1 / 3600 },
  { key: "resp_rate", unit: "/min" },
  { key: "spo2", unit: "%" },
  { key: "readiness", unit: "" },
];

export default async function TrendsPage({ searchParams }: { searchParams: RangeParams }) {
  const { from, to } = await resolveRange(searchParams);
  const pairs = [...nightPairs(from, to)].reverse();

  return (
    <Shell active="/trends" from={from} to={to}>
      {pairs.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {CHARTS.map((c) => {
            const metric = NIGHT_METRICS.find((m) => m.key === c.key)!;
            const value = (n?: Night) => {
              const v = n?.[c.key] as number | null | undefined;
              return v == null ? null : v * (c.scale ?? 1);
            };
            const data: Point[] = pairs.map((p) => ({ date: p.date, whoop: value(p.whoop), garmin: value(p.garmin) }));
            return <TrendChart key={c.key} title={metric.label} note={metric.note} unit={c.unit} data={data} />;
          })}
        </div>
      )}
    </Shell>
  );
}
