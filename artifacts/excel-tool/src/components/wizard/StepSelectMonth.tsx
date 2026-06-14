import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Session, useUpdateSession } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface StepSelectMonthProps {
  session: Session;
  sessionId: string;
  onNext: () => void;
  onBack: () => void;
  refreshSession: () => void;
}

export function StepSelectMonth({ session, sessionId, onNext, onBack, refreshSession }: StepSelectMonthProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(session.selectedMonth || "");
  const { mutate: updateSession, isPending } = useUpdateSession();

  // Extract unique detected months across all uploaded files
  const detectedMonths = useMemo(() => {
    const months = new Set<string>();
    session.files.forEach(f => {
      f.detectedMonths.forEach(m => months.add(m));
    });
    return Array.from(months).sort();
  }, [session.files]);

  // Fallback standard months if detection failed
  const allMonths = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  const optionsToDisplay = detectedMonths.length > 0 ? detectedMonths : allMonths;

  const handleNext = () => {
    if (!selectedMonth) return;
    
    updateSession(
      { sessionId, data: { selectedMonth } },
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
        <h2 className="text-xl font-bold tracking-tight">Select Processing Month</h2>
        <p className="text-sm text-muted-foreground mt-1">Choose the month you want to process across all uploaded files.</p>
      </div>

      <div className="max-w-md p-6 border rounded-lg bg-card shadow-sm space-y-4">
        <div className="space-y-2">
          <Label htmlFor="month-select" className="text-sm font-semibold text-foreground">
            Month
          </Label>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger id="month-select" className="w-full h-12 text-base">
              <SelectValue placeholder="Select a month..." />
            </SelectTrigger>
            <SelectContent>
              {optionsToDisplay.map((month) => (
                <SelectItem key={month} value={month}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {detectedMonths.length > 0 && !detectedMonths.includes(selectedMonth) && selectedMonth !== "" && (
          <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border">
            Note: The selected month was not automatically detected in the uploaded files.
          </p>
        )}
      </div>

      <div className="pt-6 flex justify-between border-t">
        <Button variant="outline" onClick={onBack} size="lg">
          Back
        </Button>
        <Button onClick={handleNext} disabled={!selectedMonth || isPending} size="lg" className="min-w-32 shadow-sm font-semibold">
          {isPending ? "Saving..." : "Next Step"}
        </Button>
      </div>
    </div>
  );
}
