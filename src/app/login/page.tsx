import { redirect } from "next/navigation";
import LoginButton from "@/components/LoginButton";
import { getViewer } from "@/lib/session";

export const metadata = { title: "Sign in" };

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  const viewer = await getViewer();
  if (viewer.userId) redirect(next);
  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-2xl font-semibold">Sign in to ParkPulse</h1>
      <p className="mt-2 text-stone-600">
        We use Google sign-in to keep spam out. Your identity is never shown alongside anything you share.
      </p>
      {sp.error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          Sign-in didn&apos;t complete. Please try again.
        </p>
      )}
      <div className="mt-6">
        <LoginButton next={next} />
      </div>
    </div>
  );
}
