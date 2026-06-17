// frontend/src/pages/signup/steps/WelcomeStep.tsx
import { Check } from "lucide-react";
import { Button } from "../../../components/ui/button";

export interface WelcomeStepProps {
  firstName: string;
  onStartSelling: () => void;
  onBrowse: () => void;
}

export function WelcomeStep({ firstName, onStartSelling, onBrowse }: WelcomeStepProps) {
  return (
    <div className="text-center flex flex-col items-center">
      <div className="size-14 rounded-full bg-primary text-on-primary flex items-center justify-center mb-4">
        <Check className="size-7" />
      </div>
      <h2 className="text-xl font-extrabold text-ink tracking-tight">You're in{firstName ? `, ${firstName}` : ""}</h2>
      <p className="text-sm text-muted mt-1 mb-5">Got something to sell? List your first item in under a minute.</p>
      <Button onClick={onStartSelling} className="w-full">Start selling</Button>
      <button onClick={onBrowse} className="text-sm font-semibold text-muted hover:text-ink mt-3">Browse for now</button>
    </div>
  );
}
