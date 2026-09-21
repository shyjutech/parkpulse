import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ANON_COOKIE, UTM_COOKIE, encodeUtm } from "./lib/attribution";

// Keeps the Supabase session fresh, hands out an anonymous visitor id and
// records first-touch UTM tags. It is NOT an authorisation layer: access
// control is enforced by RLS and SECURITY DEFINER functions in Postgres.
export async function proxy(request: NextRequest) {
  const fresh: { name: string; value: string; maxAge: number }[] = [];
  if (!request.cookies.get(ANON_COOKIE)) {
    fresh.push({ name: ANON_COOKIE, value: crypto.randomUUID(), maxAge: 60 * 60 * 24 * 365 });
  }
  if (!request.cookies.get(UTM_COOKIE)) {
    const utm = encodeUtm(request.nextUrl.searchParams);
    if (utm) fresh.push({ name: UTM_COOKIE, value: utm, maxAge: 60 * 60 * 24 * 30 });
  }
  // Visible to this request's server code, and sent back to the browser below.
  for (const c of fresh) request.cookies.set(c.name, c.value);

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getClaims();
  }
  for (const c of fresh) {
    response.cookies.set(c.name, c.value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: c.maxAge });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
