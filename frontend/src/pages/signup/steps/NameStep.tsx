// frontend/src/pages/signup/steps/NameStep.tsx
import { Input } from "../../../components/ui/input";

export interface NameStepProps {
  firstName: string;
  lastName: string;
  onFirst: (v: string) => void;
  onLast: (v: string) => void;
}

export function NameStep({ firstName, lastName, onFirst, onLast }: NameStepProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-extrabold text-ink tracking-tight">What's your name?</h2>
      <p className="text-sm text-muted">This is how buyers and sellers will know you.</p>
      <Input placeholder="First" value={firstName} onChange={(e) => onFirst(e.target.value)} />
      <Input placeholder="Last" value={lastName} onChange={(e) => onLast(e.target.value)} />
    </div>
  );
}
