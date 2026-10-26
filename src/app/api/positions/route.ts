import { NextResponse } from "next/server";
import { isPosition, savePositions, type PositionEntry } from "@/lib/positions";

function valid(e: Partial<PositionEntry>): e is PositionEntry {
  return (
    (e.kind === "night" || e.kind === "workout") &&
    (e.device === "whoop" || e.device === "garmin") &&
    typeof e.ref === "string" &&
    e.ref.length > 0 &&
    (e.position === null || isPosition(e.position))
  );
}

export async function POST(req: Request) {
  const { entries } = (await req.json()) as { entries?: Partial<PositionEntry>[] };
  if (!Array.isArray(entries) || !entries.every(valid)) {
    return NextResponse.json({ error: "Ungültige Einträge" }, { status: 400 });
  }
  savePositions(entries as PositionEntry[]);
  return NextResponse.json({ saved: entries.length });
}
