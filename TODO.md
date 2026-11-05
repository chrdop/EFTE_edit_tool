# TODO / Work Log

Running handoff notes across sessions — what's done, what's open, where to pick up next time.

## 2026-11-05

**Done today:**
- Read `Bugs/ModnBug3.odt`, which holds two requests ("Mod3" and "Mod4"), and asked the user three questions before building (symbol, divisor behaviour, version number).
- **Mod3 — new `=` mode in the adjustment rules** (next to `+` and `−`): overwrites Cur. Hours / Cur. EFTE with the entered Hours Adj. / EFTE Adj. values. Decisions with the user: the symbol is `=` (not `0` as first suggested); the value is written exactly as entered, with no division, and the divisor only decides own location (0) vs. all locations (> 0).
  - Touched: `openapi.yaml` enum plus codegen, `sessionStore.ts` type, backend `calcNew`/`precomputeSourceValues` in `excelProcessor.ts` (an `=` rule doesn't read the source location at all), frontend `calcNew` and the New Hours/EFTE columns in `StepModifyRows.tsx` (they now also show a value when there is no current value), plus a legend text explaining the three modes.
- **Mod4 — app version** `v1.0.0` shown in the header next to the title. Single source: `version` in `artifacts/excel-tool/package.json`, injected through `vite.config.ts` (`define`).
- Verified through the API with two sample locations: `=` into own location only, decimals kept unrounded, divisor 2 writes the unhalved value to all locations, `=` into a truly empty cell, `+` unchanged (also `+` on an empty cell stays empty), an invalid value still gets a 400. Then in the browser (dropdown, Cur. vs. New, preview, export dialog; all requests 200, no console errors).
- Committed and pushed (`2039a59`).
- User confirmed "Änderungen funktionieren" after the Replit workspace was synced. They did not say whether the Republish was done or whether they looked at the live site, so that part is not independently confirmed.

**Open / not done (current list, supersedes the older ones below):**
- **Version bumping is undecided.** `version` is bumped by hand in `artifacts/excel-tool/package.json`; I asked whether it should go up with every change and got no answer yet.
- **`=` mode: a field left at 0 writes 0.** To touch only EFTE, the Hours Adj. cell would have to be kept, not zeroed (only `+` with 0 leaves a cell alone). The preview shows Cur./New before export. Decide whether an empty field should mean "leave untouched".
- **Reference row's "Holiday hours" input affects nothing** since the Sum excludes the Reference row (it never fed the EFTE formula). Keep, remove, or give it a role?
- Sum EFTE shows `3,1`, not `3,10` (formatter drops trailing zeros). Cosmetic — fixed two decimals wanted?
- **Design:** this session lists a `hotel-design-leonardo` skill (design system for internal Leonardo hotel tools). `hotel-design-gold` is now scoped to a different project (HSK Report). Neither was applied; the EFTE tool still has the default blue look. Open question whether it should adopt the Leonardo design.
- Still deferred: **"Punkt 3"** (shared landing page linking the webapps). No automated tests exist.

**Where to continue next session:**
- Ask whether a further request file (Mod 5 / `Bugs/ModnBug4.odt`) is waiting.
- Put the open questions above (version bumping, `=` with a 0 field, Reference holiday hours, decimals, Leonardo design) to the user.

## 2026-10-10

**Done today:**
- Read `Bugs/ModnBug2.odt` ("Mod 2": three bullet points plus a screenshot of the calculator) and implemented all three in `EfteCalculatorBlock.tsx`:
  1. Default staff rows reduced from 5 to 3 (staff1–staff3).
  2. Sum row now totals the staff rows only — the Reference row is no longer included. The "working hours minus holiday hours" rule was kept (assumed; the document only said "only over staff rows 1–n"). With the Mod-1 example values the Sum is now 367 / 3,1 instead of 547 / 4,62.
  3. Sum row uses the same background (`bg-amber-50/30`) as the Reference row.
- Verified in the browser (login → upload → wizard → Modify Rows): 3 default rows, Sum = 367 / 3,1 for the example data, computed background of Sum row identical to Reference row, no console errors.
- Committed and pushed (`2523423`) — code only; `Bugs/` intentionally left out of git again.
- Replit workspace synced (`git pull --rebase origin main`), user confirmed "Test OK", and later confirmed the Republish was done. (No "Published your App" checkpoint commit had appeared on GitHub at that point — going by the user's word.)
- Added `Bugs/` (the running folder of `.odt` request documents, `ModnBug.odt`, `ModnBug2.odt`) to `.gitignore`, so it no longer shows up as untracked.

**Open / not done:** *(superseded — see the 2026-11-05 list)*
- **Reference row's "Holiday hours" input no longer affects anything** now that the Sum excludes the Reference row (it never fed the EFTE formula either). Keep, remove, or give it a role? Not asked, so left as is.
- Sum EFTE shows `3,1`, not `3,10` (the formatter drops trailing zeros); `ModnBug.odt` showed two decimals. Cosmetic — ask if fixed two decimals are wanted.
- A `hotel-design-gold` skill (gold/black design for Christian's hotel webapps) is available. It was **not** applied today: the request was only to match one row colour, and the EFTE tool currently uses the default blue look. Open question whether the whole tool should adopt it.
- Still deferred: **"Punkt 3"** (shared landing page linking the webapps). No automated tests exist.

**Where to continue next session:**
- Ask whether "Mod 3" or other `Bugs/` requests are waiting, and put the three small questions above (Reference holiday hours, decimals, gold design) to the user.

## 2026-09-14

**Done today:** *(note: the Sum semantics described here — Reference row included, 547 / 4,62 — were changed on 2026-10-10, see above)*
- Read the feature request in `Bugs/ModnBug.odt` ("Modifikation 01") and reverse-engineered its calculation logic from the example table (confirmed with the user: `EFTE = (workingHours − holidayHours) × referenceEfte / referenceWorkingHours`, verified against all example rows).
- Clarified scope with the user before building: display-only calculator (not persisted, not exported), global for the session (not per-location), staff rows dynamically add/removable.
- Built `EfteCalculatorBlock.tsx` and wired it into `StepModifyRows.tsx`, rendered above the existing "Adjustment rules" block.
- Verified end-to-end in the browser (real login → upload → wizard → Modify Rows step): entered the exact example values from `ModnBug.odt` and got exact matches (staff1=1,28, staff2=1,14, staff3=0,68, Sum=547/4,62); also checked add/remove staff rows and confirmed no console errors and no interference with the existing Adjustment Rules table.
- Committed and pushed (`2704ddc`) — code only, per the user's request the `Bugs/` folder itself (the `.odt` plus LibreOffice lock files) was intentionally left out of git.

**Open / not done:** *(superseded — see the 2026-11-05 list)*
- `Bugs/ModnBug.odt` ("Modifikation 01") is implemented but the source file is still sitting untracked in `Bugs/` — decide at some point whether to archive/delete it locally now that it's built, or keep it as a running "requests" folder for future modifications (the name suggests there may be a "Modifikation 02" etc. later).
- Original project item **"Punkt 3" (a shared landing page linking this and future webapps together)** from the very first conversation is still explicitly deferred — user said "lassen wir vorerst" both times it came up. Revisit when there's a second webapp to link.
- No automated tests exist for the new calculator (or anything else in the app) — verification has been manual/browser-based each time (see `CLAUDE.md` → Testing/verification).

**Where to continue next session:**
- Ask the user whether there's a "Modifikation 02" or further `Bugs/` requests waiting, since `ModnBug.odt`'s naming implies more may follow.
- If nothing new: check in on the shared landing page idea (Punkt 3), since the Replit deployment work is stable now.
