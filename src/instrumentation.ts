// Runs once on server start. In demo mode the seeded raw data is normalized right away,
// so the dashboard is filled without clicking "Daten ziehen".
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DEMO !== "1") return;
  const { rebuild } = await import("@/lib/normalize");
  rebuild();
}
