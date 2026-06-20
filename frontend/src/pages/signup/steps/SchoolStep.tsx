// frontend/src/pages/signup/steps/SchoolStep.tsx
// School step: search + pills below search bar (search hidden at 2). School disclosure always shown.
// Icon chip + TypedHeadline are in the wizard shell.
import { ShieldCheck } from "lucide-react";
import { type School } from "../../../lib/useSchoolSearch";
import { SchoolPicker } from "../../../components/ui/SchoolPicker";

export interface SchoolStepProps {
  selected: School[];
  onAdd: (s: School) => void;
  onRemove: (id: number) => void;
}

export function SchoolStep({ selected, onAdd, onRemove }: SchoolStepProps) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-soft mb-[5px]">Schools</div>

      <SchoolPicker
        selected={selected}
        onAdd={onAdd}
        onRemove={onRemove}
        max={2}
        placeholder="Search your school"
      />

      {/* School disclosure — always shown */}
      <div className="flex gap-[9px] items-start mt-4 px-[13px] py-[11px] border border-hairline bg-surface-soft rounded-lg">
        <ShieldCheck className="w-[15px] h-[15px] text-primary-text flex-none mt-[1px]" />
        <p className="m-0 text-[11.5px] text-muted leading-[1.5]">
          We&apos;ll let others{" "}
          <strong className="text-body font-semibold">from your school</strong> know you
          attended too, so it&apos;s easier to sell to people you trust. You can change
          this in Settings.
        </p>
      </div>
    </div>
  );
}
