import ExcelJS from "exceljs";
import type { UploadedFile, DeleteRowConfig, ModifyRowConfig } from "./sessionStore.js";
import path from "path";
import fs from "fs";

const MONTHS_ORDER = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_ALIASES: Record<string, string> = {
  "Jan": "January", "Feb": "February", "Mar": "March", "Apr": "April",
  "May": "May", "Jun": "June", "Jul": "July", "Aug": "August",
  "Sep": "September", "Oct": "October", "Nov": "November", "Dec": "December",
  "Januar": "January", "Februar": "February", "März": "March",
  "Mai": "May", "Juni": "June", "Juli": "July",
  "Oktober": "October",
};

function normalizeMonth(m: string): string {
  return MONTH_ALIASES[m] || m;
}

export interface MonthColumnInfo {
  month: string;
  hoursCol: number;
  efteCol: number;
}

export async function analyzeExcelFile(filePath: string): Promise<{
  sheetNames: string[];
  detectedMonths: string[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheetNames: string[] = [];
  const monthSet = new Set<string>();

  workbook.eachSheet((sheet) => {
    sheetNames.push(sheet.name);

    // Scan rows 7 and 8 for month headers
    for (const rowNum of [7, 8, 9]) {
      const row = sheet.getRow(rowNum);
      row.eachCell((cell) => {
        const val = String(cell.value ?? "").trim();
        const normalized = normalizeMonth(val);
        if (
          MONTHS_ORDER.some((m) => normalizeMonth(m) === normalized) &&
          normalized.length > 2
        ) {
          monthSet.add(normalized);
        }
      });
    }
  });

  const detectedMonths = Array.from(monthSet).sort((a, b) => {
    const CANONICAL = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December",
    ];
    return CANONICAL.indexOf(a) - CANONICAL.indexOf(b);
  });

  return { sheetNames, detectedMonths };
}

function findMonthColumns(sheet: ExcelJS.Worksheet, month: string): MonthColumnInfo | null {
  let headerRow: ExcelJS.Row | null = null;
  let headerRowNum = 0;

  // Look in rows 7-10 for headers
  for (const rowNum of [8, 7, 9, 10]) {
    const row = sheet.getRow(rowNum);
    let hasMonthHeader = false;
    row.eachCell((cell) => {
      const val = String(cell.value ?? "").trim();
      const normalized = normalizeMonth(val);
      if (normalized === month) {
        hasMonthHeader = true;
      }
    });
    if (hasMonthHeader) {
      headerRow = row;
      headerRowNum = rowNum;
      break;
    }
  }

  if (!headerRow) return null;

  let monthColStart = -1;
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value ?? "").trim();
    if (normalizeMonth(val) === month && monthColStart === -1) {
      monthColStart = colNumber;
    }
  });

  if (monthColStart === -1) return null;

  // Hours col = monthColStart, EFTE col = monthColStart + 1 (or find by subheader)
  // Look for subheader row: Hours / EFTE
  let hoursCol = monthColStart;
  let efteCol = monthColStart + 1;

  const subHeaderRow = sheet.getRow(headerRowNum + 1);
  for (let c = monthColStart; c <= monthColStart + 2; c++) {
    const val = String(subHeaderRow.getCell(c).value ?? "").toLowerCase();
    if (val.includes("hour") || val.includes("stund")) hoursCol = c;
    if (val.includes("efte") || val.includes("fte")) efteCol = c;
  }

  return { month, hoursCol, efteCol };
}

function getCellNumericValue(sheet: ExcelJS.Worksheet, rowNum: number, colNum: number): number | null {
  const cell = sheet.getRow(rowNum).getCell(colNum);
  const v = cell.value;
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v.replace(",", "."));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
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

