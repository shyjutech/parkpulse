/** Cookie names shared by the proxy (which sets them) and server code (which reads them). */
export const ANON_COOKIE = "pp_aid";
export const UTM_COOKIE = "pp_utm";

const clean = (v: string | null | undefined) =>
  (v ?? "").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 40);

/** Compact, sanitised "source|medium|campaign" string, or null when there is no UTM source. */
export function encodeUtm(params: URLSearchParams): string | null {
  const source = clean(params.get("utm_source"));
  if (!source) return null;
  return [source, clean(params.get("utm_medium")), clean(params.get("utm_campaign"))].join("|");
}

export function decodeUtm(value: string | undefined) {
  if (!value) return { utm_source: null, utm_medium: null, utm_campaign: null };
  const [s, m, c] = value.split("|").map(clean);
  return { utm_source: s || null, utm_medium: m || null, utm_campaign: c || null };
}
