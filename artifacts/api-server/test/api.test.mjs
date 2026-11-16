// API tests: run the built server against the sanitized sample files in EFTE_Dummy/ (May values)
// through the real HTTP routes — login → upload → configure → preview / export → change report.
// Run with: pnpm --filter @workspace/api-server run test
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BASE,
  LOC,
  MONTH,
  api,
  appVersion,
  configure,
  exportSession,
  forLocation,
  login,
  masterRow,
  newSession,
  parsePlaybook,
  preview,
  rule,
  startServer,
  stopServer,
} from "./helpers.mjs";

const NOT_FOUND_ID = "00000000-0000-4000-8000-000000000000";
const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg ?? ""} expected ${expected}, got ${actual}`);
const warned = (result, fragment) => result.warnings.some((w) => w.includes(fragment));

let main; // session with all nine sample files, reconfigured by each test

before(async () => {
  await startServer();
  main = await newSession();
});
after(stopServer);

describe("auth and request validation", () => {
  it("health check is public", async () => {
    const res = await fetch(`${BASE}/healthz`);
    assert.equal(res.status, 200);
  });

  it("rejects a wrong password and accepts the right one", async () => {
    assert.equal(await login("wrong"), null);
    assert.ok(await login());
  });

  it("session routes need a valid bearer token", async () => {
    assert.equal((await api("POST", "/sessions", undefined, { auth: false })).status, 401);
    const res = await fetch(`${BASE}/sessions`, { method: "POST", headers: { Authorization: "Bearer not-a-token" } });
    assert.equal(res.status, 401);
  });

  it("unknown session → 404", async () => {
    assert.equal((await api("GET", `/sessions/${NOT_FOUND_ID}`)).status, 404);
    assert.equal((await api("POST", `/sessions/${NOT_FOUND_ID}/preview`)).status, 404);
  });

  it("rejects an invalid mode and an invalid entry kind (400)", async () => {
    const bad = await api("PATCH", `/sessions/${main.id}`, { modifyRows: [rule({ plusMinus: "*" })] });
    assert.equal(bad.status, 400);
    const badKind = await api("PATCH", `/sessions/${main.id}`, {
      karenzEntries: [{ kind: "vacation", locationName: LOC.westbahnhof, rowNumber: 11 }],
    });
    assert.equal(badKind.status, 400);
  });

  it("preview, export and read-values need files and a month", async () => {
    const empty = await api("POST", "/sessions");
    assert.equal((await api("POST", `/sessions/${empty.body.id}/preview`)).status, 400);
    assert.equal((await api("POST", `/sessions/${empty.body.id}/export`)).status, 400);

    const noMonth = await newSession({ count: 1, month: null });
    assert.equal((await api("POST", `/sessions/${noMonth.id}/preview`)).status, 400);
    assert.equal((await api("POST", `/sessions/${noMonth.id}/read-values`, { items: [] })).status, 400);
  });

  it("download before export → 404", async () => {
    const s = await newSession({ count: 1 });
    assert.equal((await api("GET", `/sessions/${s.id}/download`)).status, 404);
    assert.equal((await api("GET", `/sessions/${s.id}/download-pdf`)).status, 404);
  });
});

describe("upload", () => {
  it("reads location names and months from all nine sample files", () => {
    assert.equal(main.files.length, 9);
    assert.equal(main.files[0].locationName, LOC.westbahnhof);
    assert.equal(main.files[1].locationName, LOC.linz);
    assert.equal(new Set(main.files.map((f) => f.locationName)).size, 9);
    for (const f of main.files) assert.ok(f.detectedMonths.includes(MONTH), `${f.locationName} has ${MONTH}`);
  });

  it("refuses a file with a wrong extension and keeps running", async () => {
    const s = await api("POST", "/sessions");
    const form = new FormData();
    form.append("files", new Blob(["hello"]), "notes.txt");
    const res = await api("POST", `/sessions/${s.body.id}/upload`, form);
    assert.notEqual(res.status, 200);
    assert.equal((await fetch(`${BASE}/healthz`)).status, 200);
  });

  it("read-values returns the current values (null for empty cells, nulls for unknown locations)", async () => {
    await configure(main.id);
    const res = await api("POST", `/sessions/${main.id}/read-values`, {
      items: [
        { locationName: LOC.westbahnhof, rowNumber: 11 },
        { locationName: LOC.westbahnhof, rowNumber: 1 },
        { locationName: LOC.linz, rowNumber: 11 },
        { locationName: "Nowhere", rowNumber: 11 },
      ],
    });
    assert.equal(res.status, 200);
    const [a, b, c, d] = res.body.values;
    assert.deepEqual([a.hours, a.efte], [1396, 10.99]);
    assert.deepEqual([b.hours, b.efte], [null, null]);
    assert.deepEqual([c.hours, c.efte], [1456.5, 11.33]);
    assert.deepEqual([d.hours, d.efte], [null, null]);
  });
});

describe("adjustment rules — own location", () => {
  it("+ adds to the current value, only at the selected location", async () => {
    await configure(main.id, { modifyRows: [rule({ plusMinus: "+", hoursAdjustment: 100, efteAdjustment: 1 })] });
    const p = await preview(main.id);
    assert.equal(p.modifyPreview.length, 1);
    const [m] = p.modifyPreview;
    assert.equal(m.locationName, LOC.westbahnhof);
    assert.deepEqual([m.currentHours, m.currentEfte], [1396, 10.99]);
    assert.deepEqual([m.newHours, m.newEfte], [1496, 11.99]);
  });

  it("− subtracts", async () => {
    await configure(main.id, { modifyRows: [rule({ plusMinus: "-", hoursAdjustment: 96, efteAdjustment: 0.99 })] });
    const [m] = (await preview(main.id)).modifyPreview;
    assert.deepEqual([m.newHours, m.newEfte], [1300, 10]);
  });

  it("= overwrites with the entered value, unrounded", async () => {
    await configure(main.id, { modifyRows: [rule({ plusMinus: "=", hoursAdjustment: 5.555, efteAdjustment: 0.123 })] });
    const [m] = (await preview(main.id)).modifyPreview;
    assert.deepEqual([m.newHours, m.newEfte], [5.555, 0.123]);
  });

  it("= also writes into an empty cell, + leaves an empty cell empty", async () => {
    await configure(main.id, { modifyRows: [rule({ rowNumber: 1, plusMinus: "=", hoursAdjustment: 7, efteAdjustment: 0.5 })] });
    let [m] = (await preview(main.id)).modifyPreview;
    assert.deepEqual([m.currentHours, m.newHours, m.newEfte], [null, 7, 0.5]);

    await configure(main.id, { modifyRows: [rule({ rowNumber: 1, plusMinus: "+", hoursAdjustment: 7, efteAdjustment: 0.5 })] });
    [m] = (await preview(main.id)).modifyPreview;
    assert.deepEqual([m.newHours, m.newEfte], [null, null]);
  });

  it("= with a field left at 0 writes 0", async () => {
    await configure(main.id, { modifyRows: [rule({ plusMinus: "=", hoursAdjustment: 0, efteAdjustment: 2 })] });
    const [m] = (await preview(main.id)).modifyPreview;
    assert.deepEqual([m.newHours, m.newEfte], [0, 2]);
  });
});

describe("adjustment rules — all locations", () => {
  it("+ is computed from the source location, divided by the number of locations and written to every location", async () => {
    await configure(main.id, {
      modifyRows: [rule({ rowNumber: 14, plusMinus: "+", hoursAdjustment: 80, efteAdjustment: 0.42, divisor: 1 })],
    });
    const p = await preview(main.id);
    assert.equal(p.modifyPreview.length, 9);
    assert.equal(new Set(p.modifyPreview.map((m) => m.locationName)).size, 9);
    for (const m of p.modifyPreview) {
      near(m.newHours, 44.44, m.locationName); // (320 + 80) / 9
      near(m.newEfte, 0.33, m.locationName); // (2.58 + 0.42) / 9
    }
  });

  it("the divisor value only matters as 0 vs. > 0", async () => {
    await configure(main.id, {
      modifyRows: [rule({ rowNumber: 14, plusMinus: "+", hoursAdjustment: 80, efteAdjustment: 0.42, divisor: 7 })],
    });
    const p = await preview(main.id);
    for (const m of p.modifyPreview) near(m.newHours, 44.44);
  });

  it("− and = divide by N as well", async () => {
    await configure(main.id, {
      modifyRows: [rule({ rowNumber: 14, plusMinus: "-", hoursAdjustment: 20, efteAdjustment: 0.18, divisor: 1 })],
    });
    for (const m of (await preview(main.id)).modifyPreview) {
      near(m.newHours, 33.33); // (320 - 20) / 9
      near(m.newEfte, 0.27); // (2.58 - 0.18) / 9
    }
    await configure(main.id, {
      modifyRows: [rule({ rowNumber: 14, plusMinus: "=", hoursAdjustment: 90, efteAdjustment: 0.9, divisor: 1 })],
    });
    for (const m of (await preview(main.id)).modifyPreview) {
      near(m.newHours, 10);
      near(m.newEfte, 0.1);
    }
  });

  it("N is the number of uploaded files (two files → ÷ 2)", async () => {
    const two = await newSession({ count: 2 });
    await configure(two.id, { modifyRows: [rule({ rowNumber: 14, plusMinus: "+", divisor: 1 })] });
    const p = await preview(two.id);
    assert.equal(p.modifyPreview.length, 2);
    for (const m of p.modifyPreview) {
      near(m.newHours, 160); // 320 / 2
      near(m.newEfte, 1.29); // 2.58 / 2
    }
  });
});

describe("delete rows", () => {
  it("clears the rows at every location (preview and export)", async () => {
    await configure(main.id, { deleteRows: [{ rowNumber: 11 }, { rowNumber: 14 }] });
    const p = await preview(main.id);
    assert.equal(p.deletePreview.length, 18);
    assert.equal(p.skipped.length, 0);

    const { workbook, xlsxResponse } = await exportSession(main.id);
    assert.match(xlsxResponse.headers.get("content-type"), /spreadsheetml/);
    assert.equal(workbook.SheetNames.length, 9);
    for (let i = 0; i < 9; i++) {
      assert.deepEqual(masterRow(workbook, i, MONTH, 11), { hours: 0, efte: 0 }, `sheet ${i} row 11`);
    }
    // rows that were not listed stay untouched
    assert.deepEqual(masterRow(workbook, 0, MONTH, 31), { hours: 144, efte: 1.16 });
  });
});

describe("export", () => {
  it("writes the rule results into the master workbook and leaves other locations alone", async () => {
    await configure(main.id, { modifyRows: [rule({ plusMinus: "+", hoursAdjustment: 100, efteAdjustment: 1 })] });
    const { exp, workbook } = await exportSession(main.id);
    assert.equal(exp.filename, `Master_Cluster_Austria_EFTE_${MONTH}.xlsx`);
    assert.equal(exp.pdfFilename, `Change_Report_${MONTH}.txt`);
    assert.deepEqual(masterRow(workbook, 0, MONTH, 11), { hours: 1496, efte: 11.99 });
    assert.deepEqual(masterRow(workbook, 1, MONTH, 11), { hours: 1456.5, efte: 11.33 });
  });

  it("an all-locations rule is written to every sheet", async () => {
    await configure(main.id, {
      modifyRows: [rule({ rowNumber: 14, plusMinus: "=", hoursAdjustment: 90, efteAdjustment: 0.9, divisor: 1 })],
    });
    const { workbook } = await exportSession(main.id);
    for (let i = 0; i < 9; i++) {
      assert.deepEqual(masterRow(workbook, i, MONTH, 14), { hours: 10, efte: 0.1 }, `sheet ${i}`);
    }
  });

  it("a month that is missing in the files is reported as skipped, never dropped silently", async () => {
    await configure(main.id, { month: "December", deleteRows: [{ rowNumber: 11 }] });
    const p = await preview(main.id);
    assert.equal(p.skipped.length, 9);
    const { report } = await exportSession(main.id);
    assert.match(report, /SKIPPED LOCATIONS/);
    await configure(main.id, { month: MONTH });
  });
});

describe("parental leave / other cluster / reallocation entries", () => {
  const entry = (over = {}) => ({ kind: "karenz", name: "Test Person", locationName: LOC.westbahnhof, rowNumber: 11, hours: 100, efte: 1, ...over });

  it("parental leave subtracts from the original values (no rule on the row)", async () => {
    await configure(main.id, { karenzEntries: [entry()] });
    const p = await preview(main.id);
    const [m] = forLocation(p, LOC.westbahnhof, 11);
    assert.deepEqual([m.currentHours, m.newHours, m.newEfte], [1396, 1296, 9.99]);
    assert.match(m.remarks, /Parental leave: Test Person/);
  });

  it("several entries on one cell are summed", async () => {
    await configure(main.id, { karenzEntries: [entry(), entry({ name: "Second", hours: 50, efte: 0.5 })] });
    const [m] = forLocation(await preview(main.id), LOC.westbahnhof, 11);
    assert.deepEqual([m.newHours, m.newEfte], [1246, 9.49]);
  });

  it("reallocation subtracts like parental leave", async () => {
    await configure(main.id, { karenzEntries: [entry({ kind: "reallocation" })] });
    const [m] = forLocation(await preview(main.id), LOC.westbahnhof, 11);
    assert.deepEqual([m.newHours, m.newEfte], [1296, 9.99]);
    assert.match(m.remarks, /Reallocation/);
  });

  it("other cluster sets the row to 0", async () => {
    await configure(main.id, { karenzEntries: [entry({ kind: "cluster", hours: undefined, efte: undefined })] });
    const [m] = forLocation(await preview(main.id), LOC.westbahnhof, 11);
    assert.deepEqual([m.newHours, m.newEfte], [0, 0]);
    assert.match(m.remarks, /Other cluster/);
  });

  it("the rules work on the reduced base (+/−)", async () => {
    await configure(main.id, {
      karenzEntries: [entry()],
      modifyRows: [rule({ plusMinus: "+", hoursAdjustment: 10, efteAdjustment: 0.5 })],
    });
    const [m] = forLocation(await preview(main.id), LOC.westbahnhof, 11);
    assert.deepEqual([m.newHours, m.newEfte], [1306, 10.49]); // (1396 − 100) + 10, (10.99 − 1) + 0.5
  });

  it("an all-locations rule uses the reduced source value", async () => {
    await configure(main.id, {
      karenzEntries: [entry()],
      modifyRows: [rule({ plusMinus: "+", divisor: 1 })],
    });
    const p = await preview(main.id);
    for (const m of p.modifyPreview) {
      near(m.newHours, 144); // (1396 − 100) / 9
      near(m.newEfte, 1.11); // (10.99 − 1) / 9
    }
  });

  it("read-values reports the removal and the base value", async () => {
    await configure(main.id, { karenzEntries: [entry()] });
    const res = await api("POST", `/sessions/${main.id}/read-values`, { items: [{ locationName: LOC.westbahnhof, rowNumber: 11 }] });
    const [v] = res.body.values;
    assert.deepEqual([v.hours, v.baseHours, v.karenzHours, v.karenzEfte, v.clusterRemoved], [1396, 1296, 100, 1, false]);
  });

  it("export writes the reduced value when no rule touches the row", async () => {
    await configure(main.id, { karenzEntries: [entry()] });
    const { workbook } = await exportSession(main.id);
    assert.deepEqual(masterRow(workbook, 0, MONTH, 11), { hours: 1296, efte: 9.99 });
  });

  it("entries on a row cleared by Delete rows are ignored, with a warning", async () => {
    await configure(main.id, { deleteRows: [{ rowNumber: 11 }], karenzEntries: [entry()] });
    const p = await preview(main.id);
    assert.equal(forLocation(p, LOC.westbahnhof, 11).length, 0);
    assert.ok(warned(p, 'cleared by "Delete rows"'));
    const res = await api("POST", `/sessions/${main.id}/read-values`, { items: [{ locationName: LOC.westbahnhof, rowNumber: 11 }] });
    assert.equal(res.body.values[0].karenzHours, 0);
  });

  it("warns when the location is not uploaded", async () => {
    await configure(main.id, { karenzEntries: [entry({ locationName: "Nowhere" })] });
    const p = await preview(main.id);
    assert.ok(warned(p, "not among the uploaded files"));
  });

  it("warns about a negative result", async () => {
    await configure(main.id, { karenzEntries: [entry({ hours: 2000 })] });
    assert.ok(warned(await preview(main.id), "negative"));
  });

  it("warns when the cell is empty", async () => {
    await configure(main.id, { karenzEntries: [entry({ rowNumber: 1 })] });
    assert.ok(warned(await preview(main.id), "no value"));
  });

  it("the last rule on a cell decides: a = rule overwrites the entry, with a warning", async () => {
    await configure(main.id, {
      karenzEntries: [entry()],
      modifyRows: [rule({ plusMinus: "=", hoursAdjustment: 5, efteAdjustment: 0.5 })],
    });
    const p = await preview(main.id);
    const [m] = forLocation(p, LOC.westbahnhof, 11);
    assert.deepEqual([m.newHours, m.newEfte], [5, 0.5]);
    assert.ok(warned(p, "overwritten by an adjustment rule"));
  });

  it("an entry at a location that an all-locations rule from another location overwrites gets a warning", async () => {
    await configure(main.id, {
      karenzEntries: [entry({ locationName: LOC.linz })],
      modifyRows: [rule({ plusMinus: "+", divisor: 1 })], // source Westbahnhof
    });
    assert.ok(warned(await preview(main.id), "overwritten by an adjustment rule"));
  });

  it("return month: warns once it is reached, stays quiet while it is in the future", async () => {
    await configure(main.id, { karenzEntries: [entry({ returnMonth: "2020-01" })] });
    const reached = await preview(main.id);
    assert.ok(warned(reached, "is reached") || warned(reached, "could not be checked"), JSON.stringify(reached.warnings));

    await configure(main.id, { karenzEntries: [entry({ returnMonth: "2099-12" })] });
    const future = await preview(main.id);
    assert.ok(!warned(future, "is reached"));
  });
});

describe("rule and playbook warnings", () => {
  it("a pending rule is reported", async () => {
    await configure(main.id, { modifyRows: [rule({ pending: true })] });
    assert.ok(warned(await preview(main.id), "amounts not entered or confirmed"));
  });

  it("a source location that is not uploaded is reported, except for = in all-locations scope", async () => {
    await configure(main.id, { modifyRows: [rule({ locationName: "Nowhere", plusMinus: "+" })] });
    assert.ok(warned(await preview(main.id), "source location is not among the uploaded files"));

    await configure(main.id, { modifyRows: [rule({ locationName: "Nowhere", plusMinus: "=", divisor: 1, hoursAdjustment: 9 })] });
    assert.ok(!warned(await preview(main.id), "source location"));
  });

  it("checks month and location count of the loaded playbook", async () => {
    const patch = (playbookSource) => api("PATCH", `/sessions/${main.id}`, { playbookSource });
    await configure(main.id);

    await patch({ month: "April", locationCount: 9, fileName: "Change_Report_April.txt" });
    assert.deepEqual((await preview(main.id)).warnings, []);

    await patch({ month: "March", locationCount: 9 });
    assert.ok(warned(await preview(main.id), "not the following month"));

    await patch({ month: "May", locationCount: 9 });
    assert.ok(warned(await preview(main.id), "same month"));

    await patch({ month: "April", locationCount: 4 });
    assert.ok(warned(await preview(main.id), "Number of locations changed"));
  });
});

describe("change report and playbook", () => {
  it("carries the app version, the results and the warnings", async () => {
    main = await newSession(); // fresh session: no playbookSource left over
    await configure(main.id, {
      deleteRows: [{ rowNumber: 31 }],
      modifyRows: [rule({ plusMinus: "+", hoursAdjustment: 100, efteAdjustment: 1, remarks: "Test rule" })],
      karenzEntries: [{ kind: "karenz", name: "Test Person", locationName: LOC.linz, rowNumber: 11, hours: 10, efte: 0.1, returnMonth: "2099-12" }],
    });
    const { report, xlsxResponse } = await exportSession(main.id);
    assert.equal(xlsxResponse.status, 200);
    assert.match(report, new RegExp(`Created by: EFTE Merge & Edit Tool v${appVersion.replace(/\./g, "\\.")}`));
    assert.match(report, /Month\s+: May/);
    assert.match(report, /Locations : 9/);
    assert.match(report, /DELETED ROWS/);
    assert.match(report, /ADJUSTED ROWS/);
    assert.match(report, /Test rule/);
    assert.match(report, /Parental leave/);
  });

  it("ends with a machine-readable playbook that stores amounts only as 'previous' values", async () => {
    await configure(main.id, {
      deleteRows: [{ rowNumber: 17 }, { rowNumber: 18 }],
      modifyRows: [
        rule({ plusMinus: "+", hoursAdjustment: 12.5, efteAdjustment: 0.1, remarks: "own rule" }),
        rule({ rowNumber: 14, plusMinus: "=", hoursAdjustment: 90, efteAdjustment: 0.9, divisor: 1 }),
        rule({ rowNumber: 23, plusMinus: "-", hoursAdjustment: 0, efteAdjustment: 0, pending: true, previousHoursAdjustment: 33, previousEfteAdjustment: 0.25 }),
        rule({ rowNumber: 25, plusMinus: "=", hoursAdjustment: 0, efteAdjustment: 0, pending: true }),
      ],
      karenzEntries: [
        { kind: "karenz", name: "A", locationName: LOC.linz, rowNumber: 11, hours: 10, efte: 0.1, returnMonth: "2099-12" },
        { kind: "cluster", name: "B", locationName: LOC.linz, rowNumber: 17 },
        { kind: "reallocation", name: "C", locationName: LOC.westbahnhof, rowNumber: 14, hours: 5, efte: 0.05 },
      ],
    });
    const { report } = await exportSession(main.id);
    const pb = parsePlaybook(report);
    assert.ok(pb, "playbook block present");
    assert.equal(pb.format, "efte-playbook");
    assert.equal(pb.formatVersion, 1);
    assert.equal(pb.month, MONTH);
    assert.equal(pb.locationCount, 9);
    assert.deepEqual(pb.deleteRows, [{ rowNumber: 17 }, { rowNumber: 18 }]);

    assert.deepEqual(pb.karenzEntries.map((k) => k.kind), ["karenz", "cluster", "reallocation"]);
    assert.equal(pb.karenzEntries[0].returnMonth, "2099-12");
    assert.equal(pb.karenzEntries[1].hours, undefined); // a cluster entry has no amounts
    assert.equal(pb.karenzEntries[2].returnMonth, undefined); // reallocation has no return month

    const [own, all, pendingPrev, pendingNew] = pb.rules;
    assert.deepEqual([own.scope, own.plusMinus, own.previousHoursAdjustment, own.previousEfteAdjustment], ["own", "+", 12.5, 0.1]);
    assert.deepEqual([all.scope, all.plusMinus, all.previousHoursAdjustment], ["all", "=", 90]);
    // a rule still pending keeps the last real amounts instead of the unconfirmed 0
    assert.deepEqual([pendingPrev.previousHoursAdjustment, pendingPrev.previousEfteAdjustment], [33, 0.25]);
    assert.deepEqual([pendingNew.previousHoursAdjustment, pendingNew.previousEfteAdjustment], [0, 0]);
    for (const r of pb.rules) {
      assert.equal(r.hoursAdjustment, undefined, "amounts must not be stored as current values");
      assert.equal(r.efteAdjustment, undefined);
    }
  });

  it("a playbook can be replayed: its rules and entries are accepted and give the same preview", async () => {
    const before = await preview(main.id);
    const { report } = await exportSession(main.id);
    const pb = parsePlaybook(report);

    const next = await newSession();
    const patch = await api("PATCH", `/sessions/${next.id}`, {
      deleteRows: pb.deleteRows,
      karenzEntries: pb.karenzEntries,
      modifyRows: pb.rules.map((r) => ({
        locationName: r.locationName,
        rowNumber: r.rowNumber,
        plusMinus: r.plusMinus,
        hoursAdjustment: r.previousHoursAdjustment,
        efteAdjustment: r.previousEfteAdjustment,
        divisor: r.scope === "all" ? 1 : 0,
        remarks: r.remarks,
      })),
      playbookSource: { month: pb.month, locationCount: pb.locationCount, fileName: "Change_Report_May.txt" },
    });
    assert.equal(patch.status, 200);
    const after = await preview(next.id);
    assert.equal(after.modifyPreview.length, before.modifyPreview.length);
    assert.equal(after.deletePreview.length, before.deletePreview.length);
  });
});
