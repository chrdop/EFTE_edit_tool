import * as XLSX from "xlsx";
import type { UploadedFile, DeleteRowConfig, ModifyRowConfig } from "./sessionStore.js";

const CANONICAL_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const MONTH_ALIASES: Record<string, string> = {
  "Jan": "January", "Feb": "February", "Mar": "March", "Apr": "April",
  "May": "May", "Jun": "June", "Jul": "July", "Aug": "August",
  "Sep": "September", "Oct": "October", "Nov": "November", "Dec": "December",
  "Januar": "January", "Februar": "February", "März": "March",
  "Mai": "May", "Juni": "June", "Juli": "July",
  "Oktober": "October",
  "Jänner": "January",
};

function normalizeMonth(raw: string): string | null {
  const trimmed = raw.trim();
  if (CANONICAL_MONTHS.includes(trimmed)) return trimmed;
  const aliased = MONTH_ALIASES[trimmed];
  if (aliased) return aliased;
  return null;
}

// Row/col in SheetJS are 0-based; user-facing row numbers are 1-based.
function cellAddr(row1: number, col0: number): string {
  return XLSX.utils.encode_cell({ r: row1 - 1, c: col0 });
}

function getCellValue(ws: XLSX.WorkSheet, row1: number, col0: number): number | null {
  const addr = cellAddr(row1, col0);
  const cell = ws[addr];
  if (!cell) return null;
  const v = cell.v;
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return isNaN(n) ? null : n;
  }
  return null;
}

interface MonthCols {
  hoursCol0: number; // 0-based column index
  efteCol0: number;
}

function findMonthCols(ws: XLSX.WorkSheet, month: string): MonthCols | null {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");

  // Scan rows 7–10 (1-based) for the month header
  for (let row1 = 7; row1 <= 10; row1++) {
    let monthStartCol0 = -1;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row1 - 1, c })];
      const raw = String(cell?.v ?? "").trim();
      if (normalizeMonth(raw) === month && monthStartCol0 === -1) {
        monthStartCol0 = c;
      }
    }
    if (monthStartCol0 === -1) continue;

    // Look at the sub-header row (row1 + 1) for "Hours" / "EFTE" labels
    let hoursCol0 = monthStartCol0;
    let efteCol0 = monthStartCol0 + 1;

    const subRow1 = row1 + 1;
    for (let c = monthStartCol0; c <= monthStartCol0 + 3; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: subRow1 - 1, c })];
      const label = String(cell?.v ?? "").toLowerCase();
      if (label.includes("hour") || label.includes("stund")) hoursCol0 = c;
      if (label.includes("efte") || label.includes("fte")) efteCol0 = c;
    }

    return { hoursCol0, efteCol0 };
  }
  return null;
}

export async function analyzeExcelFile(filePath: string): Promise<{
  sheetNames: string[];
  detectedMonths: string[];
}> {
  const workbook = XLSX.readFile(filePath, {
    cellStyles: true,
    cellFormula: true,
    cellDates: true,
    sheetStubs: true,
  });

  const sheetNames = workbook.SheetNames;
  const monthSet = new Set<string>();

  for (const sheetName of sheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;

    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let row1 = 7; row1 <= 10; row1++) {
      if (row1 - 1 > range.e.r) break;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: row1 - 1, c })];
        const raw = String(cell?.v ?? "").trim();
        const m = normalizeMonth(raw);
        if (m) monthSet.add(m);
      }
    }
  }

  const detectedMonths = Array.from(monthSet).sort(
    (a, b) => CANONICAL_MONTHS.indexOf(a) - CANONICAL_MONTHS.indexOf(b),
  );

  return { sheetNames, detectedMonths };
}

export interface PreviewDeleteRow {
  rowNumber: number;
  sheetName: string;
  currentHours: number | null;
  currentEfte: number | null;
}

export interface PreviewModifyRow {
  rowNumber: number;
  sheetName: string;
  currentHours: number | null;
  currentEfte: number | null;
  newHours: number | null;
  newEfte: number | null;
}

function calcNew(current: number | null, adjustment: number, plusMinus: "+" | "-", divisor: number): number | null {
  if (current === null) return null;
  const adjusted = plusMinus === "-" ? current - adjustment : current + adjustment;
  const result = divisor !== 0 ? adjusted / divisor : adjusted;
  return Math.round(result * 100) / 100;
}

