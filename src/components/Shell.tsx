import Link from "next/link";
import { lastPull } from "@/lib/compare";
import { addDays, TIME_ZONE, today } from "@/lib/dates";
import { apiKeyDaysLeft } from "@/lib/garmin/client";
import { isConnected } from "@/lib/whoop/client";
import { Toolbar } from "./Toolbar";

export type RangeParams = Promise<{ from?: string; to?: string; whoop?: string; wpos?: string }>;

const NAV = [
  { href: "/", label: "Nächte" },
  { href: "/tage", label: "Tage" },
  { href: "/workouts", label: "Workouts" },
  { href: "/trends", label: "Trends" },
];

const KEY_WARN_DAYS = 30;

function KeyExpiryWarning() {
  const days = apiKeyDaysLeft();
  if (days == null || days > KEY_WARN_DAYS) return null;
  return (
    <p className="bg-err rounded-md px-3 py-2 text-sm">
      {days > 0
        ? `Garmin-API-Key läuft in ${days} ${days === 1 ? "Tag" : "Tagen"} ab.`
        : "Garmin-API-Key ist abgelaufen."}{" "}
      In Garmin Connect neu erzeugen und in .env eintragen (GARMIN_API_KEY, GARMIN_API_KEY_EXPIRES).
    </p>
  );
}

// Formatted on the server so client hydration renders the identical string.
function formatPull(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleString("de-DE", { timeZone: TIME_ZONE }) : null;
}

export async function resolveRange(params: RangeParams) {
  const p = await params;
  const to = p.to ?? today();
  return { from: p.from ?? addDays(to, -13), to, whoop: p.whoop, wpos: p.wpos };
}

export function Shell(props: {
  active: string;
  from: string;
  to: string;
  whoop?: string;
  children: React.ReactNode;
}) {
  const qs = `?from=${props.from}&to=${props.to}`;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h1 className="text-lg font-semibold">
            side2side{" "}
            <span className="text-sm font-normal">
              <span className="text-whoop">WHOOP</span> <span className="text-muted">vs.</span>{" "}
              <span className="text-garmin">Garmin</span>
            </span>
          </h1>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href + qs}
                className={`rounded-md px-3 py-1 ${props.active === n.href ? "bg-surface-2 font-medium" : "text-muted hover:text-fg"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <Toolbar from={props.from} to={props.to} whoopConnected={isConnected()} lastPull={formatPull(lastPull())} />
        <KeyExpiryWarning />
        {props.whoop && (
          <p className={`rounded-md px-3 py-2 text-sm ${props.whoop === "verbunden" ? "bg-ok" : "bg-err"}`}>
            WHOOP: {props.whoop}
          </p>
        )}
      </header>
      <main className="flex flex-col gap-6">{props.children}</main>
    </div>
  );
}
