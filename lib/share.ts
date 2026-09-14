// Backend-free share links. The entire scenario (plus the chosen objective) is
// encoded into the URL hash as URL-safe base64, so a link fully captures a
// user's inputs — no login, no server, no storage. Anyone who opens the link
// gets the exact same inputs loaded client-side.

import type { Scenario } from "./model.ts";
import type { Objective } from "./optimizer.ts";

export type SharedState = { v: 2; scenario: Scenario; objective: Objective };

const HASH_PREFIX = "#s=";

type LegacyCategory = { shareable?: boolean; canIntegrate?: boolean; plannedIntegration?: boolean };

/**
 * v1 stored a single `shareable` flag that meant both "may merge" and "plan to
 * merge". Mapping it to both preserves exactly what an old link used to show.
 * A genuine v1 link always carried `shareable`, so a missing value only shows
 * up on truncated or hand-edited input — default it to `false` (not
 * integrable) rather than `true`, since `canIntegrate` is a safety policy
 * flag and under-merging is the safe direction to fail in.
 */
function migrateCategory(category: LegacyCategory & Record<string, unknown>) {
  if (typeof category.canIntegrate === "boolean") return category;
  const legacy = category.shareable === true;
  const { shareable: _dropped, ...rest } = category;
  return { ...rest, canIntegrate: legacy, plannedIntegration: legacy };
}

/** JSON → UTF-8 bytes → URL-safe base64 (no padding). */
export function encodeState(state: SharedState): string {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Reverse of encodeState; returns null on anything malformed. */
export function decodeState(encoded: string): SharedState | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!isSharedState(parsed)) return null;
    return {
      v: 2,
      objective: parsed.objective,
      scenario: {
        ...parsed.scenario,
        categories: parsed.scenario.categories.map(migrateCategory),
      },
    } as SharedState;
  } catch {
    return null;
  }
}

/** Structural guard so a truncated or stale link is ignored, not crashed on. */
function isSharedState(value: unknown): value is {
  v: number;
  scenario: { categories: Record<string, unknown>[] } & Record<string, unknown>;
  objective: Objective;
} {
  if (!value || typeof value !== "object") return false;
  const scenario = (value as { scenario?: unknown }).scenario as
    | Record<string, unknown>
    | undefined;
  if (!scenario) return false;
  const constraints = scenario.constraints as Record<string, unknown> | undefined;
  return (
    Array.isArray(scenario.programs) &&
    Array.isArray(scenario.categories) &&
    !!constraints &&
    typeof constraints.fundingCeiling === "number" &&
    !!constraints.resourceCeilings
  );
}

/** Parse a scenario from a URL hash string, or null if absent/invalid. */
export function readStateFromHash(hash: string): SharedState | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  return decodeState(hash.slice(HASH_PREFIX.length));
}

/** Build an absolute shareable URL for the given state. */
export function buildShareUrl(
  origin: string,
  pathname: string,
  state: SharedState,
): string {
  return `${origin}${pathname}${HASH_PREFIX}${encodeState(state)}`;
}
