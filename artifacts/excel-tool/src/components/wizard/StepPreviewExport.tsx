import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Session, usePreviewChanges, useExportSession } from "@workspace/api-client-react";
import { Download, AlertCircle, FileText, CheckCircle2, ChevronRight } from "lucide-react";
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
        }
      }
    );
  };

  const hasDeletes = previewData?.deletePreview && previewData.deletePreview.length > 0;
  const hasModifies = previewData?.modifyPreview && previewData.modifyPreview.length > 0;
  const hasChanges = hasDeletes || hasModifies;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Preview & Export</h2>
          <p className="text-sm text-muted-foreground mt-1">Review the changes before applying them to the master Excel file.</p>
        </div>
      </div>

      {isPreviewError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Preview Failed</AlertTitle>
          <AlertDescription>Failed to generate preview. Ensure your configured rows exist in the uploaded files.</AlertDescription>
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
              <AlertTitle>No specific row changes configured</AlertTitle>
              <AlertDescription>
                The master file will be generated without any row deletions or modifications.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {hasDeletes && (
                <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
                  <div className="bg-destructive/10 px-4 py-3 border-b border-destructive/20 flex items-center">
                    <AlertCircle className="h-4 w-4 text-destructive mr-2" />
                    <h3 className="font-semibold text-sm text-destructive">Rows to be Zeroed (Cleared)</h3>
                  </div>
                  <ScrollArea className="max-h-60">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                        <TableRow>
                          <TableHead className="w-20">Row</TableHead>
                          <TableHead>Sheet Name</TableHead>
                          <TableHead className="text-right">Current Hours</TableHead>
                          <TableHead className="text-right">Current EFTE</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.deletePreview.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                            <TableCell className="text-xs">{row.sheetName}</TableCell>
                            <TableCell className="text-right font-mono text-xs line-through text-muted-foreground">{row.currentHours ?? "-"}</TableCell>
                            <TableCell className="text-right font-mono text-xs line-through text-muted-foreground">{row.currentEfte ?? "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}

              {hasModifies && (
                <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
                  <div className="bg-primary/10 px-4 py-3 border-b border-primary/20 flex items-center">
                    <FileText className="h-4 w-4 text-primary mr-2" />
                    <h3 className="font-semibold text-sm text-primary">Rows to be Modified</h3>
                  </div>
                  <ScrollArea className="max-h-96 overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                        <TableRow>
                          <TableHead className="w-20">Row</TableHead>
                          <TableHead>Sheet Name</TableHead>
                          <TableHead className="text-right">Hours (Before)</TableHead>
                          <TableHead className="text-right">Hours (After)</TableHead>
                          <TableHead className="text-right">EFTE (Before)</TableHead>
                          <TableHead className="text-right">EFTE (After)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.modifyPreview.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                            <TableCell className="text-xs">{row.sheetName}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">{row.currentHours ?? "-"}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold text-primary">
                              {row.newHours?.toFixed(2) ?? "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">{row.currentEfte ?? "-"}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold text-primary">
                              {row.newEfte?.toFixed(2) ?? "-"}
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
          Back
        </Button>
        <Button 
          onClick={handleExport} 
          disabled={isExporting || isPreviewLoading || isPreviewError} 
          size="lg" 
          className="min-w-40 shadow-md font-semibold"
        >
          {isExporting ? (
            "Generating..."
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Apply & Download
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
