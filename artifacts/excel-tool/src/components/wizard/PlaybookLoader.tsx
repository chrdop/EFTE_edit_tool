import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Session, useUpdateSession } from "@workspace/api-client-react";
import { AlertCircle, BookOpen, CheckCircle2 } from "lucide-react";
import { parsePlaybook, playbookToSessionUpdate } from "@/lib/playbook";

const MAX_BYTES = 1_000_000;

interface PlaybookLoaderProps {
  session: Session;
  sessionId: string;
  refreshSession: () => void;
}

export function PlaybookLoader({ session, sessionId, refreshSession }: PlaybookLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { mutate: updateSession, isPending } = useUpdateSession();

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("This file is too large to be a change report.");
      return;
    }
    const parsed = parsePlaybook(await file.text());
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    updateSession(
      { sessionId, data: playbookToSessionUpdate(parsed.playbook, file.name) },
      {
        onSuccess: () => refreshSession(),
        onError: () => setError("The playbook could not be loaded into the session."),
      },
    );
  };

  const source = session.playbookSource;
  const countDiffers = !!source && session.files.length > 0 && source.locationCount !== session.files.length;

  return (
    <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
      <div className="bg-muted/40 p-4 border-b flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-sm font-semibold text-foreground">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          <span>Playbook from last month (optional)</span>
        </div>
        <Button size="sm" variant="secondary" className="h-8" disabled={isPending} onClick={() => inputRef.current?.click()}>
          {source ? "Load another playbook" : "Load playbook"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </div>

      <div className="p-4 space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Choose last month's change report (<span className="font-mono">Change_Report_….txt</span>). It pre-fills the delete rows, the Karenz / other-cluster
          entries and the adjustment rules for you to review in steps 3 and 4. The amounts stay empty on purpose — enter them again for this month (rules that only
          redistribute a source value, i.e. "+" / "−" with 0 amounts last month, come in as confirmed). Loading replaces anything already entered in those steps.
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Playbook not loaded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {source && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>
              Playbook loaded{source.fileName ? ` from ${source.fileName}` : ""}
              {source.month ? ` (${source.month}, ${source.locationCount} locations)` : ""}
            </AlertTitle>
            <AlertDescription>
              {session.modifyRows.length} rule(s), {session.deleteRows.length} delete row(s) and {session.karenzEntries.length} Karenz / other-cluster
              entr{session.karenzEntries.length === 1 ? "y" : "ies"} are in this session now. Review them in steps 3 and 4.
            </AlertDescription>
          </Alert>
        )}

        {countDiffers && source && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900 [&>svg]:text-amber-700">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Number of locations changed</AlertTitle>
            <AlertDescription>
              The playbook had {source.locationCount} locations, you uploaded {session.files.length}. All-locations rules divide by {session.files.length}.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
