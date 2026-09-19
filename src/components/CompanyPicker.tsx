"use client";

import { useEffect, useState } from "react";
import { PARKS } from "@/lib/constants";
import type { Company } from "@/lib/types";

type Suggestion = Pick<Company, "id" | "name" | "slug" | "park" | "verified" | "review_count">;

export interface CompanyValue {
  companyId: string;
  companyName: string;
  newName: string;
  newPark: string;
}

const input = "min-h-11 w-full rounded-md border border-stone-300 bg-white px-3";

export default function CompanyPicker({
  value,
  onChange,
  errors,
}: {
  value: CompanyValue;
  onChange: (v: CompanyValue) => void;
  errors: { name?: string; park?: string };
}) {
  const [query, setQuery] = useState(value.companyName || value.newName);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [failed, setFailed] = useState(false);
  const adding = !value.companyId && value.newName !== "";
  const shown = value.companyId || query.trim().length < 2 ? [] : suggestions;

  useEffect(() => {
    if (value.companyId || query.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/companies/suggest?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        const json = await res.json();
        setSuggestions(json.companies ?? []);
        setFailed(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFailed(true);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, value.companyId]);

  return (
    <div>
      <label htmlFor="company" className="block text-sm font-medium">Company</label>
      <input
        id="company"
        className={input}
        value={query}
        autoComplete="off"
        placeholder="Start typing, e.g. TCS, UST, Infosys…"
        aria-invalid={!!errors.name}
        aria-describedby="company-help"
        onChange={(e) => {
          setQuery(e.target.value);
          onChange({ companyId: "", companyName: "", newName: "", newPark: value.newPark });
        }}
      />
      <p id="company-help" className="mt-1 text-xs text-stone-500">Pick an existing company if it&apos;s listed, so experiences stay together.</p>

      {value.companyId && (
        <p className="mt-2 rounded-md bg-brand-50 p-2 text-sm text-brand-800">
          Selected: <strong>{value.companyName}</strong>
        </p>
      )}

      {shown.length > 0 && (
        <ul className="mt-2 divide-y divide-stone-100 rounded-md border border-stone-200 bg-white" aria-label="Matching companies">
          {shown.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                onClick={() => {
                  setQuery(s.name);
                  onChange({ companyId: s.id, companyName: s.name, newName: "", newPark: "" });
                }}
              >
                <span>{s.name} <span className="text-stone-500">· {s.park}</span></span>
                <span className="text-xs text-stone-500">{s.verified ? "Verified" : "Not yet verified"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {failed && <p className="mt-2 text-xs text-stone-500">Couldn&apos;t check for existing companies. You can still add it.</p>}

      {!value.companyId && query.trim().length >= 2 && !adding && (
        <button
          type="button"
          className="mt-2 min-h-11 rounded-md border border-dashed border-stone-400 px-3 text-sm text-stone-700 hover:border-brand-600"
          onClick={() => onChange({ companyId: "", companyName: "", newName: query.trim(), newPark: value.newPark })}
        >
          {shown.length > 0 ? "None of these — " : ""}add “{query.trim()}” as a new company
        </button>
      )}

      {adding && (
        <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-3">
          <p className="text-sm">
            New company: <strong>{value.newName}</strong>{" "}
            <span className="text-stone-500">(will be shown as “Not yet verified” until reviewed)</span>
          </p>
          <label htmlFor="park" className="mt-3 block text-sm font-medium">Where is it based?</label>
          <select
            id="park"
            className={input}
            value={value.newPark}
            aria-invalid={!!errors.park}
            onChange={(e) => onChange({ ...value, newPark: e.target.value })}
          >
            <option value="">Select…</option>
            {PARKS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}
      {errors.name && <p role="alert" className="mt-1 text-sm text-red-700">{errors.name}</p>}
      {errors.park && <p role="alert" className="mt-1 text-sm text-red-700">{errors.park}</p>}
    </div>
  );
}
