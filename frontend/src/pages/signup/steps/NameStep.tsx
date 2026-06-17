// frontend/src/pages/signup/steps/NameStep.tsx
import { Input } from "../../../components/ui/input";
import { TypedHeadline } from "../../../components/TypedHeadline";

export interface NameStepProps {
  firstName: string;
  lastName: string;
  onFirst: (v: string) => void;
  onLast: (v: string) => void;
}

export function NameStep({ firstName, lastName, onFirst, onLast }: NameStepProps) {
  return (
    <div className="space-y-3">
      <TypedHeadline text="What's your name?" />
      <p className="text-sm text-muted text-center">This is how buyers and sellers will know you.</p>
      <Input placeholder="First" value={firstName} onChange={(e) => onFirst(e.target.value)} />
      <Input placeholder="Last" value={lastName} onChange={(e) => onLast(e.target.value)} />
    </div>
  );
}
