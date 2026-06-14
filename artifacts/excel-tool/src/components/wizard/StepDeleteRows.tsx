import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Session, useUpdateSession, DeleteRowConfig } from "@workspace/api-client-react";
import { Plus, X, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RowLabel {
  rowNumber: number;
  label: string;
}

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
  const [rowLabels, setRowLabels] = useState<RowLabel[]>([]);
  const { mutate: updateSession, isPending } = useUpdateSession();

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/row-list`)
      .then((r) => r.json())
      .then((data: { rows: RowLabel[] }) => setRowLabels(data.rows ?? []))
      .catch(() => {});
  }, [sessionId]);

  const addRow = () => {
    setRows([...rows, { rowNumber: 0 }]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, rowNumber: number) => {
    const newRows = [...rows];
    newRows[index] = { rowNumber };
    setRows(newRows);
  };

  const handleNext = () => {
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

  const rowLabel = (rowNumber: number) => {
    const found = rowLabels.find((r) => r.rowNumber === rowNumber);
    return found ? `Row ${found.rowNumber}: ${found.label}` : rowNumber > 0 ? `Row ${rowNumber}` : "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Delete Rows</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Specify rows to clear. Hours and EFTE cells will be set to 0 for {session.selectedMonth} across all sheets.
        </p>
      </div>

      <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
        <div className="bg-muted/40 p-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-semibold text-foreground">
            <Trash2 className="w-4 h-4 text-muted-foreground" />
            <span>Rows to clear</span>
          </div>
          <Button onClick={addRow} size="sm" variant="secondary" className="h-8">
            <Plus className="w-4 h-4 mr-1" />
            Add row
          </Button>
        </div>

        <div className="p-4 space-y-3">
          {rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-md bg-muted/20">
              No rows configured. Click "Add row" or skip this step.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {rows.map((row, index) => (
                <div key={index} className="flex items-center space-x-2 group">
                  <Select
                    value={row.rowNumber > 0 ? String(row.rowNumber) : ""}
                    onValueChange={(val) => updateRow(index, parseInt(val, 10))}
                  >
                    <SelectTrigger className="flex-1 text-sm font-mono">
                      <SelectValue placeholder="Select row…">
                        {row.rowNumber > 0 ? rowLabel(row.rowNumber) : "Select row…"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {rowLabels.length === 0 ? (
                        <SelectItem value="0" disabled>Loading…</SelectItem>
                      ) : (
                        rowLabels.map((rl) => (
                          <SelectItem key={rl.rowNumber} value={String(rl.rowNumber)} className="text-xs font-mono">
                            <span className="text-muted-foreground mr-2 tabular-nums">{rl.rowNumber}</span>
                            {rl.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(index)}
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
          Back
        </Button>
        <Button onClick={handleNext} disabled={isPending} size="lg" className="min-w-32 shadow-sm font-semibold">
          {isPending ? "Saving…" : "Next"}
        </Button>
      </div>
    </div>
  );
}
