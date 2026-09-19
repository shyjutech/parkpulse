import Link from "next/link";
import { getViewer } from "@/lib/session";

const link = "rounded-md px-2 py-2 text-sm font-medium text-stone-800 hover:text-brand-700";

export default async function Header() {
  let viewer = { userId: null as string | null, isAdmin: false };
  try {
    viewer = await getViewer();
  } catch {
    // Missing configuration or a transient error: render the signed-out header.
  }
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-brand-800">
          ParkPulse
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-x-1" aria-label="Main">
          <Link href="/companies" className={link}>Companies</Link>
          <Link href="/search" className={link}>Search</Link>
          <Link href="/submit" className={link}>Share</Link>
          {viewer.userId ? (
            <>
              <Link href="/dashboard" className={link}>My contributions</Link>
              {viewer.isAdmin && <Link href="/admin" className={link}>Admin</Link>}
              <form action="/auth/signout" method="post">
                <button className={link}>Sign out</button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="ml-1 rounded-lg bg-stone-950 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
