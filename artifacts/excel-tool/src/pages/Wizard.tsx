import { useState } from "react";
import { useWizardSession } from "@/hooks/use-wizard-session";
import { StepIndicator } from "@/components/wizard/StepIndicator";
import { StepUploadFiles } from "@/components/wizard/StepUploadFiles";
import { StepSelectMonth } from "@/components/wizard/StepSelectMonth";
import { StepDeleteRows } from "@/components/wizard/StepDeleteRows";
import { StepModifyRows } from "@/components/wizard/StepModifyRows";
import { StepPreviewExport } from "@/components/wizard/StepPreviewExport";
import { Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Wizard() {
  const { session, sessionId, isLoading, refreshSession, resetSession } = useWizardSession();
  const [currentStep, setCurrentStep] = useState(1);

  // Jump straight to the first incomplete step or respect current step state
  // Let's just manage it manually for now via state.
  
  if (isLoading || !sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
          <p className="text-sm font-medium">Initializing session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background space-y-4">
        <p className="text-muted-foreground">Failed to load session.</p>
        <Button onClick={resetSession} variant="outline">
          <RefreshCcw className="mr-2 h-4 w-4" /> Start Over
        </Button>
      </div>
    );
  }

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 5));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="bg-card border-b sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-primary h-8 w-8 rounded flex items-center justify-center shadow-sm">
              <span className="text-primary-foreground font-bold font-mono text-sm">XT</span>
            </div>
            <h1 className="font-bold text-lg tracking-tight text-foreground">Excel Merge & Edit Tool</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={resetSession} className="text-muted-foreground hover:text-foreground">
            <RefreshCcw className="mr-2 h-4 w-4" />
            New Session
          </Button>
        </div>
      </header>

      <StepIndicator currentStep={currentStep} />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          {currentStep === 1 && (
            <StepUploadFiles session={session} sessionId={sessionId} onNext={nextStep} refreshSession={refreshSession} />
          )}
          {currentStep === 2 && (
            <StepSelectMonth session={session} sessionId={sessionId} onNext={nextStep} onBack={prevStep} refreshSession={refreshSession} />
          )}
          {currentStep === 3 && (
            <StepDeleteRows session={session} sessionId={sessionId} onNext={nextStep} onBack={prevStep} refreshSession={refreshSession} />
          )}
          {currentStep === 4 && (
            <StepModifyRows session={session} sessionId={sessionId} onNext={nextStep} onBack={prevStep} refreshSession={refreshSession} />
          )}
          {currentStep === 5 && (
            <StepPreviewExport session={session} sessionId={sessionId} onBack={prevStep} />
          )}
        </div>
      </main>
    </div>
  );
}
