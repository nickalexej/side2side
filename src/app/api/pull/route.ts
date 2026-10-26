import { NextResponse } from "next/server";
import { pullAll } from "@/lib/pull";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const { from, to } = (await req.json()) as { from?: string; to?: string };
  if (!from || !to || !DAY.test(from) || !DAY.test(to) || from > to) {
    return NextResponse.json({ error: "from/to als YYYY-MM-DD angeben, from ≤ to" }, { status: 400 });
  }
  return NextResponse.json({ results: await pullAll(from, to) });
}
