import { describe, expect, it } from "vitest";
import { decodeUtm, encodeUtm } from "./attribution";

describe("utm attribution", () => {
  it("captures and sanitises utm parameters", () => {
    const enc = encodeUtm(new URLSearchParams("utm_source=Instagram&utm_medium=bio&utm_campaign=first50"));
    expect(enc).toBe("instagram|bio|first50");
    expect(decodeUtm(enc!)).toEqual({ utm_source: "instagram", utm_medium: "bio", utm_campaign: "first50" });
  });
  it("ignores visits without a utm source", () => {
    expect(encodeUtm(new URLSearchParams("utm_medium=bio"))).toBeNull();
    expect(decodeUtm(undefined)).toEqual({ utm_source: null, utm_medium: null, utm_campaign: null });
  });
  it("strips unsafe characters and caps length", () => {
    const enc = encodeUtm(new URLSearchParams({ utm_source: "<script>x|y</script>" + "a".repeat(100) }))!;
    expect(enc).not.toMatch(/[<>]/);
    expect(decodeUtm(enc).utm_source!.length).toBeLessThanOrEqual(40);
  });
});
