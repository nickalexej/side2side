import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} fehlt in .env`);
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export const env = {
  /** Demo mode: no API calls, "Daten ziehen" only rebuilds from the seeded demo database. */
  demo: () => process.env.DEMO === "1",
  garminApiKey: () => required("GARMIN_API_KEY"),
  /** Expiry chosen when creating the key in Garmin Connect (YYYY-MM-DD); the API does not report it. */
  garminApiKeyExpires: () => process.env.GARMIN_API_KEY_EXPIRES ?? null,
  /**
   * Manufacturers of imported activities (e.g. ZWIFT) whose heart rate came from a chest strap.
   * Imports carry no sensor list, so this has to be configured.
   */
  garminStrapImports: () => list("GARMIN_STRAP_IMPORTS"),
  whoopClientId: () => required("WHOOP_CLIENT_ID"),
  whoopClientSecret: () => required("WHOOP_CLIENT_SECRET"),
  whoopRedirectUri: () =>
    process.env.WHOOP_REDIRECT_URI ?? "http://localhost:3000/api/whoop/callback",
};
