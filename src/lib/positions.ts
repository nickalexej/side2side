import "server-only";
import { db, upsert, type Source } from "@/lib/db";
import { POSITIONS, type Position } from "@/lib/position-labels";

export type { Position };
export type PositionKind = "night" | "workout";

/** A night is referenced by its date, a workout by the device's own record id. */
export type PositionEntry = { kind: PositionKind; ref: string; device: Source; position: Position | null };

/** Lookup key: `${kind}:${device}:${ref}`. */
export type PositionMap = Map<string, Position>;

export const positionKey = (kind: PositionKind, device: Source, ref: string) => `${kind}:${device}:${ref}`;

export function loadPositions(): PositionMap {
  const rows = db().prepare("SELECT kind, ref, device, position FROM positions").all() as {
    kind: PositionKind;
    ref: string;
    device: Source;
    position: Position;
  }[];
  return new Map(rows.map((r) => [positionKey(r.kind, r.device, r.ref), r.position]));
}

export function savePositions(entries: PositionEntry[]) {
  const conn = db();
  conn.exec("BEGIN");
  try {
    for (const e of entries) {
      if (e.position) upsert("positions", e);
      else
        conn
          .prepare("DELETE FROM positions WHERE kind = ? AND ref = ? AND device = ?")
          .run(e.kind, e.ref, e.device);
    }
    conn.exec("COMMIT");
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

export function isPosition(value: unknown): value is Position {
  return POSITIONS.includes(value as Position);
}
