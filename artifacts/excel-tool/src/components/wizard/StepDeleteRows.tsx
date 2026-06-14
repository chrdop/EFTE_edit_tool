import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Session, useUpdateSession, DeleteRowConfig } from "@workspace/api-client-react";
import { Plus, X, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";

interface StepDeleteRowsProps {
  session: Session;
  sessionId: string;
  onNext: () => void;
  onBack: () => void;
  refreshSession: () => void;
}

const DEFAULT_ROWS: DeleteRowConfig[] = [{ rowNumber: 17 }, { rowNumber: 18 }];

export function StepDeleteRows({ session, sessionId, onNext, onBack, refreshSession }: StepDeleteRowsProps) {
  const [rows, setRows] = useState<DeleteRowConfig[]>(
    session.deleteRows && session.deleteRows.length > 0 ? session.deleteRows : DEFAULT_ROWS
  );
  const { mutate: updateSession, isPending } = useUpdateSession();

  const addRow = () => {
    setRows([...rows, { rowNumber: 0 }]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, val: string) => {
    const num = parseInt(val, 10);
    const newRows = [...rows];
    newRows[index].rowNumber = isNaN(num) ? 0 : num;
    setRows(newRows);
  };

  const handleNext = () => {
    // Filter out rows with 0 or invalid numbers
    const validRows = rows.filter(r => r.rowNumber > 0);
    
    updateSession(
      { sessionId, data: { deleteRows: validRows } },
      {
        onSuccess: () => {
          refreshSession();
          onNext();
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Zeilen löschen</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Zeilennummern angeben, die geleert werden sollen. Hours- und EFTE-Zellen werden für den gewählten Monat ({session.selectedMonth}) in allen Sheets auf 0 gesetzt.
        </p>
      </div>

      <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
        <div className="bg-muted/40 p-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-semibold text-foreground">
            <Trash2 className="w-4 h-4 text-muted-foreground" />
            <span>Zu leerende Zeilen</span>
          </div>
          <Button onClick={addRow} size="sm" variant="secondary" className="h-8">
            <Plus className="w-4 h-4 mr-1" />
            Zeile hinzufügen
          </Button>
        </div>
        
        <div className="p-4 space-y-3">
          {rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-md bg-muted/20">
              Keine Zeilen konfiguriert. „Zeile hinzufügen" klicken oder diesen Schritt überspringen.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {rows.map((row, index) => (
                <div key={index} className="flex items-center space-x-2 group">
                  <div className="relative flex-1">
                    <Label htmlFor={`row-${index}`} className="sr-only">Zeilennummer</Label>
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <span className="text-muted-foreground text-sm font-medium">Zeile</span>
                    </div>
                    <Input
                      id={`row-${index}`}
                      type="number"
                      min={1}
                      value={row.rowNumber || ""}
                      onChange={(e) => updateRow(index, e.target.value)}
                      className="pl-14 font-mono"
                      placeholder="z.B. 42"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(index)}
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Zeile entfernen"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
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
