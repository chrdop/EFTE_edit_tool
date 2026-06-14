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
  locationName: string;
}> {
  const workbook = XLSX.readFile(filePath, {
    cellStyles: true,
    cellFormula: true,
    cellDates: true,
    sheetStubs: true,
  });

  const sheetNames = workbook.SheetNames;
  const monthSet = new Set<string>();
  let locationName = "";

  for (const sheetName of sheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;

    // Extract location name from A2 (row index 1, col index 0)
    if (!locationName) {
      const a2 = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })];
      if (a2?.v) locationName = String(a2.v).trim();
    }

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

  return { sheetNames, detectedMonths, locationName };
}

export interface RowCurrentValue {
  rowNumber: number;
  hours: number | null;
  efte: number | null;
}

export interface ReadValuesItem {
  locationName: string;
  rowNumber: number;
}

export async function readCurrentValues(
  files: UploadedFile[],
  month: string,
  items: ReadValuesItem[],
): Promise<RowCurrentValue[]> {
  // Group items by locationName to avoid re-reading the same file multiple times
  const byLocation = new Map<string, number[]>();
  for (const item of items) {
    if (!byLocation.has(item.locationName)) byLocation.set(item.locationName, []);
    byLocation.get(item.locationName)!.push(item.rowNumber);
  }

  // Build a result map keyed by "locationName:rowNumber"
  const resultMap = new Map<string, RowCurrentValue>();

  for (const [locationName, rowNumbers] of byLocation) {
    const file = files.find((f) => f.locationName === locationName);
    if (!file) {
      for (const r of rowNumbers) resultMap.set(`${locationName}:${r}`, { rowNumber: r, hours: null, efte: null });
      continue;
    }

    const workbook = XLSX.readFile(file.filePath, { cellStyles: true, cellFormula: true });
    let found = false;
    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;
      const cols = findMonthCols(ws, month);
      if (!cols) continue;
      for (const rowNumber of rowNumbers) {
        resultMap.set(`${locationName}:${rowNumber}`, {
          rowNumber,
          hours: getCellValue(ws, rowNumber, cols.hoursCol0),
          efte: getCellValue(ws, rowNumber, cols.efteCol0),
        });
      }
      found = true;
      break;
    }
    if (!found) {
      for (const r of rowNumbers) resultMap.set(`${locationName}:${r}`, { rowNumber: r, hours: null, efte: null });
    }
  }

  // Return in original order
  return items.map((item) => resultMap.get(`${item.locationName}:${item.rowNumber}`) ?? { rowNumber: item.rowNumber, hours: null, efte: null });
}

export interface PreviewDeleteRow {
  rowNumber: number;
  sheetName: string;
  locationName: string;
  currentHours: number | null;
  currentEfte: number | null;
}

export interface PreviewModifyRow {
  rowNumber: number;
  sheetName: string;
  locationName: string;
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

interface PrecomputedValue {
  newHours: number | null;
  newEfte: number | null;
}

/**
 * For each "all-locations" rule (divisor > 0), pre-read the source location file
 * and compute the new Hours/EFTE value once. That computed value is then written
 * to every location — not each location's own value adjusted individually.
 */
function precomputeSourceValues(
  files: UploadedFile[],
  month: string,
  modifyRows: ModifyRowConfig[],
): Map<string, PrecomputedValue> {
  const map = new Map<string, PrecomputedValue>();

  for (const mr of modifyRows) {
    if (mr.divisor === 0) continue; // single-location rules don't need pre-computation
    const key = `${mr.locationName}:${mr.rowNumber}`;
    if (map.has(key)) continue;

    const sourceFile = files.find((f) => f.locationName === mr.locationName);
    if (!sourceFile) {
      map.set(key, { newHours: null, newEfte: null });
      continue;
    }

    const wb = XLSX.readFile(sourceFile.filePath, { cellStyles: true, cellFormula: true });
    let found = false;
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const cols = findMonthCols(ws, month);
      if (!cols) continue;
      const sourceHours = getCellValue(ws, mr.rowNumber, cols.hoursCol0);
      const sourceEfte = getCellValue(ws, mr.rowNumber, cols.efteCol0);
      map.set(key, {
        newHours: calcNew(sourceHours, mr.hoursAdjustment, mr.plusMinus, mr.divisor),
        newEfte: calcNew(sourceEfte, mr.efteAdjustment, mr.plusMinus, mr.divisor),
      });
      found = true;
      break;
    }
    if (!found) map.set(key, { newHours: null, newEfte: null });
  }

  return map;
}

