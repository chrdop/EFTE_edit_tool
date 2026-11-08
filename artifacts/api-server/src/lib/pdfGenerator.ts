import type { Session } from "../lib/sessionStore.js";
import { kindLabel } from "./removals.js";

interface PreviewDeleteRow {
  rowNumber: number;
  locationName: string;
  currentHours?: number | null;
  currentEfte?: number | null;
}

interface PreviewModifyRow {
  rowNumber: number;
  locationName: string;
  currentHours?: number | null;
  currentEfte?: number | null;
  newHours?: number | null;
  newEfte?: number | null;
  remarks?: string | null;
}

interface SkippedLocation {
  locationName: string;
  fileName: string;
  reason: string;
}

interface PreviewData {
  deletePreview: PreviewDeleteRow[];
  modifyPreview: PreviewModifyRow[];
  skipped: SkippedLocation[];
  warnings: string[];
}

// The machine-readable block at the end of the report. The frontend's playbook parser
// (artifacts/excel-tool/src/lib/playbook.ts) looks for exactly these markers.
export const PLAYBOOK_BEGIN = "<<<EFTE-PLAYBOOK-BEGIN>>>";
export const PLAYBOOK_END = "<<<EFTE-PLAYBOOK-END>>>";
export const PLAYBOOK_FORMAT_VERSION = 1;

/**
 * What next month needs to rebuild the same setup: delete rows, Karenz / other-cluster
 * entries and the rules. The rule amounts are carried only as "previous" reference values —
 * they are re-entered every month.
 */
function buildPlaybook(session: Session) {
  return {
    format: "efte-playbook",
    formatVersion: PLAYBOOK_FORMAT_VERSION,
    month: session.selectedMonth,
    generated: new Date().toISOString(),
    locationCount: session.files.length,
    deleteRows: session.deleteRows.map((d) => ({ rowNumber: d.rowNumber })),
    karenzEntries: session.karenzEntries.map((k) => ({
      kind: k.kind,
      name: k.name ?? "",
      locationName: k.locationName,
      rowNumber: k.rowNumber,
      ...(k.kind !== "cluster" ? { hours: k.hours ?? 0, efte: k.efte ?? 0 } : {}),
      ...(k.kind === "karenz" && k.returnMonth ? { returnMonth: k.returnMonth } : {}),
    })),
    rules: session.modifyRows.map((r) => ({
      locationName: r.locationName,
      rowNumber: r.rowNumber,
      plusMinus: r.plusMinus,
      scope: r.divisor > 0 ? "all" : "own",
      remarks: r.remarks ?? "",
      // A rule whose amounts were never entered or confirmed this month keeps the last real amounts as the
      // reference, instead of replacing them with the unconfirmed 0.
      previousHoursAdjustment: r.pending ? (r.previousHoursAdjustment ?? r.hoursAdjustment) : r.hoursAdjustment,
      previousEfteAdjustment: r.pending ? (r.previousEfteAdjustment ?? r.efteAdjustment) : r.efteAdjustment,
    })),
  };
}

