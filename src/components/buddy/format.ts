/** Small display helpers for Buddy result cards. */

export function formatDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatNumber(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-GB") : "";
}

/** "out_of_service" → "Out Of Service" */
export function humanize(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