export async function previewChanges(
  files: UploadedFile[],
  month: string,
  deleteRows: DeleteRowConfig[],
  modifyRows: ModifyRowConfig[],
): Promise<{ deletePreview: PreviewDeleteRow[]; modifyPreview: PreviewModifyRow[] }> {
  const deletePreview: PreviewDeleteRow[] = [];
  const modifyPreview: PreviewModifyRow[] = [];

  for (const file of files) {
    const workbook = XLSX.readFile(file.filePath, { cellStyles: true, cellFormula: true });

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;
      const cols = findMonthCols(ws, month);
      if (!cols) continue;

      for (const dr of deleteRows) {
        deletePreview.push({
          rowNumber: dr.rowNumber,
          sheetName,
          currentHours: getCellValue(ws, dr.rowNumber, cols.hoursCol0),
          currentEfte: getCellValue(ws, dr.rowNumber, cols.efteCol0),
        });
      }

      for (const mr of modifyRows) {
        const currentHours = getCellValue(ws, mr.rowNumber, cols.hoursCol0);
        const currentEfte = getCellValue(ws, mr.rowNumber, cols.efteCol0);
        modifyPreview.push({
          rowNumber: mr.rowNumber,
          sheetName,
          currentHours,
          currentEfte,
          newHours: calcNew(currentHours, mr.hoursAdjustment, mr.plusMinus, mr.divisor),
          newEfte: calcNew(currentEfte, mr.efteAdjustment, mr.plusMinus, mr.divisor),
        });
      }
    }
  }

  return { deletePreview, modifyPreview };
}

export async function buildMasterExcel(
  files: UploadedFile[],
  month: string,
  deleteRows: DeleteRowConfig[],
  modifyRows: ModifyRowConfig[],
  outputPath: string,
): Promise<void> {
  const masterWorkbook = XLSX.utils.book_new();

  const usedSheetNames = new Set<string>();

  for (const file of files) {
    const sourceWorkbook = XLSX.readFile(file.filePath, {
      cellStyles: true,
      cellFormula: true,
      cellDates: true,
      sheetStubs: true,
    });

    for (const sheetName of sourceWorkbook.SheetNames) {
      const sourceWs = sourceWorkbook.Sheets[sheetName];
      if (!sourceWs) continue;

      // Deep-copy the worksheet
      const targetWs: XLSX.WorkSheet = JSON.parse(JSON.stringify(sourceWs));

      // Apply changes
      const cols = findMonthCols(targetWs, month);
      if (cols) {
        // Delete rows: clear Hours and EFTE cells
        for (const dr of deleteRows) {
          const hoursAddr = cellAddr(dr.rowNumber, cols.hoursCol0);
          const efteAddr = cellAddr(dr.rowNumber, cols.efteCol0);
          if (targetWs[hoursAddr]) {
            targetWs[hoursAddr] = { t: "n", v: 0, w: "0" };
          }
          if (targetWs[efteAddr]) {
            targetWs[efteAddr] = { t: "n", v: 0, w: "0" };
          }
        }

        // Modify rows: recalculate and write new values
        for (const mr of modifyRows) {
          const currentHours = getCellValue(targetWs, mr.rowNumber, cols.hoursCol0);
          const currentEfte = getCellValue(targetWs, mr.rowNumber, cols.efteCol0);

          const newHours = calcNew(currentHours, mr.hoursAdjustment, mr.plusMinus, mr.divisor);
          const newEfte = calcNew(currentEfte, mr.efteAdjustment, mr.plusMinus, mr.divisor);

          if (newHours !== null) {
            const addr = cellAddr(mr.rowNumber, cols.hoursCol0);
            targetWs[addr] = { ...(targetWs[addr] ?? {}), t: "n", v: newHours, w: String(newHours) };
          }
          if (newEfte !== null) {
            const addr = cellAddr(mr.rowNumber, cols.efteCol0);
            targetWs[addr] = { ...(targetWs[addr] ?? {}), t: "n", v: newEfte, w: String(newEfte) };
          }
        }
      }

      // Ensure unique sheet name in master workbook
      let uniqueName = sheetName.slice(0, 31);
      let suffix = 2;
      while (usedSheetNames.has(uniqueName)) {
        const tag = `_${suffix++}`;
        uniqueName = sheetName.slice(0, 31 - tag.length) + tag;
      }
      usedSheetNames.add(uniqueName);

      XLSX.utils.book_append_sheet(masterWorkbook, targetWs, uniqueName);
    }
  }

  XLSX.writeFile(masterWorkbook, outputPath, { bookType: "xlsx", cellStyles: true });
}
