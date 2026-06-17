// frontend/src/pages/signup/steps/NameStep.tsx
// Name step: labeled First/Last inputs + pronouns select (revealed when both names filled).
// TypedHeadline and icon chip are rendered by SignUpWizard shell.
import { User } from "lucide-react";

const PRONOUN_OPTIONS = [
  { value: "", label: "Select pronouns" },
  { value: "she/her", label: "she/her" },
  { value: "he/him", label: "he/him" },
  { value: "they/them", label: "they/them" },
  { value: "she/they", label: "she/they" },
  { value: "he/they", label: "he/they" },
  { value: "Prefer not to say", label: "Prefer not to say" },
] as const;

export interface NameStepProps {
  firstName: string;
  lastName: string;
  pronouns: string;
  onFirst: (v: string) => void;
  onLast: (v: string) => void;
  onPronouns: (v: string) => void;
}

export function NameStep({ firstName, lastName, pronouns, onFirst, onLast, onPronouns }: NameStepProps) {
  const showPronouns = !!firstName.trim() && !!lastName.trim();

  return (
    <div>
      {/* Icon chip */}
      <div className="w-[38px] h-[38px] rounded-lg bg-primary-soft text-primary-text flex items-center justify-center mx-auto mb-3">
        <User className="w-5 h-5" />
      </div>

      {/* First + Last — side by side */}
      <div className="flex gap-[10px]">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-muted-soft mb-[5px]">First name</div>
          <input
            type="text"
            className="w-full border-[1.5px] border-border-strong rounded-sm px-[13px] py-[11px] text-sm text-ink bg-canvas placeholder:text-muted-soft font-sans focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-[color,box-shadow]"
            placeholder="First"
            value={firstName}
            onChange={(e) => onFirst(e.target.value)}
            autoComplete="given-name"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-muted-soft mb-[5px]">Last name</div>
          <input
            type="text"
            className="w-full border-[1.5px] border-border-strong rounded-sm px-[13px] py-[11px] text-sm text-ink bg-canvas placeholder:text-muted-soft font-sans focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-[color,box-shadow]"
            placeholder="Last"
            value={lastName}
            onChange={(e) => onLast(e.target.value)}
            autoComplete="family-name"
          />
        </div>
      </div>

      {/* Pronouns — renders only once both names are filled */}
      {showPronouns && (
        <div className="mt-3" style={{ animation: "wizardStepIn 250ms ease-out both" }}>
          <div className="text-[11px] font-semibold text-muted-soft mb-[5px]">
            Pronouns <span className="font-medium text-muted-soft">· optional</span>
          </div>
          <select
            className="w-full border-[1.5px] border-border-strong rounded-sm px-[13px] py-[11px] text-sm text-ink bg-canvas font-sans cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-[color,box-shadow] appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239A93A6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              backgroundSize: "16px",
              paddingRight: "38px",
            }}
            value={pronouns}
            onChange={(e) => onPronouns(e.target.value)}
          >
            {PRONOUN_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