function fmt(val: number | null | undefined): string {
  if (val === null || val === undefined) return "-";
  return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function groupByRow(rows: PreviewDeleteRow[]): Array<{ rowNumber: number; count: number }> {
  const map = new Map<number, number>();
  for (const r of rows) {
    map.set(r.rowNumber, (map.get(r.rowNumber) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rowNumber, count]) => ({ rowNumber, count }));
}

function line(char = "-", len = 72): string {
  return char.repeat(len);
}

function col(value: string, width: number): string {
  const s = String(value);
  return s.length >= width ? s.slice(0, width - 1) + " " : s.padEnd(width);
}

export function generateReportPdf(
  session: Session,
  preview: PreviewData,
): Promise<Buffer> {
  const dateStr = new Date().toLocaleString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const lines: string[] = [];

  lines.push("EFTE MERGE & EDIT TOOL — CHANGE REPORT");
  lines.push(line("="));
  lines.push(`Month     : ${session.selectedMonth ?? "-"}`);
  lines.push(`Locations : ${session.files.length}`);
  lines.push(`Generated : ${dateStr}`);
  lines.push(line("="));
  lines.push("");

  // ── Processed Locations ────────────────────────────────────────────────
  lines.push("PROCESSED LOCATIONS");
  lines.push(line("-"));
  lines.push(`${col("#", 4)}${col("Location", 30)}File`);
  lines.push(line("-"));
  for (let i = 0; i < session.files.length; i++) {
    const f = session.files[i];
    lines.push(`${col(String(i + 1), 4)}${col(f.locationName || "-", 30)}${f.originalName}`);
  }
  lines.push("");

  // ── Deleted Rows ───────────────────────────────────────────────────────
  lines.push("DELETED ROWS  (Hours & EFTE set to 0)");
  lines.push(line("-"));

  if (preview.deletePreview.length === 0) {
    lines.push("No rows configured for deletion.");
  } else {
    const grouped = groupByRow(preview.deletePreview);
    const clearedLocations = new Set(preview.deletePreview.map((r) => r.locationName)).size;
    lines.push(`${grouped.length} row(s) cleared across ${clearedLocations} location(s)`);
    lines.push("");
    lines.push(`${col("Row", 8)}Locations affected`);
    lines.push(line("-", 30));
    for (const g of grouped) {
      lines.push(`${col(String(g.rowNumber), 8)}${g.count}`);
    }
  }
  lines.push("");

  // ── Adjusted Rows ──────────────────────────────────────────────────────
  lines.push("ADJUSTED ROWS");
  lines.push(line("-"));

  if (preview.modifyPreview.length === 0) {
    lines.push("No row adjustments configured.");
  } else {
    lines.push(`${preview.modifyPreview.length} adjustment(s) applied`);
    lines.push("");
    lines.push(
      `${col("Row", 6)}${col("Location", 28)}${col("Old Hours", 12)}${col("Old EFTE", 12)}${col("New Hours", 12)}${col("New EFTE", 12)}Remarks`,
    );
    lines.push(line("-"));
    for (const row of preview.modifyPreview) {
      const changed =
        row.newHours !== row.currentHours || row.newEfte !== row.currentEfte;
      const marker = changed ? " *" : "  ";
      lines.push(
        `${col(String(row.rowNumber), 6)}${col(row.locationName, 28)}${col(fmt(row.currentHours), 12)}${col(fmt(row.currentEfte), 12)}${col(fmt(row.newHours), 12)}${col(fmt(row.newEfte), 12)}${row.remarks ?? ""}${marker}`,
      );
    }
    lines.push("");
    lines.push("  * = value changed");
  }

  lines.push("");

  // ── Warnings ───────────────────────────────────────────────────────────
  if (preview.warnings.length > 0) {
    lines.push(`WARNINGS  (${preview.warnings.length} — please check)`);
    lines.push(line("-"));
    for (const w of preview.warnings) lines.push(`! ${w}`);
    lines.push("");
  }

  // ── Skipped Locations ──────────────────────────────────────────────────
  if (preview.skipped.length > 0) {
    lines.push("SKIPPED LOCATIONS  (NOT modified — please check manually)");
    lines.push(line("-"));
    lines.push(`${col("Location", 30)}${col("File", 30)}Reason`);
    lines.push(line("-"));
    for (const s of preview.skipped) {
      lines.push(`${col(s.locationName || "-", 30)}${col(s.fileName, 30)}${s.reason}`);
    }
    lines.push("");
  }

  // ── Removed persons ────────────────────────────────────────────────────
  lines.push("PARENTAL LEAVE / OTHER CLUSTER / REALLOCATION  (taken out of the original values before the rules)");
  lines.push(line("-"));
  if (session.karenzEntries.length === 0) {
    lines.push("No entries.");
  } else {
    lines.push(`${col("Type", 15)}${col("Name", 18)}${col("Row", 6)}${col("Hours", 10)}${col("EFTE", 8)}${col("Return", 9)}Location`);
    for (const k of session.karenzEntries) {
      const isCluster = k.kind === "cluster";
      lines.push(
        `${col(kindLabel(k.kind), 15)}${col(k.name?.trim() || "-", 18)}${col(String(k.rowNumber), 6)}` +
          `${col(isCluster ? "row -> 0" : fmt(k.hours ?? 0), 10)}${col(isCluster ? "" : fmt(k.efte ?? 0), 8)}${col(k.kind === "karenz" ? k.returnMonth ?? "" : "", 9)}${k.locationName}`,
      );
    }
  }
  lines.push("");

  // ── Rules ──────────────────────────────────────────────────────────────
  lines.push("ADJUSTMENT RULES  (as configured)");
  lines.push(line("-"));
  if (session.modifyRows.length === 0) {
    lines.push("No rules.");
  } else {
    lines.push(`${col("Row", 6)}${col("Mode", 6)}${col("Hours Adj.", 12)}${col("EFTE Adj.", 11)}${col("Scope", 16)}Source location / remarks`);
    for (const r of session.modifyRows) {
      const scope = r.divisor > 0 ? `all ÷ ${session.files.length}` : "own location";
      lines.push(
        `${col(String(r.rowNumber), 6)}${col(r.plusMinus, 6)}${col(fmt(r.hoursAdjustment), 12)}${col(fmt(r.efteAdjustment), 11)}${col(scope, 16)}${r.locationName}${r.remarks ? ` — ${r.remarks}` : ""}`,
      );
    }
  }
  lines.push("");

  // ── Playbook (machine-readable) ────────────────────────────────────────
  lines.push("PLAYBOOK  (machine-readable — load this report in the tool next month; do not edit the block)");
  lines.push(line("-"));
  lines.push(PLAYBOOK_BEGIN);
  lines.push(JSON.stringify(buildPlaybook(session), null, 2));
  lines.push(PLAYBOOK_END);
  lines.push("");

  lines.push(line("="));
  lines.push("End of report");

  return Promise.resolve(Buffer.from(lines.join("\n"), "utf-8"));
}
