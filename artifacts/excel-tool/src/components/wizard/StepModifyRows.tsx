import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Session, useUpdateSession, ModifyRowConfig, ModifyRowConfigPlusMinus } from "@workspace/api-client-react";
import { Plus, X, Calculator } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EfteCalculatorBlock } from "@/components/wizard/EfteCalculatorBlock";

interface RowCurrentValue {
  rowNumber: number;
  hours: number | null;
  efte: number | null;
}

// Key: "locationName:rowNumber"
type ValuesMap = Record<string, RowCurrentValue>;

interface StepModifyRowsProps {
  session: Session;
  sessionId: string;
  onNext: () => void;
  onBack: () => void;
  refreshSession: () => void;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// Mirrors calcNew in api-server/src/lib/excelProcessor.ts — keep both in sync.
// divisor 0 = own location; divisor > 0 = all locations, result divided by the number of locations.
function calcNew(
  current: number | null,
  adj: number,
  plusMinus: ModifyRowConfigPlusMinus,
  divisor: number,
  locationCount: number,
): number | null {
  const divideBy = divisor > 0 && locationCount > 0 ? locationCount : 0;
  if (plusMinus === "=") return divideBy > 0 ? round2(adj / divideBy) : adj;
  if (current === null) return null;
  const adjusted = plusMinus === "-" ? current - adj : current + adj;
  return round2(divideBy > 0 ? adjusted / divideBy : adjusted);
}

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("de-AT", { maximumFractionDigits: 2 });
}

