# TODO / Work Log

Running handoff notes across sessions — what's done, what's open, where to pick up next time.

## 2026-09-14

**Done today:**
- Read the feature request in `Bugs/ModnBug.odt` ("Modifikation 01") and reverse-engineered its calculation logic from the example table (confirmed with the user: `EFTE = (workingHours − holidayHours) × referenceEfte / referenceWorkingHours`, verified against all example rows).
- Clarified scope with the user before building: display-only calculator (not persisted, not exported), global for the session (not per-location), staff rows dynamically add/removable.
- Built `EfteCalculatorBlock.tsx` and wired it into `StepModifyRows.tsx`, rendered above the existing "Adjustment rules" block.
- Verified end-to-end in the browser (real login → upload → wizard → Modify Rows step): entered the exact example values from `ModnBug.odt` and got exact matches (staff1=1,28, staff2=1,14, staff3=0,68, Sum=547/4,62); also checked add/remove staff rows and confirmed no console errors and no interference with the existing Adjustment Rules table.
- Committed and pushed (`2704ddc`) — code only, per the user's request the `Bugs/` folder itself (the `.odt` plus LibreOffice lock files) was intentionally left out of git.

**Open / not done:**
- `Bugs/ModnBug.odt` ("Modifikation 01") is implemented but the source file is still sitting untracked in `Bugs/` — decide at some point whether to archive/delete it locally now that it's built, or keep it as a running "requests" folder for future modifications (the name suggests there may be a "Modifikation 02" etc. later).
- Original project item **"Punkt 3" (a shared landing page linking this and future webapps together)** from the very first conversation is still explicitly deferred — user said "lassen wir vorerst" both times it came up. Revisit when there's a second webapp to link.
- No automated tests exist for the new calculator (or anything else in the app) — verification has been manual/browser-based each time (see `CLAUDE.md` → Testing/verification).

**Where to continue next session:**
- Ask the user whether there's a "Modifikation 02" or further `Bugs/` requests waiting, since `ModnBug.odt`'s naming implies more may follow.
- If nothing new: check in on the shared landing page idea (Punkt 3), since the Replit deployment work is stable now.
