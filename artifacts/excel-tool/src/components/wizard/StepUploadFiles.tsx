import { useCallback, useState } from "react";
import { UploadCloud, FileSpreadsheet, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    
    // Check total files (up to 10)
    if (session.files.length + files.length > 10) {
      setError("Maximum 10 files allowed");
      return;
    }

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    files.forEach(f => formData.append("files", f));

    try {
      const res = await fetch(`/api/sessions/${sessionId}/upload`, {
        method: "POST",
        body: formData
      });
      if (!res.ok) {
        throw new Error("Failed to upload files");
      }
      refreshSession();
    } catch (err) {
      setError("An error occurred while uploading. Please try again.");
      console.error(err);
    } finally {
      setIsUploading(false);
      setIsDragging(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));
    uploadFiles(droppedFiles);
  }, [session.files.length, sessionId, refreshSession]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      uploadFiles(selectedFiles);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Upload Excel Files</h2>
        <p className="text-sm text-muted-foreground mt-1">Upload up to 10 cost center reports (.xlsx, .xls) for the month.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          isUploading ? "opacity-50 pointer-events-none" : ""
        )}
      >
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <UploadCloud className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">Drag & drop files here</h3>
            <p className="text-sm text-muted-foreground">or click to browse</p>
          </div>
          <input
            type="file"
            multiple
            accept=".xlsx,.xls"
            className="hidden"
            id="file-upload"
            onChange={onFileChange}
          />
          <Button asChild variant="outline" className="mt-4">
            <label htmlFor="file-upload" className="cursor-pointer">
              Select Files
            </label>
          </Button>
        </div>
      </div>

      {session.files.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Uploaded Files ({session.files.length}/10)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {session.files.map((file) => (
              <Card key={file.id} className="overflow-hidden bg-card/50">
                <CardHeader className="p-4 pb-2 border-b bg-muted/20">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3 truncate">
                      <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                      <div className="truncate">
                        <CardTitle className="text-sm font-medium truncate">{file.originalName}</CardTitle>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-3">
                  <p className="text-xs text-muted-foreground font-medium mb-2">Detected Sheets:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {file.sheetNames.map((sheet, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground border">
                        {sheet}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="pt-6 flex justify-end border-t">
        <Button onClick={onNext} disabled={session.files.length === 0} size="lg" className="min-w-32 shadow-sm font-semibold">
          Next Step
        </Button>
      </div>
    </div>
  );
}
