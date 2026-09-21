import { MODERATION_NOTE, PRIVACY_SUMMARY } from "@/lib/constants";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  const h = "mt-8 text-lg font-semibold";
  const p = "mt-2 text-stone-700";
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Privacy and moderation</h1>

      <h2 className={h}>What we collect</h2>
      <p className={p}>{PRIVACY_SUMMARY}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-700">
        <li>Sign-in: the name and email from your Google account, used only for account security, abuse prevention and your private features (saves, follows, checklists).</li>
        <li>Your reports: the text and choices you submit, published without any link to your account.</li>
        <li>Basic usage: page visits and actions such as starting or completing a form, plus the campaign link you arrived from. We do not record what you write in reports as analytics.</li>
      </ul>

      <h2 className={h}>What is never shown publicly</h2>
      <p className={p}>Your name, email, Google profile photo and account ID are never displayed, and no public page or query returns them.</p>

      <h2 className={h}>What to leave out of a report</h2>
      <p className={p}>
        Names of people, email addresses, phone numbers, links, manager or client names, confidential company information, passwords and internal documents. We check for the obvious ones, but you are the best judge of what could identify you.
      </p>

      <h2 className={h}>Moderation: reviewed is not verified</h2>
      <p className={p}>{MODERATION_NOTE}</p>
      <p className={p}>Treat every report as one person&apos;s account, and small samples as anecdotes.</p>

      <h2 className={h}>Your private features</h2>
      <p className={p}>Saved reports, followed companies and preparation checklists are visible only to you.</p>
    </div>
  );
}
