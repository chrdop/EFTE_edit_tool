import type { Session } from "../lib/sessionStore.js";

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
  remarks?: string;
}

interface PreviewData {
  deletePreview: PreviewDeleteRow[];
  modifyPreview: PreviewModifyRow[];
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
    lines.push(`${grouped.length} row(s) cleared across ${preview.deletePreview.length} location(s)`);
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
      const remarks = row.remarks ?? "";
      lines.push(
        `${col(String(row.rowNumber), 6)}${col(row.locationName, 28)}${col(fmt(row.currentHours), 12)}${col(fmt(row.currentEfte), 12)}${col(fmt(row.newHours), 12)}${col(fmt(row.newEfte), 12)}${remarks}${marker}`,
      );
    }
    lines.push("");
    lines.push("  * = value changed");
  }

  lines.push("");
  lines.push(line("="));
  lines.push("End of report");

  return Promise.resolve(Buffer.from(lines.join("\n"), "utf-8"));
}
