import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Session, useUpdateSession, ModifyRowConfig, ModifyRowConfigPlusMinus } from "@workspace/api-client-react";
import { Plus, X, Calculator } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface StepModifyRowsProps {
  session: Session;
  sessionId: string;
  onNext: () => void;
  onBack: () => void;
  refreshSession: () => void;
}

export function StepModifyRows({ session, sessionId, onNext, onBack, refreshSession }: StepModifyRowsProps) {
  const [rows, setRows] = useState<ModifyRowConfig[]>(session.modifyRows || []);
  const { mutate: updateSession, isPending } = useUpdateSession();

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
    // Filter out invalid configurations
    const validRows = rows.filter(r => r.rowNumber > 0 && r.divisor !== 0);
    
    updateSession(
      { sessionId, data: { modifyRows: validRows } },
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
        <h2 className="text-xl font-bold tracking-tight">Configure Modify Rows</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define adjustments for specific rows. The calculated values will apply to the month of {session.selectedMonth}.
        </p>
      </div>

      <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
        <div className="bg-muted/40 p-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-semibold text-foreground">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            <span>Adjustment Rules</span>
          </div>
          <Button onClick={addRow} size="sm" variant="secondary" className="h-8">
            <Plus className="w-4 h-4 mr-1" />
            Add Rule
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground bg-muted/10">
            No adjustment rules configured. Click "Add Rule" to begin, or skip this step.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-24">Row</TableHead>
                  <TableHead className="w-24">+/-</TableHead>
                  <TableHead>Hours Adj.</TableHead>
                  <TableHead>EFTE Adj.</TableHead>
                  <TableHead>Divisor</TableHead>
                  <TableHead className="bg-primary/5 border-l">Hours New</TableHead>
                  <TableHead className="bg-primary/5">EFTE New</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const hoursNewStr = `(Current ${row.plusMinus} ${row.hoursAdjustment}) / ${row.divisor}`;
                  const efteNewStr = `(Current ${row.plusMinus} ${row.efteAdjustment}) / ${row.divisor}`;
                  
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
                            <SelectItem value="-">-</SelectItem>
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
                      <TableCell className="bg-primary/5 border-l align-middle text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {hoursNewStr}
                      </TableCell>
                      <TableCell className="bg-primary/5 align-middle text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {efteNewStr}
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
          Back
        </Button>
        <Button onClick={handleNext} disabled={isPending} size="lg" className="min-w-32 shadow-sm font-semibold">
          {isPending ? "Saving..." : "Next Step"}
        </Button>
      </div>
    </div>
  );
}
