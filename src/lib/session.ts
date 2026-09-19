import { cache } from "react";
import { createClient } from "./supabase/server";

export interface Viewer {
  userId: string | null;
  hasContributed: boolean;
  isAdmin: boolean;
}

/** Who is looking, resolved once per request. Values come from the database (RLS-backed), not the client. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { userId: null, hasContributed: false, isAdmin: false };
  const [contributed, admin] = await Promise.all([
    supabase.rpc("has_contributed"),
    supabase.rpc("is_admin"),
  ]);
  return {
    userId: auth.user.id,
    hasContributed: contributed.data === true,
    isAdmin: admin.data === true,
  };
});
