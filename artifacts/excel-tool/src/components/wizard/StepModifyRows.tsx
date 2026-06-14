import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Session, useUpdateSession, ModifyRowConfig, ModifyRowConfigPlusMinus } from "@workspace/api-client-react";
import { Plus, X, Calculator, MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RowCurrentValue {
  rowNumber: number;
  hours: number | null;
  efte: number | null;
}

interface StepModifyRowsProps {
  session: Session;
  sessionId: string;
  onNext: () => void;
  onBack: () => void;
  refreshSession: () => void;
}

function calcNew(current: number | null, adj: number, plusMinus: "+" | "-", divisor: number): number | null {
  if (current === null) return null;
  const adjusted = plusMinus === "-" ? current - adj : current + adj;
  return divisor !== 0 ? Math.round((adjusted / divisor) * 100) / 100 : adjusted;
}

function fmt(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("de-AT", { maximumFractionDigits: 2 });
}

export function StepModifyRows({ session, sessionId, onNext, onBack, refreshSession }: StepModifyRowsProps) {
  const [rows, setRows] = useState<ModifyRowConfig[]>(session.modifyRows || []);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [currentValues, setCurrentValues] = useState<Record<number, RowCurrentValue>>({});
  const [isFetchingValues, setIsFetchingValues] = useState(false);
  const { mutate: updateSession, isPending } = useUpdateSession();

  // Unique location names from uploaded files
  const locations = Array.from(
    new Map(session.files.map((f) => [f.locationName, f.locationName])).values()
  ).filter(Boolean);

  // Auto-select first location
  useEffect(() => {
    if (!selectedLocation && locations.length > 0) {
      setSelectedLocation(locations[0]);
    }
  }, [locations, selectedLocation]);

  // Fetch current values whenever location or row numbers change
  const fetchCurrentValues = useCallback(async (location: string, rowNums: number[]) => {
    const validRows = rowNums.filter((r) => r > 0);
    if (!location || validRows.length === 0 || !session.selectedMonth) {
      setCurrentValues({});
      return;
    }
    setIsFetchingValues(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/read-values`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationName: location, rowNumbers: validRows }),
      });
      if (res.ok) {
        const data: { values: RowCurrentValue[] } = await res.json();
        const map: Record<number, RowCurrentValue> = {};
        for (const v of data.values) map[v.rowNumber] = v;
        setCurrentValues(map);
      }
    } finally {
      setIsFetchingValues(false);
    }
  }, [sessionId, session.selectedMonth]);

  useEffect(() => {
    const rowNums = rows.map((r) => r.rowNumber);
    fetchCurrentValues(selectedLocation, rowNums);
  }, [selectedLocation, rows, fetchCurrentValues]);

  const addRow = () => {
    setRows([...rows, { rowNumber: 0, plusMinus: "+", hoursAdjustment: 0, efteAdjustment: 0, divisor: 1 }]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = <K extends keyof ModifyRowConfig>(index: number, field: K, value: ModifyRowConfig[K]) => {
    const newRows = [...rows];
    newRows[index][field] = value;
    setRows(newRows);
  };

  const handleNext = () => {
    const validRows = rows.filter((r) => r.rowNumber > 0 && r.divisor !== 0);
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
        <h2 className="text-xl font-bold tracking-tight">Zeilen anpassen</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Anpassungsregeln für {session.selectedMonth} definieren. Wähle zuerst einen Standort um die Istwerte zu sehen.
        </p>
      </div>

      {/* Location selector */}
      {locations.length > 0 && (
        <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
          <div className="bg-muted/40 p-4 border-b flex items-center space-x-2 text-sm font-semibold text-foreground">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span>Standort für Istwerte</span>
          </div>
          <div className="p-4">
            <Select value={selectedLocation} onValueChange={(val) => setSelectedLocation(val)}>
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Standort auswählen…" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              Die Istwerte (Hours / EFTE) werden aus dem gewählten Standort gelesen und für die Berechnung verwendet.
            </p>
          </div>
        </div>
      )}

      {/* Adjustment rules */}
      <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
        <div className="bg-muted/40 p-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-semibold text-foreground">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            <span>Anpassungsregeln</span>
          </div>
          <Button onClick={addRow} size="sm" variant="secondary" className="h-8">
            <Plus className="w-4 h-4 mr-1" />
            Zeile hinzufügen
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground bg-muted/10">
            Keine Regeln konfiguriert. Klicke auf "Zeile hinzufügen" oder überspringe diesen Schritt.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-20">Zeile</TableHead>
                  <TableHead className="w-20">+/−</TableHead>
                  <TableHead>Hours Adj.</TableHead>
                  <TableHead>EFTE Adj.</TableHead>
                  <TableHead>Divisor</TableHead>
                  <TableHead className="bg-blue-50/60 border-l text-blue-700/80 text-xs">Ist Hours</TableHead>
                  <TableHead className="bg-blue-50/60 text-blue-700/80 text-xs">Ist EFTE</TableHead>
                  <TableHead className="bg-primary/5 border-l text-primary/80 text-xs">Hours neu</TableHead>
                  <TableHead className="bg-primary/5 text-primary/80 text-xs">EFTE neu</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const cv = currentValues[row.rowNumber];
                  const newHours = cv ? calcNew(cv.hours, row.hoursAdjustment, row.plusMinus, row.divisor) : null;
                  const newEfte = cv ? calcNew(cv.efte, row.efteAdjustment, row.plusMinus, row.divisor) : null;

                  return (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={row.rowNumber || ""}
                          onChange={(e) => updateRow(index, "rowNumber", parseInt(e.target.value) || 0)}
                          className="w-full font-mono text-xs"
                          placeholder="#"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.plusMinus}
                          onValueChange={(val: "+" | "-") => updateRow(index, "plusMinus", val as ModifyRowConfigPlusMinus)}
                        >
                          <SelectTrigger className="font-mono text-center">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="+">+</SelectItem>
                            <SelectItem value="-">−</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.hoursAdjustment || ""}
                          onChange={(e) => updateRow(index, "hoursAdjustment", parseFloat(e.target.value) || 0)}
                          className="w-full font-mono text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.efteAdjustment || ""}
                          onChange={(e) => updateRow(index, "efteAdjustment", parseFloat(e.target.value) || 0)}
                          className="w-full font-mono text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0.01}
                          step={0.01}
                          value={row.divisor || ""}
                          onChange={(e) => updateRow(index, "divisor", parseFloat(e.target.value) || 1)}
                          className="w-full font-mono text-xs"
                        />
                      </TableCell>
                      <TableCell className="bg-blue-50/60 border-l align-middle text-xs font-mono text-blue-800 whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(cv?.hours ?? null)}
                      </TableCell>
                      <TableCell className="bg-blue-50/60 align-middle text-xs font-mono text-blue-800 whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(cv?.efte ?? null)}
                      </TableCell>
                      <TableCell className="bg-primary/5 border-l align-middle text-xs font-mono font-semibold text-primary whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(newHours)}
                      </TableCell>
                      <TableCell className="bg-primary/5 align-middle text-xs font-mono font-semibold text-primary whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(newEfte)}
                      </TableCell>
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
          Zurück
        </Button>
        <Button onClick={handleNext} disabled={isPending} size="lg" className="min-w-32 shadow-sm font-semibold">
          {isPending ? "Speichern…" : "Weiter"}
        </Button>
      </div>
    </div>
  );
}
