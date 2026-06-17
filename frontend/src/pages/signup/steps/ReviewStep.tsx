// frontend/src/pages/signup/steps/ReviewStep.tsx
// Review step: summary of Name / Location / Schools with per-row Edit buttons,
// plus Terms & Conditions checkbox that toggles in-place (no wizard re-render).
import { Building2, Check, GraduationCap, Pencil, User } from "lucide-react";
import type { School } from "../../../lib/useSchoolSearch";

export interface ReviewStepProps {
  firstName: string;
  lastName: string;
  pronouns: string;
  address: string;
  neighborhood: string;
  schools: School[];
  termsAccepted: boolean;
  onTermsChange: (v: boolean) => void;
  onEdit: (stepIndex: number) => void;
}

export function ReviewStep({
  firstName,
  lastName,
  pronouns,
  address,
  neighborhood,
  schools,
  termsAccepted,
  onTermsChange,
  onEdit,
}: ReviewStepProps) {
  const displayName = `${firstName} ${lastName}`.trim() || "Not set";
  const showPronouns = pronouns && pronouns !== "Prefer not to say";
  const locationLine = neighborhood && address ? `${neighborhood} · ${address}` : address || neighborhood || "Not set";
  const schoolsLine = schools.length > 0 ? schools.map((s) => s.name).join(", ") : "None added";

  return (
    <div>
      {/* Summary card */}
      <div className="border border-hairline rounded-lg overflow-hidden mb-[18px]">
        {/* Name row */}
        <div className="flex items-center gap-3 px-[15px] py-[13px]">
          <span className="w-[30px] h-[30px] rounded-[7px] bg-surface-soft text-primary-text flex items-center justify-center flex-none">
            <User className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-soft uppercase tracking-[0.04em]">Name</div>
            <div className="text-[13.5px] text-ink font-semibold">
              {displayName}
              {showPronouns && (
                <span className="font-medium text-muted"> · {pronouns}</span>
              )}
            </div>
          </span>
          <button
            type="button"
            onClick={() => onEdit(0)}
            className="flex-none inline-flex items-center gap-[5px] border-none bg-transparent cursor-pointer text-muted text-xs font-semibold px-[7px] py-[5px] rounded-md hover:text-primary-text hover:bg-primary-soft transition-colors"
          >
            <Pencil className="w-[13px] h-[13px]" />
            Edit
          </button>
        </div>

        {/* Location row */}
        <div className="flex items-center gap-3 px-[15px] py-[13px] border-t border-hairline">
          <span className="w-[30px] h-[30px] rounded-[7px] bg-surface-soft text-primary-text flex items-center justify-center flex-none">
            <Building2 className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-soft uppercase tracking-[0.04em]">Location</div>
            <div className="text-[13.5px] text-ink font-semibold truncate">{locationLine}</div>
          </span>
          <button
            type="button"
            onClick={() => onEdit(1)}
            className="flex-none inline-flex items-center gap-[5px] border-none bg-transparent cursor-pointer text-muted text-xs font-semibold px-[7px] py-[5px] rounded-md hover:text-primary-text hover:bg-primary-soft transition-colors"
          >
            <Pencil className="w-[13px] h-[13px]" />
            Edit
          </button>
        </div>

        {/* Schools row */}
        <div className="flex items-center gap-3 px-[15px] py-[13px] border-t border-hairline">
          <span className="w-[30px] h-[30px] rounded-[7px] bg-surface-soft text-primary-text flex items-center justify-center flex-none">
            <GraduationCap className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-soft uppercase tracking-[0.04em]">Schools</div>
            <div className="text-[13.5px] text-ink font-semibold truncate">{schoolsLine}</div>
          </span>
          <button
            type="button"
            onClick={() => onEdit(2)}
            className="flex-none inline-flex items-center gap-[5px] border-none bg-transparent cursor-pointer text-muted text-xs font-semibold px-[7px] py-[5px] rounded-md hover:text-primary-text hover:bg-primary-soft transition-colors"
          >
            <Pencil className="w-[13px] h-[13px]" />
            Edit
          </button>
        </div>
      </div>

      {/* Terms & Conditions checkbox — toggles in place (local state via prop) */}
      <label
        className="flex gap-[11px] items-start cursor-pointer mb-1"
        onClick={() => onTermsChange(!termsAccepted)}
      >
        <span
          className={`w-5 h-5 rounded-[5px] border-[1.5px] flex-none flex items-center justify-center mt-[1px] transition-all ${
            termsAccepted
              ? "bg-primary border-primary"
              : "bg-canvas border-border-strong"
          }`}
        >
          <Check className={`w-[13px] h-[13px] text-on-primary transition-opacity ${termsAccepted ? "opacity-100" : "opacity-0"}`} />
        </span>
        <span className="text-[12.5px] text-body leading-[1.45]" onClick={(e) => e.stopPropagation()}>
          By creating a profile, I agree to the{" "}
          <a href="#" className="text-legal-link font-semibold no-underline hover:underline">
            Terms &amp; Conditions
          </a>{" "}
          and{" "}
          <a href="#" className="text-legal-link font-semibold no-underline hover:underline">
            Privacy Policy
          </a>
          .
        </span>
      </label>
    </div>
  );
}
