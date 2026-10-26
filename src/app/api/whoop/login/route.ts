import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/whoop/client";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("whoop_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
