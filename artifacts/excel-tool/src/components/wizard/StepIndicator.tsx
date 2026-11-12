import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  currentStep: number;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const steps = [
    { id: 1, name: "Upload Files" },
    { id: 2, name: "Select Month" },
    { id: 3, name: "Delete Rows" },
    { id: 4, name: "Modify Rows" },
    { id: 5, name: "Preview & Export" }
  ];

  return (
    <div className="w-full px-4 py-6 border-b bg-card">
      <div className="max-w-4xl mx-auto">
        <nav aria-label="Progress">
          <ol role="list" className="flex items-center justify-between">
            {steps.map((step, stepIdx) => {
              const isCompleted = currentStep > step.id;
              const isCurrent = currentStep === step.id;

              return (
                <li key={step.name} className={cn("relative", stepIdx !== steps.length - 1 ? "pr-8 sm:pr-20 flex-1" : "")}>
                  {stepIdx !== steps.length - 1 && (
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className={cn("h-0.5 w-full", isCompleted ? "bg-ok" : "bg-border")} />
                    </div>
                  )}
                  <div className={cn(
                    "relative flex h-8 w-8 items-center justify-center rounded-full border-2 mx-auto sm:mx-0",
                    isCompleted ? "bg-ok border-ok" : isCurrent ? "bg-background border-primary" : "bg-background border-border",
                  )}>
                    {isCompleted ? (
                      <Check className="h-5 w-5 text-background" aria-hidden="true" />
                    ) : (
                      <span className={cn("text-xs font-semibold", isCurrent ? "text-primary" : "text-muted-foreground")}>
                        {step.id}
                      </span>
                    )}
                  </div>
                  <div className="hidden sm:block absolute -bottom-6 left-0 w-max text-left">
                    <span className={cn("text-xs font-medium", isCurrent ? "text-primary" : "text-muted-foreground")}>
                      {step.name}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          {/* Phone width: labels don't fit under the circles, show only the current step */}
          <p className="sm:hidden mt-3 text-center text-xs font-medium text-primary">
            Step {currentStep} of {steps.length} · {steps[currentStep - 1]?.name}
          </p>
        </nav>
      </div>
    </div>
  );
}
