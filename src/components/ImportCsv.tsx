"use client";

import { useState } from "react";
import {
  type DateFormat,
  guessLocationSeparator,
  guessMapping,
  guessTagSeparator,
  IMPORT_FIELDS,
  type ImportField,
  type ImportResult,
  importRows,
  type Mapping,
  parseCsv,
} from "@/lib/csv";
import { errorMessage } from "@/lib/format";
import type { InventoryData } from "./Inventory";

type Parsed = { fileName: string; headers: string[]; rows: Record<string, string>[] };

export default function ImportCsv({ data, onImported }: { data: InventoryData; onImported: () => void }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [locSep, setLocSep] = useState("→");
  const [tagSep, setTagSep] = useState(",");
  const [dateFormat, setDateFormat] = useState<DateFormat>("DMY");
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(file: File | undefined) {
    setResult(null);
    setError(null);
    if (!file) return;
    const { headers, rows, errors } = parseCsv(await file.text());
    if (!headers.length || !rows.length) {
      setError(errors[0]?.message ?? "That file has no rows.");
      return;
    }
    const m = guessMapping(headers, rows);
    setParsed({ fileName: file.name, headers, rows });
    setMapping(m);
    if (m.location) setLocSep(guessLocationSeparator(rows.map((r) => r[m.location!] ?? "")));
    if (m.tags) setTagSep(guessTagSeparator(rows.map((r) => r[m.tags!] ?? "")));
  }

  async function run() {
    if (!parsed || !mapping.name) return;
    setError(null);
    setProgress("Starting…");
    try {
      const res = await importRows(
        data.household.id,
        parsed.rows,
        { mapping, locationSeparator: locSep, tagSeparator: tagSep, dateFormat, defaultCurrency: data.household.default_currency },
        { locations: data.locations, categories: data.categories, tags: data.tags },
        setProgress,
      );
      setResult(res);
      setParsed(null);
      onImported();
    } catch (e) {
      setError(`Import stopped: ${errorMessage(e)}. Rows saved before the error are kept.`);
      onImported();
    } finally {
      setProgress(null);
    }
  }

  const preview = parsed?.rows.slice(0, 5) ?? [];
  const mapped = IMPORT_FIELDS.filter((f) => mapping[f.field]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 font-semibold">Import from CSV</h3>
        <p className="text-sm text-muted">
          Export your items from UnderMyRoof (or any spreadsheet) as CSV, then choose the file here. You can match its
          columns to fields before anything is saved. Missing locations, categories and tags are created automatically.
        </p>
      </div>
      <input
        type="file"
        accept=".csv,text/csv"
        className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-panel file:px-3 file:py-2 file:text-sm file:font-medium file:text-text"
        onChange={(e) => load(e.target.files?.[0])}
      />

      {parsed && (
        <>
          <p className="text-sm">
            <strong>{parsed.rows.length}</strong> rows in {parsed.fileName}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {IMPORT_FIELDS.map(({ field, label }) => (
              <label key={field} className="flex items-center gap-2 text-sm">
                <span className="w-32 shrink-0 text-muted">
                  {label}
                  {field === "name" && " *"}
                </span>
                <select
                  className="input py-1.5"
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [field as ImportField]: e.target.value || undefined })}
                >
                  <option value="">— skip —</option>
                  {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">
              <span className="label">Location levels separated by</span>
              <select className="input py-1.5" value={locSep} onChange={(e) => setLocSep(e.target.value)}>
                <option value="→">→ (Home → Kitchen)</option>
                <option value=">">&gt; (Home &gt; Kitchen)</option>
                <option value="/">/ (Home / Kitchen)</option>
                <option value="\">\</option>
                <option value=":">:</option>
                <option value="">Not nested</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="label">Tags separated by</span>
              <select className="input py-1.5" value={tagSep} onChange={(e) => setTagSep(e.target.value)}>
                <option value=",">Comma</option>
                <option value=";">Semicolon</option>
                <option value="|">|</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="label">Dates are written</span>
              <select className="input py-1.5" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                <option value="DMY">Day/Month/Year</option>
                <option value="MDY">Month/Day/Year</option>
                <option value="YMD">Year-Month-Day</option>
              </select>
            </label>
          </div>

          {mapped.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-bg text-muted">
                  <tr>{mapped.map((f) => <th key={f.field} className="px-2 py-1.5 font-medium whitespace-nowrap">{f.label}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-line">
                      {mapped.map((f) => (
                        <td key={f.field} className="max-w-48 truncate px-2 py-1.5">{row[mapping[f.field]!]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className="btn-primary" disabled={!mapping.name || progress !== null} onClick={run}>
            Import {parsed.rows.length} items
          </button>
          {!mapping.name && <p className="text-sm text-danger">Choose which column holds the item name.</p>}
        </>
      )}

      {progress && <p className="text-sm text-muted">{progress}</p>}
      {result && (
        <p className="rounded-lg bg-accent-soft p-3 text-sm">
          Imported {result.items} items, created {result.locations} locations, {result.categories} categories and{" "}
          {result.tags} tags.
          {result.skipped > 0 && ` Skipped ${result.skipped} rows without a name.`}
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
