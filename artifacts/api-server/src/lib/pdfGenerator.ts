import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
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
  if (val === null || val === undefined) return "\u2014";
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

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + "\u2026", size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "\u2026";
}

export async function generateReportPdf(
  session: Session,
  preview: PreviewData,
): Promise<Buffer> {
  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 40;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const cDark   = rgb(0.067, 0.094, 0.153);
  const cGrey   = rgb(0.420, 0.447, 0.502);
  const cBlue   = rgb(0.145, 0.388, 0.922);
  const cHdrBg  = rgb(0.953, 0.957, 0.965);
  const cAltBg  = rgb(0.976, 0.980, 0.984);
  const cLine   = rgb(0.898, 0.906, 0.918);
  const cHdrTxt = rgb(0.216, 0.255, 0.318);

  const pdfDoc = await PDFDocument.create();
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let cy = PAGE_H - MARGIN;

  function addPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    cy = PAGE_H - MARGIN;
  }

  function need(h: number) {
    if (cy - h < MARGIN + 30) addPage();
  }

  function text(
    str: string,
    x: number,
    size: number,
    font: PDFFont,
    color = cDark,
    maxW?: number,
  ) {
    const s = maxW !== undefined ? truncate(str, font, size, maxW) : str;
    page.drawText(s, { x, y: cy - size, font, size, color });
  }

  function hline(color = cLine) {
    page.drawLine({
      start: { x: MARGIN, y: cy },
      end: { x: PAGE_W - MARGIN, y: cy },
      thickness: 0.5,
      color,
    });
  }

  function fillRect(x: number, w: number, h: number, color: ReturnType<typeof rgb>) {
    page.drawRectangle({ x, y: cy - h, width: w, height: h, color });
  }

  function tableHeader(headers: string[], cols: number[], smallFont = false) {
    const rowH = 16;
    need(rowH);
    const totalW = cols.reduce((a, b) => a + b, 0);
    fillRect(MARGIN, totalW, rowH, cHdrBg);
    let x = MARGIN;
    for (let i = 0; i < headers.length; i++) {
      text(headers[i], x + 3, smallFont ? 8 : 9, fontB, cHdrTxt, cols[i] - 6);
      x += cols[i];
    }
    cy -= rowH;
  }

  function tableRow(
    values: string[],
    cols: number[],
    even: boolean,
    highlightCols: number[] = [],
  ) {
    const rowH = 14;
    need(rowH);
    const totalW = cols.reduce((a, b) => a + b, 0);
    if (even) fillRect(MARGIN, totalW, rowH, cAltBg);
    let x = MARGIN;
    for (let i = 0; i < values.length; i++) {
      const hi = highlightCols.includes(i);
      text(values[i], x + 3, 8, hi ? fontB : fontR, hi ? cBlue : cDark, cols[i] - 6);
      x += cols[i];
    }
    page.drawLine({
      start: { x: MARGIN, y: cy - rowH },
      end: { x: MARGIN + totalW, y: cy - rowH },
      thickness: 0.5,
      color: cLine,
    });
    cy -= rowH;
  }

  // ── Header ────────────────────────────────────────────────────────────────
  text("EFTE Merge & Edit Tool", MARGIN, 18, fontB, cDark);
  cy -= 22;
  text("Change Report", MARGIN, 11, fontR, cGrey);
  cy -= 15;

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  text(
    `Month: ${session.selectedMonth ?? "\u2014"}   |   Locations: ${session.files.length}   |   Generated: ${dateStr}`,
    MARGIN, 10, fontR, cDark,
  );
  cy -= 14;
  hline();
  cy -= 14;

  // ── Processed Locations ───────────────────────────────────────────────────
  text("Processed Locations", MARGIN, 13, fontB, cDark);
  cy -= 17;
  text(`${session.files.length} location report(s) included in this export`, MARGIN, 9, fontR, cGrey);
  cy -= 13;

  const locCols = [25, 215, 275];
  tableHeader(["#", "Location", "File"], locCols);
  for (let i = 0; i < session.files.length; i++) {
    const f = session.files[i];
    tableRow(
      [String(i + 1), f.locationName || "\u2014", f.originalName],
      locCols,
      i % 2 === 1,
    );
  }
  cy -= 18;

  // ── Delete Rows ───────────────────────────────────────────────────────────
  need(40);
  text("Deleted Rows (Hours & EFTE \u2192 0)", MARGIN, 13, fontB, cDark);
  cy -= 17;

  if (preview.deletePreview.length === 0) {
    text("No rows configured for deletion.", MARGIN, 10, fontR, cGrey);
    cy -= 15;
  } else {
    const grouped = groupByRow(preview.deletePreview);
    text(
      `${grouped.length} row(s) cleared across ${preview.deletePreview.length} location(s)`,
      MARGIN, 9, fontR, cGrey,
    );
    cy -= 13;
    const delCols = [60, 200];
    tableHeader(["Row", "Locations affected"], delCols);
    for (let i = 0; i < grouped.length; i++) {
      tableRow(
        [String(grouped[i].rowNumber), String(grouped[i].count)],
        delCols,
        i % 2 === 1,
      );
    }
  }
  cy -= 18;

  // ── Adjusted Rows ─────────────────────────────────────────────────────────
  need(40);
  text("Adjusted Rows", MARGIN, 13, fontB, cDark);
  cy -= 17;

  if (preview.modifyPreview.length === 0) {
    text("No row adjustments configured.", MARGIN, 10, fontR, cGrey);
    cy -= 15;
  } else {
    text(`${preview.modifyPreview.length} adjustment(s) applied`, MARGIN, 9, fontR, cGrey);
    cy -= 13;

    const modCols = [40, 175, 65, 65, 65, 65];
    tableHeader(
      ["Row", "Location", "Cur. Hours", "Cur. EFTE", "New Hours", "New EFTE"],
      modCols,
      true,
    );
    for (let i = 0; i < preview.modifyPreview.length; i++) {
      const row = preview.modifyPreview[i];
      const isChanged =
        row.newHours !== row.currentHours || row.newEfte !== row.currentEfte;
      tableRow(
        [
          String(row.rowNumber),
          row.locationName,
          fmt(row.currentHours),
          fmt(row.currentEfte),
          fmt(row.newHours),
          fmt(row.newEfte),
        ],
        modCols,
        i % 2 === 1,
        isChanged ? [4, 5] : [],
      );
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
