"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

type PullResult = { source: string; ok: boolean; counts?: Record<string, number>; error?: string };

export function Toolbar(props: { from: string; to: string; whoopConnected: boolean; lastPull: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PullResult[] | null>(null);

  function show() {
    router.push(`${pathname}?from=${from}&to=${to}`);
  }

  async function pull() {
    setBusy(true);
    setResults(null);
    try {
      const res = await fetch("/api/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const body = await res.json();
      setResults(body.results ?? [{ source: "app", ok: false, error: body.error }]);
      show();
      router.refresh();
    } catch (e) {
      setResults([{ source: "app", ok: false, error: String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-muted">
          Von
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col text-xs text-muted">
          Bis
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input" />
        </label>
        <button onClick={show} className="btn">
          Anzeigen
        </button>
        <button onClick={pull} disabled={busy} className="btn btn-primary">
          {busy ? "Ziehe Daten …" : "Daten ziehen"}
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          {props.whoopConnected ? (
            <span className="pill pill-whoop">WHOOP verbunden</span>
          ) : (
            <a href="/api/whoop/login" className="btn">
              Mit WHOOP verbinden
            </a>
          )}
          {props.lastPull && <span>Letzter Pull: {props.lastPull}</span>}
        </div>
      </div>
      {results && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {results.map((r) => (
            <li key={r.source} className={`rounded-md px-2 py-1 ${r.ok ? "bg-ok" : "bg-err"}`}>
              <b className="uppercase">{r.source}</b>{" "}
              {r.ok
                ? Object.entries(r.counts ?? {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")
                : r.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
