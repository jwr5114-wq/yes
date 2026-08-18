import React from "react";

interface StepTabsProps {
  currentStep: number;
  onStepChange: (step: number) => void;
}

export const StepTabs: React.FC<StepTabsProps> = ({ currentStep, onStepChange }) => {
  const steps = [
    { id: 1, label: "1. 기본&방침" },
    { id: 2, label: "2. 평가 개요" },
    { id: 3, label: "3. 수행평가" },
    { id: 4, label: "4. 진도/수업" },
    { id: 5, label: "5. 성취수준" },
  ];

  return (
    <div className="bg-slate-100 border-b border-slate-200 p-2 grid grid-cols-5 gap-1 text-center text-xs font-medium shrink-0">
      {steps.map((step) => {
        const isActive = currentStep === step.id;
        return (
          <button
            key={step.id}
            onClick={() => onStepChange(step.id)}
            className={`p-2 rounded-md transition-all text-xs ${
              isActive
                ? "bg-blue-600 text-white font-bold shadow-sm"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            {step.label}
          </button>
        );
      })}
    </div>
  );
};
