import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120) ?? "";
  if (q.length < 2) return NextResponse.json({ companies: [] });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("similar_companies", { q, lim: 8 });
  if (error) return NextResponse.json({ companies: [], error: "Couldn't search companies right now." }, { status: 500 });
  return NextResponse.json({ companies: data ?? [] });
}
