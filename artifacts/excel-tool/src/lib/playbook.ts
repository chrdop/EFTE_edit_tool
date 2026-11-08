import { z } from "zod";
import { KarenzEntryKind, ModifyRowConfigPlusMinus, type SessionUpdate } from "@workspace/api-client-react";

// Same markers as PLAYBOOK_BEGIN / PLAYBOOK_END in api-server/src/lib/pdfGenerator.ts.
const PLAYBOOK_BEGIN = "<<<EFTE-PLAYBOOK-BEGIN>>>";
const PLAYBOOK_END = "<<<EFTE-PLAYBOOK-END>>>";

const text = z.string().max(200);
const rowNumber = z.number().int().min(1).max(100000);
const amount = z.number().finite();

const playbookSchema = z.object({
  format: z.literal("efte-playbook"),
  formatVersion: z.literal(1),
  month: z.string().max(20).nullable().optional(),
  generated: z.string().max(40).optional(),
  locationCount: z.number().int().min(0).max(1000),
  deleteRows: z.array(z.object({ rowNumber })).max(200),
  karenzEntries: z
    .array(
      z.object({
        kind: z.enum(["karenz", "cluster", "reallocation"]),
        name: text.optional().default(""),
        locationName: text,
        rowNumber,
        hours: amount.optional(),
        efte: amount.optional(),
        returnMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      }),
    )
    .max(500),
  rules: z
    .array(
      z.object({
        locationName: text,
        rowNumber,
        plusMinus: z.enum(["+", "-", "="]),
        scope: z.enum(["own", "all"]),
        remarks: text.optional().default(""),
        previousHoursAdjustment: amount.optional().default(0),
        previousEfteAdjustment: amount.optional().default(0),
      }),
    )
    .max(500),
});

export type Playbook = z.infer<typeof playbookSchema>;

export type ParsePlaybookResult = { ok: true; playbook: Playbook } | { ok: false; error: string };

/** Reads the machine-readable block at the end of a change report created by this tool. */
export function parsePlaybook(reportText: string): ParsePlaybookResult {
  const begin = reportText.indexOf(PLAYBOOK_BEGIN);
  const end = reportText.indexOf(PLAYBOOK_END);
  if (begin < 0 || end < 0 || end < begin) {
    return {
      ok: false,
      error:
        "No playbook block found in this file. Only change reports created by this tool since the playbook feature contain one; an older report cannot be loaded.",
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(reportText.slice(begin + PLAYBOOK_BEGIN.length, end));
  } catch {
    return { ok: false, error: "The playbook block is damaged (not valid JSON). Please use the original report file." };
  }

  const parsed = playbookSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `The playbook block has an unexpected format (${issue?.path.join(".") || "root"}: ${issue?.message ?? "invalid"}).`,
    };
  }
  return { ok: true, playbook: parsed.data };
}

/**
 * Session data for a loaded playbook. The rule amounts are deliberately left empty and rules that
 * need an amount are marked pending: they come from an external source every month and must be entered again.
 */
export function playbookToSessionUpdate(
  pb: Playbook,
  fileName: string,
): Required<Pick<SessionUpdate, "deleteRows" | "karenzEntries" | "modifyRows" | "playbookSource">> {
  return {
    deleteRows: pb.deleteRows,
    karenzEntries: pb.karenzEntries.map((k) =>
      k.kind === "cluster"
        ? { kind: KarenzEntryKind.cluster, name: k.name, locationName: k.locationName, rowNumber: k.rowNumber }
        : {
            kind: k.kind === "reallocation" ? KarenzEntryKind.reallocation : KarenzEntryKind.karenz,
            name: k.name,
            locationName: k.locationName,
            rowNumber: k.rowNumber,
            hours: k.hours ?? 0,
            efte: k.efte ?? 0,
            ...(k.kind === "karenz" && k.returnMonth ? { returnMonth: k.returnMonth } : {}),
          },
    ),
    modifyRows: pb.rules.map((r) => ({
      locationName: r.locationName,
      rowNumber: r.rowNumber,
      plusMinus: r.plusMinus as ModifyRowConfigPlusMinus,
      hoursAdjustment: 0,
      efteAdjustment: 0,
      divisor: r.scope === "all" ? 1 : 0,
      remarks: r.remarks,
      // A "+"/"−" rule without an amount last month only redistributes a source value, so there is
      // nothing to enter and it is loaded as confirmed. Every other rule waits for this month's amount.
      pending: r.plusMinus === "=" || r.previousHoursAdjustment !== 0 || r.previousEfteAdjustment !== 0,
      previousHoursAdjustment: r.previousHoursAdjustment,
      previousEfteAdjustment: r.previousEfteAdjustment,
    })),
    playbookSource: { ...(pb.month ? { month: pb.month } : {}), locationCount: pb.locationCount, fileName },
  };
}
