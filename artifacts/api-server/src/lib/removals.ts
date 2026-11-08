import type { KarenzEntry } from "./sessionStore.js";

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Everything taken out of one (location, row) before the adjustment rules run. */
export interface RowRemoval {
  karenzHours: number;
  karenzEfte: number;
  clusterRemoved: boolean;
  entries: KarenzEntry[];
}

export function removalKey(locationName: string, rowNumber: number): string {
  return `${locationName}:${rowNumber}`;
}

/**
 * Groups the entries per (location, row). Entries without a location or a positive row
 * are ignored; rows listed in excludeRows (cleared by "Delete rows") are skipped too.
 */
export function buildRemovalMap(
  entries: KarenzEntry[] | undefined,
  excludeRows?: Set<number>,
): Map<string, RowRemoval> {
  const map = new Map<string, RowRemoval>();
  for (const e of entries ?? []) {
    if (!(e.rowNumber > 0) || !e.locationName) continue;
    if (excludeRows?.has(e.rowNumber)) continue;
    const key = removalKey(e.locationName, e.rowNumber);
    const r = map.get(key) ?? { karenzHours: 0, karenzEfte: 0, clusterRemoved: false, entries: [] };
    if (e.kind === "cluster") {
      r.clusterRemoved = true;
    } else {
      r.karenzHours += e.hours ?? 0;
      r.karenzEfte += e.efte ?? 0;
    }
    r.entries.push(e);
    map.set(key, r);
  }
  return map;
}

/** Original cell value with the removal applied. An empty cell stays empty. */
export function applyRemoval(
  original: number | null,
  removal: RowRemoval | undefined,
  field: "hours" | "efte",
): number | null {
  if (!removal || original === null) return original;
  if (removal.clusterRemoved) return 0;
  return round2(original - (field === "hours" ? removal.karenzHours : removal.karenzEfte));
}

/** Display label of an entry kind ("karenz" is shown as "Parental leave"). */
export function kindLabel(kind: KarenzEntry["kind"]): string {
  if (kind === "cluster") return "Other cluster";
  if (kind === "reallocation") return "Reallocation";
  return "Parental leave";
}

export function describeRemoval(removal: RowRemoval): string {
  return removal.entries.map((e) => `${kindLabel(e.kind)}: ${e.name?.trim() || "(no name)"}`).join(", ");
}
