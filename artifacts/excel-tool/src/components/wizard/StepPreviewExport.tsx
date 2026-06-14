import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Session, usePreviewChanges, useExportSession, useSendEmail } from "@workspace/api-client-react";
import { Download, AlertCircle, FileText, CheckCircle2, Mail, Send } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface StepPreviewExportProps {
  session: Session;
  sessionId: string;
  onBack: () => void;
}

export function StepPreviewExport({ session, sessionId, onBack }: StepPreviewExportProps) {
  const { mutate: fetchPreview, data: previewData, isPending: isPreviewLoading, isError: isPreviewError } = usePreviewChanges();
  const { mutate: exportSession, isPending: isExporting } = useExportSession();
  const { mutate: sendEmail, isPending: isSending } = useSendEmail();

  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetchPreview({ sessionId });
  }, [sessionId, fetchPreview]);

  const handleExport = () => {
    exportSession(
      { sessionId },
      {
        onSuccess: (data) => {
          window.location.href = data.downloadUrl;
        },
      },
    );
  };

  const handleSendEmail = () => {
    if (!email.trim()) return;
    setEmailStatus(null);
    sendEmail(
      { sessionId, data: { recipientEmail: email.trim() } },
      {
        onSuccess: (data) => {
          setEmailStatus({ type: "success", message: data.message });
        },
        onError: (err: Error) => {
          setEmailStatus({ type: "error", message: err.message ?? "E-Mail konnte nicht gesendet werden." });
        },
      },
    );
  };

  const hasDeletes = previewData?.deletePreview && previewData.deletePreview.length > 0;
  const hasModifies = previewData?.modifyPreview && previewData.modifyPreview.length > 0;
  const hasChanges = hasDeletes || hasModifies;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Vorschau & Export</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Änderungen prüfen bevor die Master-Excel-Datei erstellt wird.
          </p>
        </div>
      </div>

      {isPreviewError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Vorschau fehlgeschlagen</AlertTitle>
          <AlertDescription>
            Vorschau konnte nicht geladen werden. Bitte sicherstellen, dass die konfigurierten Zeilen in den Dateien vorhanden sind.
          </AlertDescription>
        </Alert>
      )}

      {isPreviewLoading && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {previewData && (
        <div className="space-y-5">
          {!hasChanges && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Keine Änderungen</AlertTitle>
              <AlertDescription>Es wurden keine Zeilen zum Löschen oder Anpassen konfiguriert.</AlertDescription>
            </Alert>
          )}

          {hasDeletes && (
            <div className="border rounded-lg overflow-hidden shadow-sm">
              <div className="bg-red-50/60 px-4 py-3 border-b flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-500" />
                <span className="text-sm font-semibold text-red-700">Zeilen die gelöscht werden</span>
              </div>
              <ScrollArea className="max-h-60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-xs">Zeile</TableHead>
                      <TableHead className="text-xs">Standort</TableHead>
                      <TableHead className="text-right bg-blue-50/60 text-blue-700/80 text-xs">Ist Hours</TableHead>
                      <TableHead className="text-right bg-blue-50/60 text-blue-700/80 text-xs">Ist EFTE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.deletePreview.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                        <TableCell className="text-xs">{row.locationName || row.sheetName}</TableCell>
                        <TableCell className="text-right font-mono text-xs bg-blue-50/40 text-muted-foreground">
                          {row.currentHours ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs bg-blue-50/40 text-muted-foreground">
                          {row.currentEfte ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {hasModifies && (
            <div className="border rounded-lg overflow-hidden shadow-sm">
              <div className="bg-blue-50/60 px-4 py-3 border-b flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-blue-700">Zeilen die angepasst werden</span>
              </div>
              <ScrollArea className="max-h-72">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-xs">Zeile</TableHead>
                      <TableHead className="text-xs">Standort</TableHead>
                      <TableHead className="text-right bg-blue-50/60 text-blue-700/80 text-xs">Ist Hours</TableHead>
                      <TableHead className="text-right bg-blue-50/60 text-blue-700/80 text-xs">Ist EFTE</TableHead>
                      <TableHead className="text-right bg-primary/5 text-primary/80 text-xs">Hours neu</TableHead>
                      <TableHead className="text-right bg-primary/5 text-primary/80 text-xs">EFTE neu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.modifyPreview.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                        <TableCell className="text-xs">{row.locationName || row.sheetName}</TableCell>
                        <TableCell className="text-right font-mono text-xs bg-blue-50/40 text-muted-foreground">
                          {row.currentHours ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs bg-blue-50/40 text-muted-foreground">
                          {row.currentEfte ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs bg-primary/5 font-semibold text-primary">
                          {row.newHours?.toFixed(2) ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs bg-primary/5 font-semibold text-primary">
                          {row.newEfte?.toFixed(2) ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </div>
      )}

      {/* Email section */}
      <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
        <div className="bg-muted/40 px-4 py-3 border-b flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Per E-Mail senden</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Master-Excel-Datei und PDF-Anpassungsbericht werden an die angegebene E-Mail-Adresse gesendet.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="empfaenger@beispiel.at"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailStatus(null); }}
              className="flex-1"
              disabled={isSending}
            />
            <Button
              onClick={handleSendEmail}
              disabled={isSending || !email.trim() || isPreviewLoading}
              variant="secondary"
              className="shrink-0"
            >
              {isSending ? (
                "Senden…"
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1.5" />
                  Senden
                </>
              )}
            </Button>
          </div>
          {emailStatus && (
            <p className={`text-xs font-medium ${emailStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {emailStatus.message}
            </p>
          )}
        </div>
      </div>

      <div className="pt-4 flex justify-between border-t">
        <Button variant="outline" onClick={onBack} size="lg">
          Zurück
        </Button>
        <Button
          onClick={handleExport}
          disabled={isExporting || isPreviewLoading || isPreviewError}
          size="lg"
          className="min-w-48 shadow-md font-semibold"
        >
          {isExporting ? (
            "Wird erstellt…"
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Anwenden & Herunterladen
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
