"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Point = { date: string; whoop: number | null; garmin: number | null };

// Mid-tone hues that hold contrast on both light and dark backgrounds.
const WHOOP = "#0f9f7a";
const GARMIN = "#2f6fdb";

export function TrendChart(props: { title: string; unit: string; note?: string; data: Point[] }) {
  const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} ${props.unit}`;
  return (
    <section className="card">
      <header className="mb-2">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        {props.note && <p className="text-xs text-muted">{props.note}</p>}
      </header>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={props.data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(8, 10) + "." + d.slice(5, 7) + "."}
              tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v: number) => fmt(v)}
              labelFormatter={(d: string) => new Date(d).toLocaleDateString("de-DE")}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="linear" dataKey="whoop" name="WHOOP" stroke={WHOOP} strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
            <Line type="linear" dataKey="garmin" name="Garmin" stroke={GARMIN} strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
