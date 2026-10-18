export const COMMON_CURRENCIES = [
  "MYR", "NZD", "AUD", "SGD", "USD", "GBP", "EUR", "JPY", "CNY", "HKD", "THB", "IDR", "INR", "CAD",
];

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

// Sums values per currency, e.g. "RM 1,200.00 + NZ$ 40.00".
export function formatTotals(items: { value: number | null; quantity: number; currency: string }[]) {
  const totals = new Map<string, number>();
  for (const it of items) {
    if (it.value == null) continue;
    totals.set(it.currency, (totals.get(it.currency) ?? 0) + it.value * Math.max(it.quantity, 1));
  }
  if (totals.size === 0) return null;
  return [...totals.entries()].map(([c, v]) => formatMoney(v, c)).join(" + ");
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
