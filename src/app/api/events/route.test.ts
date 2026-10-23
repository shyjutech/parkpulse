import { describe, expect, it } from "vitest";
import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/events", () => {
  it("rejects the retired submit_started name — the database still permits it (kept for old rows), but the app never sends it again", async () => {
    const res = await POST(req({ name: "submit_started" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown event name", async () => {
    const res = await POST(req({ name: "totally_made_up" }));
    expect(res.status).toBe(400);
  });

  it("rejects a malformed body", async () => {
    const res = await POST(new Request("http://localhost/api/events", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("accepts the new funnel event names from the client", async () => {
    for (const name of ["form_view", "form_start", "signin_prompted", "signin_returned"]) {
      const res = await POST(req({ name }));
      expect(res.status, name).toBe(200);
    }
  });

  it("rejects a server-verified outcome event when sent from the client", async () => {
    // submit_completed is a valid EventName but must come from the server action, not here.
    const res = await POST(req({ name: "submit_completed" }));
    expect(res.status).toBe(400);
  });
});
