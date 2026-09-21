import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ContributeNudge from "@/components/ContributeNudge";
import Header from "@/components/Header";
import VisitTracker from "@/components/VisitTracker";
import { getViewer } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "ParkPulse — Kerala IT interview experiences", template: "%s · ParkPulse" },
  description:
    "Anonymous salary ranges, interview questions and candidate experiences from Kerala's IT companies.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let showNudge = true;
  try {
    showNudge = !(await getViewer()).hasContributed;
  } catch {
    // Backend unavailable: default to the gentle prompt.
  }
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Header />
        <VisitTracker />
        {showNudge && <ContributeNudge />}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-500">
          ParkPulse · Anonymous, user-contributed and reviewed by moderators. Reviewed does not mean verified: experiences are individual accounts.{" "}
          <a href="/privacy" className="underline">Privacy</a>
        </footer>
      </body>
    </html>
  );
}
