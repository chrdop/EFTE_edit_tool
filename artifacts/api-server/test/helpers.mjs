// Shared helpers for the API tests: start the built server, talk to it, read exported files.
// The tests run against dist/index.mjs (built by `pnpm test`), the same code that is deployed.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const here = path.dirname(fileURLToPath(import.meta.url));
export const apiDir = path.resolve(here, "..");
export const repoRoot = path.resolve(apiDir, "../..");
export const dummyDir = path.join(repoRoot, "EFTE_Dummy");
export const appVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, "artifacts/excel-tool/package.json"), "utf-8")).version;

export const PASSWORD = "test-password";
export const PORT = 18900 + Math.floor(Math.random() * 90);
export const BASE = `http://127.0.0.1:${PORT}/api`;

// The nine sanitized sample files only carry values for January–May, so tests process May.
export const MONTH = "May";

// Locations of the sample files in upload order (A2 of each file) and a few known May values.
export const LOC = {
  westbahnhof: "Leonardo Vienna Westbahnhof", // row 11: 1396 / 10.99, row 14: 320 / 2.58, row 1 empty
  linz: "Leonardo Boutique Linz City Center", // row 11: 1456.5 / 11.33
  smartAirport: "Leonardo Smart Vienna Airport", // no values in May
};

let server = null;
let workDir = null;
let token = null;

/** Starts the built API server on a random port in a throw-away working directory (uploads land there). */
export async function startServer() {
  const entry = path.join(apiDir, "dist/index.mjs");
  if (!fs.existsSync(entry)) throw new Error("dist/index.mjs missing — run `pnpm --filter @workspace/api-server run test` (it builds first).");
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "efte-api-test-"));
  server = spawn(process.execPath, [entry], {
    cwd: workDir,
    env: { ...process.env, PORT: String(PORT), APP_PASSWORD: PASSWORD, NODE_ENV: "production", LOG_LEVEL: "silent" },
    stdio: "ignore",
  });
  const deadline = Date.now() + 20000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error("API server did not start in time");
    await new Promise((r) => setTimeout(r, 150));
  }
  token = await login();
}

export async function stopServer() {
  if (server) {
    // Windows keeps the working directory locked until the process is gone
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
  }
  server = null;
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  workDir = null;
}

export async function login(password = PASSWORD) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return null;
  return (await res.json()).token;
}

/** fetch with the bearer token; returns { status, body } (body is parsed JSON, text or a Buffer). */
export async function api(method, urlPath, body, { auth = true } = {}) {
  const headers = {};
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: payload });
  const type = res.headers.get("content-type") ?? "";
  let parsed;
  if (type.includes("application/json")) parsed = await res.json();
  else if (type.startsWith("text/")) parsed = await res.text();
  else parsed = Buffer.from(await res.arrayBuffer());
  return { status: res.status, body: parsed, headers: res.headers };
}

export function sampleFiles(count) {
  return fs
    .readdirSync(dummyDir)
    .filter((f) => f.toLowerCase().endsWith(".xls"))
    .sort()
    .slice(0, count);
}

/** Creates a session with the sample files uploaded. `count` limits how many of the nine files are used. */
export async function newSession({ count, month = MONTH } = {}) {
  const created = await api("POST", "/sessions");
  const id = created.body.id;
  const form = new FormData();
  for (const name of sampleFiles(count ?? 99)) {
    form.append("files", new Blob([fs.readFileSync(path.join(dummyDir, name))]), name);
  }
  const up = await api("POST", `/sessions/${id}/upload`, form);
  if (up.status !== 200) throw new Error(`upload failed: ${up.status} ${JSON.stringify(up.body)}`);
  if (month) await api("PATCH", `/sessions/${id}`, { selectedMonth: month });
  return { id, files: up.body.files };
}

/** Sets the whole configuration of a session (everything not given is reset to empty). */
export async function configure(id, { deleteRows = [], modifyRows = [], karenzEntries = [], month } = {}) {
  const data = { deleteRows, modifyRows, karenzEntries };
  if (month) data.selectedMonth = month;
  const res = await api("PATCH", `/sessions/${id}`, data);
  if (res.status !== 200) throw new Error(`configure failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export const rule = (over = {}) => ({
  locationName: LOC.westbahnhof,
  rowNumber: 11,
  plusMinus: "+",
  hoursAdjustment: 0,
  efteAdjustment: 0,
  divisor: 0,
  remarks: "",
  ...over,
});

export const preview = (id) => api("POST", `/sessions/${id}/preview`).then((r) => r.body);

/** The modify-preview rows of one location. */
export const forLocation = (result, locationName, rowNumber) =>
  result.modifyPreview.filter((m) => m.locationName === locationName && (rowNumber === undefined || m.rowNumber === rowNumber));

/** Exports a session and returns the parsed master workbook plus the change-report text. */
export async function exportSession(id) {
  const exp = await api("POST", `/sessions/${id}/export`);
  if (exp.status !== 200) throw new Error(`export failed: ${exp.status} ${JSON.stringify(exp.body)}`);
  const xlsx = await api("GET", `/sessions/${id}/download`);
  const report = await api("GET", `/sessions/${id}/download-pdf`);
  return { exp: exp.body, workbook: XLSX.read(xlsx.body), xlsxResponse: xlsx, report: report.body };
}

/** Hours / EFTE of a row in the n-th sheet of an exported master workbook (finds the month block like the server does). */
const MONTH_NAMES = { may: ["may", "mai"] }; // the sample files label the month in German or English

export function masterRow(workbook, sheetIndex, month, rowNumber) {
  const names = MONTH_NAMES[month.toLowerCase()] ?? [month.toLowerCase()];
  const ws = workbook.Sheets[workbook.SheetNames[sheetIndex]];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = 0; r < 20; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      if (!names.includes(String(ws[XLSX.utils.encode_cell({ r, c })]?.v ?? "").trim().toLowerCase())) continue;
      let hoursCol = -1;
      let efteCol = -1;
      for (let k = c; k <= c + 3; k++) {
        const label = String(ws[XLSX.utils.encode_cell({ r: r + 1, c: k })]?.v ?? "").toLowerCase();
        if (hoursCol === -1 && label.includes("hour")) hoursCol = k;
        if (efteCol === -1 && label.includes("efte")) efteCol = k;
      }
      if (hoursCol === -1 || efteCol === -1) continue;
      const read = (col) => {
        const cell = ws[XLSX.utils.encode_cell({ r: rowNumber - 1, c: col })];
        return cell && typeof cell.v === "number" ? cell.v : null;
      };
      return { hours: read(hoursCol), efte: read(efteCol) };
    }
  }
  throw new Error(`month block "${month}" not found in sheet ${sheetIndex}`);
}

/** Extracts the playbook JSON from a change report. */
export function parsePlaybook(reportText) {
  const begin = "<<<EFTE-PLAYBOOK-BEGIN>>>";
  const end = "<<<EFTE-PLAYBOOK-END>>>";
  const a = reportText.indexOf(begin);
  const b = reportText.indexOf(end);
  if (a < 0 || b < a) return null;
  return JSON.parse(reportText.slice(a + begin.length, b));
}
