import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumePendingSignin, isUnloggedToday, logOncePerDay, markPendingSignin, postEvent } from "./clientEvents";

describe("isUnloggedToday", () => {
  it("is true the first time (nothing stored) and false once today's date is stored", () => {
    expect(isUnloggedToday(null, "2026-10-23")).toBe(true);
    expect(isUnloggedToday("2026-10-22", "2026-10-23")).toBe(true);
    expect(isUnloggedToday("2026-10-23", "2026-10-23")).toBe(false);
  });
});

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("logOncePerDay", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", fakeStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the event on first call and skips a second call the same day", () => {
    logOncePerDay("form_view");
    logOncePerDay("form_view");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ name: "form_view" });
  });

  it("tracks different event names independently", () => {
    logOncePerDay("form_view");
    logOncePerDay("form_start");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not throw and does not fetch when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => logOncePerDay("form_view")).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes companyId through when given", () => {
    logOncePerDay("form_view", "company-1");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ name: "form_view", companyId: "company-1" });
  });
});

describe("postEvent", () => {
  it("fires a single request with the given name", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    postEvent("signin_prompted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/events");
    vi.unstubAllGlobals();
  });

  it("swallows a rejected fetch instead of throwing", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(() => postEvent("signin_prompted")).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe("pending signin marker", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is false until marked, true once, then false again (one-shot)", () => {
    expect(consumePendingSignin()).toBe(false);
    markPendingSignin();
    expect(consumePendingSignin()).toBe(true);
    expect(consumePendingSignin()).toBe(false);
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => markPendingSignin()).not.toThrow();
    expect(consumePendingSignin()).toBe(false);
  });
});