export function StepModifyRows({ session, sessionId, onNext, onBack, refreshSession }: StepModifyRowsProps) {
  const defaultLocation = session.files[0]?.locationName ?? "";
  const [rows, setRows] = useState<ModifyRowConfig[]>(
    (session.modifyRows || []).map((r) => ({ ...r, locationName: r.locationName || defaultLocation }))
  );
  const [currentValues, setCurrentValues] = useState<ValuesMap>({});
  const [isFetchingValues, setIsFetchingValues] = useState(false);
  const { mutate: updateSession, isPending } = useUpdateSession();

  const locations = Array.from(new Set(session.files.map((f) => f.locationName).filter(Boolean)));
  const locationCount = session.files.length;

  const fetchCurrentValues = useCallback(
    async (rowList: ModifyRowConfig[]) => {
      const items = rowList
        .filter((r) => r.rowNumber > 0 && r.locationName)
        .map((r) => ({ locationName: r.locationName, rowNumber: r.rowNumber }));

      if (items.length === 0 || !session.selectedMonth) {
        setCurrentValues({});
        return;
      }

      setIsFetchingValues(true);
      try {
        const token = localStorage.getItem("app_auth_token");
        const res = await fetch(`/api/sessions/${sessionId}/read-values`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ items }),
        });
        if (res.ok) {
          const data: { values: (RowCurrentValue & { locationName?: string })[] } = await res.json();
          const map: ValuesMap = {};
          items.forEach((item, i) => {
            const v = data.values[i];
            if (v) map[`${item.locationName}:${item.rowNumber}`] = v;
          });
          setCurrentValues(map);
        }
      } finally {
        setIsFetchingValues(false);
      }
    },
    [sessionId, session.selectedMonth],
  );

  useEffect(() => {
    fetchCurrentValues(rows);
  }, [rows, fetchCurrentValues]);

  const addRow = () => {
    const newRows = [
      ...rows,
      { locationName: defaultLocation, rowNumber: 0, plusMinus: "+" as ModifyRowConfigPlusMinus, hoursAdjustment: 0, efteAdjustment: 0, divisor: 1, remarks: "" },
    ];
    setRows(newRows);
  };

  const removeRow = (index: number) => setRows(rows.filter((_, i) => i !== index));

  const updateRow = <K extends keyof ModifyRowConfig>(index: number, field: K, value: ModifyRowConfig[K]) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const handleNext = () => {
    const validRows = rows.filter((r) => r.rowNumber > 0 && r.locationName);
    updateSession(
      { sessionId, data: { modifyRows: validRows } },
      {
        onSuccess: () => {
          refreshSession();
          onNext();
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Modify Rows</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define adjustment rules for {session.selectedMonth}. Each rule can target a different location.
        </p>
      </div>

      {/* Legend */}
      <div className="rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p><span className="font-semibold text-foreground">Own location:</span> The new value is written <span className="font-semibold text-foreground">only to the selected location</span>.</p>
        <p><span className="font-semibold text-foreground">All locations (÷ {locationCount}):</span> The new value is calculated from the selected location and <span className="font-semibold text-foreground">divided by the number of uploaded locations ({locationCount})</span>; the result is written to every location. This applies to +, − and =.</p>
        <p><span className="font-semibold text-foreground">+ / −:</span> The adjustment is added to / subtracted from the current value.</p>
        <p><span className="font-semibold text-foreground">=:</span> The entered Hours Adj. / EFTE Adj. values <span className="font-semibold text-foreground">overwrite</span> Cur. Hours / Cur. EFTE as entered (for "own location"; for "all locations" the entered value is divided by {locationCount}).</p>
      </div>

      <EfteCalculatorBlock />

      <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
        <div className="bg-muted/40 p-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-semibold text-foreground">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            <span>Adjustment rules</span>
          </div>
          <Button onClick={addRow} size="sm" variant="secondary" className="h-8">
            <Plus className="w-4 h-4 mr-1" />
            Add rule
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground bg-muted/10">
            No rules configured. Click "Add rule" or skip this step.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="min-w-[190px]">Location</TableHead>
                  <TableHead className="min-w-[90px]">Row</TableHead>
                  <TableHead className="min-w-[80px]">+/−</TableHead>
                  <TableHead className="min-w-[100px]">Hours Adj.</TableHead>
                  <TableHead className="min-w-[100px]">EFTE Adj.</TableHead>
                  <TableHead className="min-w-[150px]">Scope</TableHead>
                  <TableHead className="bg-blue-50/60 border-l text-blue-700/80 text-xs whitespace-nowrap">Cur. Hours</TableHead>
                  <TableHead className="bg-blue-50/60 text-blue-700/80 text-xs whitespace-nowrap">Cur. EFTE</TableHead>
                  <TableHead className="bg-primary/5 border-l text-primary/80 text-xs whitespace-nowrap">New Hours</TableHead>
                  <TableHead className="bg-primary/5 text-primary/80 text-xs whitespace-nowrap">New EFTE</TableHead>
                  <TableHead className="min-w-[180px]">Remarks</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const key = `${row.locationName}:${row.rowNumber}`;
                  const cv = row.rowNumber > 0 && row.locationName ? currentValues[key] : undefined;
                  const isRowReady = row.rowNumber > 0 && !!row.locationName;
                  const newHours = isRowReady ? calcNew(cv?.hours ?? null, row.hoursAdjustment, row.plusMinus, row.divisor, locationCount) : null;
                  const newEfte = isRowReady ? calcNew(cv?.efte ?? null, row.efteAdjustment, row.plusMinus, row.divisor, locationCount) : null;
                  const isAllLocations = row.divisor > 0;

                  return (
                    <TableRow key={index} className={isAllLocations ? "bg-amber-50/30" : ""}>
                      {/* Location */}
                      <TableCell>
                        <Select
                          value={row.locationName || ""}
                          onValueChange={(val) => updateRow(index, "locationName", val)}
                        >
                          <SelectTrigger className="text-xs min-w-[170px]">
                            <SelectValue placeholder="Select location…" />
                          </SelectTrigger>
                          <SelectContent>
                            {locations.map((loc) => (
                              <SelectItem key={loc} value={loc} className="text-xs">
                                {loc}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Row number */}
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={row.rowNumber || ""}
                          onChange={(e) => updateRow(index, "rowNumber", parseInt(e.target.value) || 0)}
                          className="w-full font-mono text-sm font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          placeholder="#"
                        />
                      </TableCell>

                      {/* +/- */}
                      <TableCell>
                        <Select
                          value={row.plusMinus}
                          onValueChange={(val) => updateRow(index, "plusMinus", val as ModifyRowConfigPlusMinus)}
                        >
                          <SelectTrigger className="font-mono text-center w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="+">+</SelectItem>
                            <SelectItem value="-">−</SelectItem>
                            <SelectItem value="=">=</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Hours adjustment */}
                      <TableCell>
                        <Input
                          type="number"
                          step="any"
                          value={row.hoursAdjustment}
                          onChange={(e) => {
                            const v = e.target.valueAsNumber;
                            updateRow(index, "hoursAdjustment", isNaN(v) ? 0 : v);
                          }}
                          className="w-full font-mono text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          placeholder="0"
                        />
                      </TableCell>

                      {/* EFTE adjustment */}
                      <TableCell>
                        <Input
                          type="number"
                          step="any"
                          value={row.efteAdjustment}
                          onChange={(e) => {
                            const v = e.target.valueAsNumber;
                            updateRow(index, "efteAdjustment", isNaN(v) ? 0 : v);
                          }}
                          className="w-full font-mono text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          placeholder="0"
                        />
                      </TableCell>

                      {/* Scope: divisor 0 = own location, > 0 = all locations (÷ number of locations) */}
                      <TableCell>
                        <Select
                          value={isAllLocations ? "all" : "own"}
                          onValueChange={(val) => updateRow(index, "divisor", val === "all" ? 1 : 0)}
                        >
                          <SelectTrigger className={`text-xs min-w-[130px] ${isAllLocations ? "text-amber-700" : ""}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="own" className="text-xs">Own location</SelectItem>
                            <SelectItem value="all" className="text-xs">All locations ÷ {locationCount}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Current Hours */}
                      <TableCell className="bg-blue-50/60 border-l align-middle text-xs font-mono text-blue-800 whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(cv?.hours)}
                      </TableCell>

                      {/* Current EFTE */}
                      <TableCell className="bg-blue-50/60 align-middle text-xs font-mono text-blue-800 whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(cv?.efte)}
                      </TableCell>

                      {/* New Hours */}
                      <TableCell className="bg-primary/5 border-l align-middle text-xs font-mono font-semibold text-primary whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(newHours)}
                      </TableCell>

                      {/* New EFTE */}
                      <TableCell className="bg-primary/5 align-middle text-xs font-mono font-semibold text-primary whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(newEfte)}
                      </TableCell>

                      {/* Remarks */}
                      <TableCell>
                        <Input
                          type="text"
                          value={row.remarks ?? ""}
                          onChange={(e) => updateRow(index, "remarks", e.target.value)}
                          className="w-full text-xs"
                          placeholder="Optional remark…"
                        />
                      </TableCell>

                      {/* Remove */}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(index)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="pt-6 flex justify-between border-t">
        <Button variant="outline" onClick={onBack} size="lg">
          Back
        </Button>
        <Button onClick={handleNext} disabled={isPending} size="lg" className="min-w-32 shadow-sm font-semibold">
          {isPending ? "Saving…" : "Next"}
        </Button>
      </div>
    </div>
  );
}
