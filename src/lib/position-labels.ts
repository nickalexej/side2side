// Client-safe position constants (positions.ts is server-only).
export const POSITIONS = ["wrist", "bicep"] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<Position, string> = {
  wrist: "Handgelenk",
  bicep: "Bizeps",
};
