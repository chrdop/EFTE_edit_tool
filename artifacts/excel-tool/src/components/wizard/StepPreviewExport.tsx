import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Session, usePreviewChanges, useExportSession } from "@workspace/api-client-react";
import { Download, AlertCircle, FileText, CheckCircle2 } from "lucide-react";
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
        <div className="space-y-4 border rounded-lg p-6 bg-card">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!isPreviewLoading && !isPreviewError && previewData && (
        <div className="space-y-6">
          {!hasChanges ? (
            <Alert className="bg-muted/50">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertTitle>Keine Zeilenänderungen konfiguriert</AlertTitle>
              <AlertDescription>
                Die Master-Datei wird ohne Lösch- oder Anpassungsregeln erstellt.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Delete preview */}
              {hasDeletes && (
                <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
                  <div className="bg-destructive/10 px-4 py-3 border-b border-destructive/20 flex items-center">
                    <AlertCircle className="h-4 w-4 text-destructive mr-2" />
                    <h3 className="font-semibold text-sm text-destructive">Zeilen die geleert werden (auf 0 gesetzt)</h3>
                  </div>
                  <ScrollArea className="max-h-60">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                        <TableRow>
                          <TableHead className="w-16">Zeile</TableHead>
                          <TableHead>Standort</TableHead>
                          <TableHead className="text-right">Ist Hours</TableHead>
                          <TableHead className="text-right">Ist EFTE</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.deletePreview.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                            <TableCell className="text-xs">{row.locationName || row.sheetName}</TableCell>
                            <TableCell className="text-right font-mono text-xs line-through text-muted-foreground">
                              {row.currentHours ?? "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs line-through text-muted-foreground">
                              {row.currentEfte ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}

              {/* Modify preview */}
              {hasModifies && (
                <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
                  <div className="bg-primary/10 px-4 py-3 border-b border-primary/20 flex items-center">
                    <FileText className="h-4 w-4 text-primary mr-2" />
                    <h3 className="font-semibold text-sm text-primary">Zeilen die angepasst werden</h3>
                  </div>
                  <ScrollArea className="max-h-96 overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                        <TableRow>
                          <TableHead className="w-16">Zeile</TableHead>
                          <TableHead>Standort</TableHead>
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
            </>
          )}
        </div>
      )}

      <div className="pt-6 flex justify-between border-t mt-8">
        <Button variant="outline" onClick={onBack} size="lg">
          Zurück
        </Button>
        <Button
          onClick={handleExport}
          disabled={isExporting || isPreviewLoading || isPreviewError}
          size="lg"
          className="min-w-40 shadow-md font-semibold"
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
