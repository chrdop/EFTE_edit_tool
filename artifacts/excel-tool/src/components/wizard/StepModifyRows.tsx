import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Session, useUpdateSession, ModifyRowConfig, ModifyRowConfigPlusMinus } from "@workspace/api-client-react";
import { Plus, X, Calculator } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

function calcNew(current: number | null, adj: number, plusMinus: "+" | "-", divisor: number): number | null {
  if (current === null) return null;
  const adjusted = plusMinus === "-" ? current - adj : current + adj;
  return divisor !== 0 ? Math.round((adjusted / divisor) * 100) / 100 : adjusted;
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
        const res = await fetch(`/api/sessions/${sessionId}/read-values`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (res.ok) {
          const data: { values: (RowCurrentValue & { locationName?: string })[] } = await res.json();
          const map: ValuesMap = {};
          // Server returns in same order as items, so zip them
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
      { locationName: defaultLocation, rowNumber: 0, plusMinus: "+" as ModifyRowConfigPlusMinus, hoursAdjustment: 0, efteAdjustment: 0, divisor: 1 },
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
    const validRows = rows.filter((r) => r.rowNumber > 0 && r.locationName && r.divisor !== 0);
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
          Anpassungsregeln für {session.selectedMonth} definieren. Jede Zeile kann einen eigenen Standort haben.
        </p>
      </div>

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
                  <TableHead className="min-w-[200px]">Standort</TableHead>
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
                  const key = `${row.locationName}:${row.rowNumber}`;
                  const cv = row.rowNumber > 0 && row.locationName ? currentValues[key] : undefined;
                  const newHours = cv ? calcNew(cv.hours, row.hoursAdjustment, row.plusMinus, row.divisor) : null;
                  const newEfte = cv ? calcNew(cv.efte, row.efteAdjustment, row.plusMinus, row.divisor) : null;

                  return (
                    <TableRow key={index}>
                      {/* Standort per row */}
                      <TableCell>
                        <Select
                          value={row.locationName || ""}
                          onValueChange={(val) => updateRow(index, "locationName", val)}
                        >
                          <SelectTrigger className="text-xs min-w-[180px]">
                            <SelectValue placeholder="Standort wählen…" />
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
                          className="w-full font-mono text-xs"
                          placeholder="#"
                        />
                      </TableCell>

                      {/* +/- */}
                      <TableCell>
                        <Select
                          value={row.plusMinus}
                          onValueChange={(val) => updateRow(index, "plusMinus", val as ModifyRowConfigPlusMinus)}
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

                      {/* Hours adjustment */}
                      <TableCell>
                        <Input
                          type="number"
                          value={row.hoursAdjustment || ""}
                          onChange={(e) => updateRow(index, "hoursAdjustment", parseFloat(e.target.value) || 0)}
                          className="w-full font-mono text-xs"
                        />
                      </TableCell>

                      {/* EFTE adjustment */}
                      <TableCell>
                        <Input
                          type="number"
                          value={row.efteAdjustment || ""}
                          onChange={(e) => updateRow(index, "efteAdjustment", parseFloat(e.target.value) || 0)}
                          className="w-full font-mono text-xs"
                        />
                      </TableCell>

                      {/* Divisor */}
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

                      {/* Ist Hours */}
                      <TableCell className="bg-blue-50/60 border-l align-middle text-xs font-mono text-blue-800 whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(cv?.hours)}
                      </TableCell>

                      {/* Ist EFTE */}
                      <TableCell className="bg-blue-50/60 align-middle text-xs font-mono text-blue-800 whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(cv?.efte)}
                      </TableCell>

                      {/* Hours neu */}
                      <TableCell className="bg-primary/5 border-l align-middle text-xs font-mono font-semibold text-primary whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(newHours)}
                      </TableCell>

                      {/* EFTE neu */}
                      <TableCell className="bg-primary/5 align-middle text-xs font-mono font-semibold text-primary whitespace-nowrap">
                        {isFetchingValues ? "…" : fmt(newEfte)}
                      </TableCell>

                      {/* Delete */}
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
