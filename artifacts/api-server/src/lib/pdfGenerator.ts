import PDFDocument from "pdfkit";
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
}

interface PreviewData {
  deletePreview: PreviewDeleteRow[];
  modifyPreview: PreviewModifyRow[];
}

function fmt(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function generateReportPdf(
  session: Session,
  preview: PreviewData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 40, size: "A4" });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const COL_GREY = "#6b7280";
    const COL_BLUE = "#2563eb";
    const COL_DARK = "#111827";

    // ── Header ─────────────────────────────────────────────────────────────
    doc.fontSize(18).fillColor(COL_DARK).font("Helvetica-Bold")
      .text("EFTE Merge & Edit Tool", { align: "left" });

    doc.fontSize(11).fillColor(COL_GREY).font("Helvetica")
      .text("Change Report", { align: "left" });

    doc.moveDown(0.3);
    doc.fontSize(10).fillColor(COL_DARK)
      .text(
        `Month: ${session.selectedMonth ?? "—"}   |   Locations: ${session.files.length}   |   Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      );

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#e5e7eb").lineWidth(1).stroke();
    doc.moveDown(0.5);

    // ── Uploaded Locations ─────────────────────────────────────────────────
    doc.fontSize(13).fillColor(COL_DARK).font("Helvetica-Bold")
      .text("Processed Locations");
    doc.moveDown(0.3);

    doc.fontSize(9).fillColor(COL_GREY).font("Helvetica")
      .text(`${session.files.length} location report(s) included in this export`);
    doc.moveDown(0.3);

    drawTableHeader(doc, ["#", "Location", "File"], [25, 220, 270]);
    session.files.forEach((f, i) => {
      drawTableRow(doc, [String(i + 1), f.locationName || "—", f.originalName], [25, 220, 270], i % 2 === 1);
    });

    doc.moveDown(1);

    // ── Delete Rows Section ────────────────────────────────────────────────
    doc.fontSize(13).fillColor(COL_DARK).font("Helvetica-Bold")
      .text("Deleted Rows (Hours & EFTE → 0)");
    doc.moveDown(0.3);

    if (preview.deletePreview.length === 0) {
      doc.fontSize(10).fillColor(COL_GREY).font("Helvetica")
        .text("No rows configured for deletion.");
    } else {
      const grouped = groupByRow(preview.deletePreview);

      doc.fontSize(9).fillColor(COL_GREY).font("Helvetica")
        .text(`${grouped.length} row(s) cleared across ${preview.deletePreview.length} location(s)`);
      doc.moveDown(0.3);

      drawTableHeader(doc, ["Row", "Locations affected"], [60, 200]);
      for (const g of grouped) {
        drawTableRow(doc, [String(g.rowNumber), String(g.count)], [60, 200], false);
      }
    }

    doc.moveDown(1);

    // ── Modify Rows Section ────────────────────────────────────────────────
    doc.fontSize(13).fillColor(COL_DARK).font("Helvetica-Bold")
      .text("Adjusted Rows");
    doc.moveDown(0.3);

    if (preview.modifyPreview.length === 0) {
      doc.fontSize(10).fillColor(COL_GREY).font("Helvetica")
        .text("No row adjustments configured.");
    } else {
      doc.fontSize(9).fillColor(COL_GREY).font("Helvetica")
        .text(`${preview.modifyPreview.length} adjustment(s) applied`);
      doc.moveDown(0.3);

      const cols = [40, 175, 65, 65, 65, 65];
      const headers = ["Row", "Location", "Cur. Hours", "Cur. EFTE", "New Hours", "New EFTE"];

      drawTableHeader(doc, headers, cols, true);

      for (let i = 0; i < preview.modifyPreview.length; i++) {
        const row = preview.modifyPreview[i];
        const isChanged = row.newHours !== row.currentHours || row.newEfte !== row.currentEfte;
        drawTableRow(
          doc,
          [
            String(row.rowNumber),
            row.locationName,
            fmt(row.currentHours),
            fmt(row.currentEfte),
            fmt(row.newHours),
            fmt(row.newEfte),
          ],
          cols,
          i % 2 === 1,
          isChanged ? [4, 5] : [],
        );

        if (doc.y > 750) {
          doc.addPage();
        }
      }
    }

    // ── Footer ─────────────────────────────────────────────────────────────
    doc.fontSize(8).fillColor(COL_GREY).font("Helvetica");
    doc.text(
      `Page 1  ·  Generated ${new Date().toLocaleString("en-US")}`,
      40,
      doc.page.height - 40,
      { align: "center" },
    );

    doc.end();
  });
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

function drawTableHeader(doc: PDFKit.PDFDocument, headers: string[], colWidths: number[], smallFont = false): void {
  const startX = 40;
  let x = startX;
  const rowH = 16;
  const y = doc.y;

  doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowH).fill("#f3f4f6");

  doc.font("Helvetica-Bold").fontSize(smallFont ? 8 : 9).fillColor("#374151");
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x + 3, y + 4, { width: colWidths[i] - 6, ellipsis: true });
    x += colWidths[i];
  }
  doc.moveDown(0);
  doc.y = y + rowH;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  values: string[],
  colWidths: number[],
  shaded: boolean,
  highlightCols: number[] = [],
): void {
  const startX = 40;
  let x = startX;
  const rowH = 14;
  const y = doc.y;
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  if (shaded) {
    doc.rect(startX, y, totalW, rowH).fill("#f9fafb");
  }

  doc.font("Helvetica").fontSize(8).fillColor("#111827");
  for (let i = 0; i < values.length; i++) {
    if (highlightCols.includes(i)) {
      doc.fillColor("#2563eb").font("Helvetica-Bold");
    } else {
      doc.fillColor("#111827").font("Helvetica");
    }
    doc.text(values[i], x + 3, y + 3, { width: colWidths[i] - 6, ellipsis: true });
    x += colWidths[i];
  }

  doc.moveTo(startX, y + rowH).lineTo(startX + totalW, y + rowH).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
  doc.y = y + rowH;
}