export async function previewChanges(
  files: UploadedFile[],
  month: string,
  deleteRows: DeleteRowConfig[],
  modifyRows: ModifyRowConfig[],
): Promise<{ deletePreview: PreviewDeleteRow[]; modifyPreview: PreviewModifyRow[] }> {
  const deletePreview: PreviewDeleteRow[] = [];
  const modifyPreview: PreviewModifyRow[] = [];

  // Pre-compute new values from the source location for all-locations rules
  const sourceValues = precomputeSourceValues(files, month, modifyRows);

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
          locationName: file.locationName,
          currentHours: getCellValue(ws, dr.rowNumber, cols.hoursCol0),
          currentEfte: getCellValue(ws, dr.rowNumber, cols.efteCol0),
        });
      }

      for (const mr of modifyRows) {
        // divisor=0: only apply to matching location; divisor>0: apply to all locations
        const appliesToThisFile = mr.divisor !== 0 || file.locationName === mr.locationName;
        if (!appliesToThisFile) continue;

        const currentHours = getCellValue(ws, mr.rowNumber, cols.hoursCol0);
        const currentEfte = getCellValue(ws, mr.rowNumber, cols.efteCol0);

        let newHours: number | null;
        let newEfte: number | null;

        if (mr.divisor !== 0) {
          // All-locations: use the pre-computed value from the source location
          const pre = sourceValues.get(`${mr.locationName}:${mr.rowNumber}`);
          newHours = pre?.newHours ?? null;
          newEfte = pre?.newEfte ?? null;
        } else {
          // Single-location: compute from this file's own current value
          newHours = calcNew(currentHours, mr.hoursAdjustment, mr.plusMinus, mr.divisor);
          newEfte = calcNew(currentEfte, mr.efteAdjustment, mr.plusMinus, mr.divisor);
        }

        modifyPreview.push({
          rowNumber: mr.rowNumber,
          sheetName,
          locationName: file.locationName,
          currentHours,
          currentEfte,
          newHours,
          newEfte,
        });
      }
    }
  }

  return { deletePreview, modifyPreview };
}

export interface RowLabel {
  rowNumber: number;
  label: string;
}

/**
 * Reads column A of the first uploaded file and returns all rows that have
 * a non-empty text value — used to populate the row-number dropdown in the UI.
 */
export async function listDataRows(files: UploadedFile[]): Promise<RowLabel[]> {
  if (files.length === 0) return [];
  const file = files[0];
  const workbook = XLSX.readFile(file.filePath, { cellFormula: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const ws = workbook.Sheets[sheetName];
  if (!ws || !ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const result: RowLabel[] = [];
  for (let r = 0; r <= range.e.r; r++) {
    const cellA = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!cellA || cellA.v === null || cellA.v === undefined) continue;
    const label = String(cellA.v).trim();
    if (!label) continue;
    result.push({ rowNumber: r + 1, label });
  }
  return result;
}

export async function buildMasterExcel(
  files: UploadedFile[],
  month: string,
  deleteRows: DeleteRowConfig[],
  modifyRows: ModifyRowConfig[],
  outputPath: string,
): Promise<void> {
  const masterWorkbook = XLSX.utils.book_new();

  // Pre-compute new values from source locations for all-locations rules
  const sourceValues = precomputeSourceValues(files, month, modifyRows);

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
        // divisor=0 → only apply to matching location using its own current value
        // divisor>0 → write the pre-computed value (from source location) to all locations
        for (const mr of modifyRows) {
          const appliesToThisFile = mr.divisor !== 0 || file.locationName === mr.locationName;
          if (!appliesToThisFile) continue;

          let newHours: number | null;
          let newEfte: number | null;

          if (mr.divisor !== 0) {
            // All-locations: use the value pre-computed from the source location
            const pre = sourceValues.get(`${mr.locationName}:${mr.rowNumber}`);
            newHours = pre?.newHours ?? null;
            newEfte = pre?.newEfte ?? null;
          } else {
            // Single-location: compute from this file's own current value
            const currentHours = getCellValue(targetWs, mr.rowNumber, cols.hoursCol0);
            const currentEfte = getCellValue(targetWs, mr.rowNumber, cols.efteCol0);
            newHours = calcNew(currentHours, mr.hoursAdjustment, mr.plusMinus, mr.divisor);
            newEfte = calcNew(currentEfte, mr.efteAdjustment, mr.plusMinus, mr.divisor);
          }

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

      // Use cell A2 value as sheet name (contains the location/Standort name)
      const a2Cell = targetWs["A2"];
      const a2Value = a2Cell ? String(a2Cell.v ?? "").trim() : "";
      const baseName = (a2Value || sheetName).slice(0, 31);

      // Ensure unique sheet name in master workbook
      let uniqueName = baseName;
      let suffix = 2;
      while (usedSheetNames.has(uniqueName)) {
        const tag = `_${suffix++}`;
        uniqueName = baseName.slice(0, 31 - tag.length) + tag;
      }
      usedSheetNames.add(uniqueName);

      XLSX.utils.book_append_sheet(masterWorkbook, targetWs, uniqueName);
    }
  }

  XLSX.writeFile(masterWorkbook, outputPath, { bookType: "xlsx", cellStyles: true });
}
