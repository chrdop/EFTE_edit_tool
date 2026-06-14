import { useCallback, useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Session } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

interface StepUploadFilesProps {
  session: Session;
  sessionId: string;
  onNext: () => void;
  refreshSession: () => void;
}

export function StepUploadFiles({ session, sessionId, onNext, refreshSession }: StepUploadFilesProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragCounter = useRef(0);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    if (session.files.length + files.length > 15) {
      setError("Maximum 15 files allowed.");
      return;
    }

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    try {
      const res = await fetch(`/api/sessions/${sessionId}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Upload failed");
      }
      refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error during upload.");
    } finally {
      setIsUploading(false);
      setIsDragging(false);
      dragCounter.current = 0;
    }
  }, [session.files.length, sessionId, refreshSession]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".ods"),
    );
    if (droppedFiles.length === 0) {
      setError("Only .xlsx, .xls or .ods files are accepted.");
      return;
    }
    uploadFiles(droppedFiles);
  }, [uploadFiles]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  }, [uploadFiles]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Upload Files</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Up to 15 location reports (.xlsx, .xls) via drag & drop or file selection.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-default",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50",
          isUploading ? "opacity-50 pointer-events-none" : "",
        )}
      >
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className={cn(
            "h-12 w-12 rounded-full flex items-center justify-center transition-colors",
            isDragging ? "bg-primary/20" : "bg-primary/10",
          )}>
            <UploadCloud className={cn("h-6 w-6 transition-colors", isDragging ? "text-primary" : "text-primary/70")} />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">
              {isDragging ? "Drop files here" : "Drag files here"}
            </h3>
            <p className="text-sm text-muted-foreground">or select via button below</p>
          </div>
          <input
            type="file"
            multiple
            accept=".xlsx,.xls,.ods"
            className="hidden"
            id="file-upload"
            onChange={onFileChange}
          />
          <Button asChild variant="outline" className="mt-4" disabled={isUploading}>
            <label htmlFor="file-upload" className="cursor-pointer">
              {isUploading ? "Uploading…" : "Select files"}
            </label>
          </Button>
        </div>
      </div>

      {session.files.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
            Uploaded files ({session.files.length}/15)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {session.files.map((file) => (
              <Card key={file.id} className="overflow-hidden bg-card/50">
                <CardHeader className="p-4 pb-2 border-b bg-muted/20">
                  <div className="flex items-center space-x-3 truncate">
                    <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                    <CardTitle className="text-sm font-medium truncate">{file.originalName}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-3">
                  <p className="text-xs text-muted-foreground font-medium mb-2">Detected sheets:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {file.sheetNames.map((sheet, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground border"
                      >
                        {sheet}
                      </span>
                    ))}
                  </div>
                  {file.detectedMonths.length > 0 && (
                    <>
                      <p className="text-xs text-muted-foreground font-medium mt-2 mb-1.5">Detected months:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {file.detectedMonths.map((m, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="pt-6 flex justify-end border-t">
        <Button
          onClick={onNext}
          disabled={session.files.length === 0}
          size="lg"
          className="min-w-32 shadow-sm font-semibold"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
