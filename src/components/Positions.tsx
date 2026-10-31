"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { POSITION_LABEL, POSITIONS, type Position } from "@/lib/position-labels";

type Device = "whoop" | "garmin";
type Kind = "night" | "workout";
type Entry = { kind: Kind; ref: string; device: Device; position: Position | null };

async function save(entries: Entry[]) {
  const res = await fetch("/api/positions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
}

/** Inline select for one device's wearing position on one night or workout. */
export function PositionSelect(props: { kind: Kind; refId: string; device: Device; value: Position | null }) {
  const router = useRouter();
  const [value, setValue] = useState(props.value ?? "");
  const [busy, setBusy] = useState(false);

  async function change(next: string) {
    setValue(next);
    setBusy(true);
    try {
      await save([{ kind: props.kind, ref: props.refId, device: props.device, position: (next || null) as Position | null }]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => change(e.target.value)}
      aria-label={`Tragposition ${props.device === "whoop" ? "WHOOP" : "Garmin"}`}
      className={`select text-${props.device}`}
    >
      <option value="">Position?</option>
      {POSITIONS.map((p) => (
        <option key={p} value={p}>
          {POSITION_LABEL[p]}
        </option>
      ))}
    </select>
  );
}

/** Set one position per device on every listed item that has none yet. */
export function BulkPositions(props: { kind: Kind; missing: { ref: string; device: Device }[] }) {
  const router = useRouter();
  const [whoop, setWhoop] = useState<Position>("bicep");
  const [garmin, setGarmin] = useState<Position>("bicep");
  const [busy, setBusy] = useState(false);
  // Start hidden so SSR and first client render match; real value is read from localStorage after mount.
  const [dismissed, setDismissed] = useState(true);
  const storageKey = `bulk-positions-dismissed:${props.kind}`;
  const count = (d: Device) => props.missing.filter((m) => m.device === d).length;

  useEffect(() => {
    setDismissed(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (props.missing.length === 0 || dismissed) return null;

  async function apply() {
    setBusy(true);
    try {
      await save(
        props.missing.map((m) => ({
          kind: props.kind,
          ref: m.ref,
          device: m.device,
          position: m.device === "whoop" ? whoop : garmin,
        })),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const picker = (device: Device, value: Position, set: (p: Position) => void) => (
    <label className="flex items-center gap-1.5">
      <span className={`text-${device}`}>{device === "whoop" ? "WHOOP" : "Garmin"}</span>
      <select value={value} onChange={(e) => set(e.target.value as Position)} className="select">
        {POSITIONS.map((p) => (
          <option key={p} value={p}>
            {POSITION_LABEL[p]}
          </option>
        ))}
      </select>
      <span className="text-muted">({count(device)})</span>
    </label>
  );

  return (
    <section className="card relative flex flex-wrap items-center gap-x-4 gap-y-2 pr-10 text-sm">
      <span className="font-medium">Tragposition nachtragen</span>
      <span className="text-xs text-muted">für alle im Zeitraum ohne Angabe:</span>
      {picker("whoop", whoop, setWhoop)}
      {picker("garmin", garmin, setGarmin)}
      <button onClick={apply} disabled={busy} className="btn">
        {busy ? "Speichere …" : "Übernehmen"}
      </button>
      <button
        onClick={() => {
          localStorage.setItem(storageKey, "1");
          setDismissed(true);
        }}
        aria-label="Hinweis schließen"
        title="Schließen"
        className="absolute right-3 top-2 text-lg leading-none text-muted hover:text-white"
      >
        ×
      </button>
    </section>
  );
}
