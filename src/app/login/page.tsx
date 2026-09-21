import { redirect } from "next/navigation";
import LoginButton from "@/components/LoginButton";
import { safeNext } from "@/lib/nav";
import { getViewer } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  const viewer = await getViewer();
  if (viewer.userId) redirect(next);
  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-2xl font-semibold">Sign in to ParkPulse</h1>
      <p className="mt-2 text-stone-600">
        You only need to sign in to share an experience, or to save reports, follow companies and keep a checklist. Browsing is open to everyone.
      </p>
      {sp.error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          Sign-in didn&apos;t complete. Please try again.
        </p>
      )}
      <div className="mt-6">
        <LoginButton next={next} />
      </div>
      <p className="mt-4 text-xs text-stone-500">
        Google sign-in details (name and email) are collected to prevent abuse and are never displayed publicly.{" "}
        <a href="/privacy" className="underline">Privacy details</a>
      </p>
    </div>
  );
}
