import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/whoop/client";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const home = new URL("/", req.url);

  if (error || !code) {
    home.searchParams.set("whoop", `fehler: ${error ?? "kein code"}`);
    return NextResponse.redirect(home);
  }
  if (!state || state !== req.cookies.get("whoop_state")?.value) {
    home.searchParams.set("whoop", "fehler: state stimmt nicht");
    return NextResponse.redirect(home);
  }

  try {
    await exchangeCode(code);
    home.searchParams.set("whoop", "verbunden");
  } catch (e) {
    home.searchParams.set("whoop", `fehler: ${e instanceof Error ? e.message : String(e)}`);
  }
  const res = NextResponse.redirect(home);
  res.cookies.delete("whoop_state");
  return res;
}
