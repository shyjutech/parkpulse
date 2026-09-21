import { redirect } from "next/navigation";
import { qs } from "@/lib/nav";

// Search now lives on the Experiences page; keep old links working.
export default async function SearchRedirect({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  redirect(`/experiences${qs({ q: typeof sp.q === "string" ? sp.q : "" })}`);
}