export async function previewChanges(
  files: UploadedFile[],
  month: string,
  deleteRows: DeleteRowConfig[],
  modifyRows: ModifyRowConfig[],
): Promise<{ deletePreview: PreviewDeleteRow[]; modifyPreview: PreviewModifyRow[] }> {
  const deletePreview: PreviewDeleteRow[] = [];
  const modifyPreview: PreviewModifyRow[] = [];

  for (const file of files) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.filePath);

    workbook.eachSheet((sheet) => {
      const cols = findMonthColumns(sheet, month);
      if (!cols) return;

      for (const dr of deleteRows) {
        const currentHours = getCellNumericValue(sheet, dr.rowNumber, cols.hoursCol);
        const currentEfte = getCellNumericValue(sheet, dr.rowNumber, cols.efteCol);
        deletePreview.push({
          rowNumber: dr.rowNumber,
          sheetName: sheet.name,
          currentHours,
          currentEfte,
        });
      }

      for (const mr of modifyRows) {
        const currentHours = getCellNumericValue(sheet, mr.rowNumber, cols.hoursCol);
        const currentEfte = getCellNumericValue(sheet, mr.rowNumber, cols.efteCol);

        let newHours: number | null = null;
        let newEfte: number | null = null;

        if (currentHours !== null) {
          const adjusted =
            mr.plusMinus === "-"
              ? currentHours - mr.hoursAdjustment
              : currentHours + mr.hoursAdjustment;
          newHours = mr.divisor !== 0 ? adjusted / mr.divisor : adjusted;
        }

        if (currentEfte !== null) {
          const adjusted =
            mr.plusMinus === "-"
              ? currentEfte - mr.efteAdjustment
              : currentEfte + mr.efteAdjustment;
          newEfte = mr.divisor !== 0 ? adjusted / mr.divisor : adjusted;
        }

        modifyPreview.push({
          rowNumber: mr.rowNumber,
          sheetName: sheet.name,
          currentHours,
          currentEfte,
          newHours,
          newEfte,
        });
      }
    });
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
  const masterWorkbook = new ExcelJS.Workbook();

  for (const file of files) {
    const sourceWorkbook = new ExcelJS.Workbook();
    await sourceWorkbook.xlsx.readFile(file.filePath);

    sourceWorkbook.eachSheet((sourceSheet) => {
      // Add each source sheet to master workbook
      const targetSheet = masterWorkbook.addWorksheet(sourceSheet.name, {
        properties: sourceSheet.properties,
        pageSetup: sourceSheet.pageSetup,
      });

      // Copy all rows and cells
      sourceSheet.eachRow({ includeEmpty: true }, (row, rowNum) => {
        const targetRow = targetSheet.getRow(rowNum);
        targetRow.height = row.height;
        targetRow.hidden = row.hidden;
        targetRow.outlineLevel = row.outlineLevel;

        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          const targetCell = targetRow.getCell(colNum);
          targetCell.value = cell.value;
          if (cell.style) {
            targetCell.style = { ...cell.style };
          }
        });
        targetRow.commit();
      });

      // Copy column widths
      sourceSheet.columns.forEach((col, idx) => {
        if (col && col.width) {
          targetSheet.getColumn(idx + 1).width = col.width;
        }
      });

      // Copy merged cells
      if (sourceSheet.hasMerges) {
        const merges = (sourceSheet as unknown as { _merges?: Record<string, { top: number; left: number; bottom: number; right: number }> })._merges;
        if (merges) {
          Object.values(merges).forEach((merge) => {
            try {
              targetSheet.mergeCells(merge.top, merge.left, merge.bottom, merge.right);
            } catch {}
          });
        }
      }

      // Now apply changes
      const cols = findMonthColumns(targetSheet, month);
      if (cols) {
        // Apply deletes
        for (const dr of deleteRows) {
          targetSheet.getRow(dr.rowNumber).getCell(cols.hoursCol).value = null;
          targetSheet.getRow(dr.rowNumber).getCell(cols.efteCol).value = null;
        }

        // Apply modifications
        for (const mr of modifyRows) {
          const currentHours = getCellNumericValue(targetSheet, mr.rowNumber, cols.hoursCol);
          const currentEfte = getCellNumericValue(targetSheet, mr.rowNumber, cols.efteCol);

          if (currentHours !== null) {
            const adjusted =
              mr.plusMinus === "-"
                ? currentHours - mr.hoursAdjustment
                : currentHours + mr.hoursAdjustment;
            const newHours = mr.divisor !== 0 ? adjusted / mr.divisor : adjusted;
            targetSheet.getRow(mr.rowNumber).getCell(cols.hoursCol).value = Math.round(newHours * 100) / 100;
          }

          if (currentEfte !== null) {
            const adjusted =
              mr.plusMinus === "-"
                ? currentEfte - mr.efteAdjustment
                : currentEfte + mr.efteAdjustment;
            const newEfte = mr.divisor !== 0 ? adjusted / mr.divisor : adjusted;
            targetSheet.getRow(mr.rowNumber).getCell(cols.efteCol).value = Math.round(newEfte * 100) / 100;
          }
        }
      }
    });
  }

  await masterWorkbook.xlsx.writeFile(outputPath);
}
