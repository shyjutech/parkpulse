import { createBrowserClient } from "@supabase/ssr";

// NEXT_PUBLIC_* must be referenced literally so Next can inline them.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
