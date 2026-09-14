import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, X, Users } from "lucide-react";

interface StaffRow {
  id: string;
  label: string;
  workingHours: number;
  holidayHours: number;
}

let nextId = 0;
function makeStaffRow(label: string): StaffRow {
  nextId += 1;
  return { id: `staff-${nextId}`, label, workingHours: 0, holidayHours: 0 };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function fmt(v: number): string {
  return v.toLocaleString("de-AT", { maximumFractionDigits: 2 });
}

// EFTE for a staff row, relative to the Reference row:
// EFTE = (workingHours - holidayHours) * referenceEfte / referenceWorkingHours
function calcStaffEfte(row: StaffRow, referenceWorkingHours: number, referenceEfte: number): number {
  if (referenceWorkingHours === 0) return 0;
  return round2(((row.workingHours - row.holidayHours) * referenceEfte) / referenceWorkingHours);
}

export function EfteCalculatorBlock() {
  const [referenceWorkingHours, setReferenceWorkingHours] = useState(0);
  const [referenceHolidayHours, setReferenceHolidayHours] = useState(0);
  const [referenceEfte, setReferenceEfte] = useState(0);
  const [staffRows, setStaffRows] = useState<StaffRow[]>([
    makeStaffRow("staff1"),
    makeStaffRow("staff2"),
    makeStaffRow("staff3"),
    makeStaffRow("staff4"),
    makeStaffRow("staff5"),
  ]);

  const addRow = () => setStaffRows([...staffRows, makeStaffRow(`staff${staffRows.length + 1}`)]);
  const removeRow = (id: string) => setStaffRows(staffRows.filter((r) => r.id !== id));
  const updateRow = <K extends keyof StaffRow>(id: string, field: K, value: StaffRow[K]) => {
    setStaffRows(staffRows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const staffEfteValues = staffRows.map((r) => calcStaffEfte(r, referenceWorkingHours, referenceEfte));

  const sumWorkingHours = round2(
    referenceWorkingHours +
      staffRows.reduce((sum, r) => sum + r.workingHours, 0) -
      (referenceHolidayHours + staffRows.reduce((sum, r) => sum + r.holidayHours, 0)),
  );
  const sumEfte = round2(referenceEfte + staffEfteValues.reduce((sum, v) => sum + v, 0));

  return (
    <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
      <div className="bg-muted/40 p-4 border-b flex items-center justify-between">
        <div className="flex items-center space-x-2 text-sm font-semibold text-foreground">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span>Staff EFTE calculator</span>
        </div>
        <Button onClick={addRow} size="sm" variant="secondary" className="h-8">
          <Plus className="w-4 h-4 mr-1" />
          Add staff
        </Button>
      </div>

      <p className="px-4 pt-3 text-xs text-muted-foreground">
        Enter the Reference row's hours and EFTE, then each staff member's working/holiday hours — EFTE is
        calculated relative to the Reference row. This is a standalone calculator; values here aren't saved or
        exported, use the Sum row as a reference when filling in the adjustment rules below.
      </p>

      <div className="overflow-x-auto p-4 pt-3">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="min-w-[110px]"></TableHead>
              <TableHead className="min-w-[110px]">Working hours</TableHead>
              <TableHead className="min-w-[110px]">Holiday hours</TableHead>
              <TableHead className="min-w-[100px]">EFTE</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-amber-50/30">
              <TableCell className="font-medium text-xs">Reference</TableCell>
              <TableCell>
                <Input
                  type="number"
                  step="any"
                  value={referenceWorkingHours}
                  onChange={(e) => setReferenceWorkingHours(e.target.valueAsNumber || 0)}
                  className="w-full font-mono text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  step="any"
                  value={referenceHolidayHours}
                  onChange={(e) => setReferenceHolidayHours(e.target.valueAsNumber || 0)}
                  className="w-full font-mono text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  step="any"
                  value={referenceEfte}
                  onChange={(e) => setReferenceEfte(e.target.valueAsNumber || 0)}
                  className="w-full font-mono text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </TableCell>
              <TableCell></TableCell>
            </TableRow>

            {staffRows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Input
                    type="text"
                    value={row.label}
                    onChange={(e) => updateRow(row.id, "label", e.target.value)}
                    className="w-full text-xs"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="any"
                    value={row.workingHours}
                    onChange={(e) => updateRow(row.id, "workingHours", e.target.valueAsNumber || 0)}
                    className="w-full font-mono text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="any"
                    value={row.holidayHours}
                    onChange={(e) => updateRow(row.id, "holidayHours", e.target.valueAsNumber || 0)}
                    className="w-full font-mono text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </TableCell>
                <TableCell className="bg-primary/5 align-middle text-xs font-mono font-semibold text-primary whitespace-nowrap">
                  {fmt(staffEfteValues[index])}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(row.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            <TableRow className="bg-muted/30 font-semibold">
              <TableCell className="text-xs">Sum</TableCell>
              <TableCell className="font-mono text-xs">{fmt(sumWorkingHours)}</TableCell>
              <TableCell></TableCell>
              <TableCell className="font-mono text-xs text-primary">{fmt(sumEfte)}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
