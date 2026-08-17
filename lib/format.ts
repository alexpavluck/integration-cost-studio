// Presentation helpers shared across the screens. Costs are entered and stored
// in $k; large figures collapse to $m for readability.

export function money(value: number, compact = false): string {
  const rounded = Math.round(value);
  if (compact && Math.abs(rounded) >= 1000) {
    return `$${(rounded / 1000).toFixed(1).replace(".0", "")}m`;
  }
  return `$${rounded.toLocaleString()}k`;
}

/** Signed money, e.g. "+$120k" / "−$40k" (true minus sign, not a hyphen). */
export function signedMoney(value: number, compact = false): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${money(Math.abs(value), compact)}`;
}

export function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function paybackLabel(years: number | null): string {
  if (years === null) return "No payback";
  if (years <= 0) return "Immediate";
  // These are once-a-year activities, so savings are only realized at the end of
  // each annual cycle — payback can never land part-way through a year. Round up
  // to the next whole year rather than showing misleading months.
  const wholeYears = Math.ceil(years);
  return `${wholeYears} year${wholeYears === 1 ? "" : "s"}`;
}

/**
 * Guards a numeric text input against blank/NaN entries, which would otherwise
 * silently poison every downstream sum. Returns the fallback when unparseable.
 */
export function toNonNegativeNumber(raw: string, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function toNumber(raw: string, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
