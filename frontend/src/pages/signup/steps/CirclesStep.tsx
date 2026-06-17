// frontend/src/pages/signup/steps/CirclesStep.tsx
import { CirclePreview } from "../CirclePreview";

export type Consent = { building: boolean | null; school: boolean | null; mutualFriends: boolean | null };

export interface CirclesStepProps {
  hasSchool: boolean;
  consent: Consent;
  onAnswer: (key: keyof Consent, value: boolean) => void;
}

const ASK: Record<keyof Consent, string> = {
  building: "Show to neighbors from your building",
  school: "Show to students from your school",
  mutualFriends: "Show to people we both know",
};

export function CirclesStep({ hasSchool, consent, onAnswer }: CirclesStepProps) {
  const keys = (["building", "school", "mutualFriends"] as (keyof Consent)[]).filter(
    (k) => k !== "school" || hasSchool,
  );
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold text-ink tracking-tight">Would you like mutuals to view your circles?</h2>
      <p className="text-sm text-muted">Sharing a circle reveals it only when others in the same circle are viewing your listings.</p>
      {keys.map((k) => (
        <div key={k} className="border border-border-strong rounded-sm p-4">
          <p className="text-sm font-semibold text-body mb-3">{ASK[k]}</p>
          <div className="flex gap-3">
            {([true, false] as const).map((val) => (
              <button key={String(val)} type="button" onClick={() => onAnswer(k, val)}
                className={`flex-1 text-center rounded-sm border py-2.5 text-sm font-bold ${
                  consent[k] === val
                    ? "border-primary bg-primary-soft text-primary-text"
                    : "border-border-strong text-ink"
                }`}>
                {val ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div>
        <p className="text-xs font-semibold text-muted mb-2">How mutuals will see your listings:</p>
        <CirclePreview
          building={consent.building === true}
          school={consent.school === true}
          mutualFriends={consent.mutualFriends === true}
        />
      </div>
    </div>
  );
}
