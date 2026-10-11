const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Formats integer US cents as dollars, e.g. 1275 -> "$12.75". */
export function formatUsd(cents: number): string {
  return usd.format((cents || 0) / 100);
}
