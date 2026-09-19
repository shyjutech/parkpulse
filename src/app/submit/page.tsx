import { redirect } from "next/navigation";
import SubmitForm from "@/components/SubmitForm";
import TrackEvent from "@/components/TrackEvent";
import { getViewer } from "@/lib/session";

export const metadata = { title: "Share your experience" };

export default async function SubmitPage() {
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login?next=/submit");
  return (
    <div className="mx-auto max-w-2xl">
      <TrackEvent name="submit_started" />
      <h1 className="text-2xl font-semibold">Share your interview experience</h1>
      <p className="mt-2 text-stone-600">
        It takes about 5 minutes. As soon as you submit, you unlock all approved experiences.
      </p>
      <div className="mt-6">
        <SubmitForm />
      </div>
    </div>
  );
}
