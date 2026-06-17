// frontend/src/pages/signup/SignUpWizard.tsx
// Sell-wizard–chrome registration flow: Name → Location → School → Review → Welcome.
// ALL field state is lifted here so Back/Edit never resets anything.
import { useState } from "react";
import { ChevronLeft, Loader2, User, Building2, GraduationCap, type LucideIcon } from "lucide-react";
import { TypedHeadline } from "../../components/TypedHeadline";
import type { AuthUser } from "../../contexts/AuthContext";
import type { School } from "../../lib/useSchoolSearch";
import { NameStep } from "./steps/NameStep";
import { LocationStep } from "./steps/LocationStep";
import { SchoolStep } from "./steps/SchoolStep";
import { ReviewStep } from "./steps/ReviewStep";
import { WelcomeStep } from "./steps/WelcomeStep";

export interface SignUpWizardProps {
  pendingToken: string;
  onComplete: (user: AuthUser) => void;  // finalizes auth — does NOT navigate
  onStartSelling: () => void;            // routes into sell wizard
  onBrowse: () => void;                  // routes into marketplace
  onCancel: () => void;
}

const STEP_KEYS = ["name", "location", "school", "review"] as const;
type StepKey = (typeof STEP_KEYS)[number];

const HEADLINES: Record<StepKey, string> = {
  name: "What's your name?",
  location: "Where are you based?",
  school: "What school are you from?",
  review: "Does everything look good?",
};

const STEP_ICONS: Record<StepKey, LucideIcon | null> = {
  name:     User,
  location: Building2,
  school:   GraduationCap,
  review:   null,
};

export function SignUpWizard({
  pendingToken,
  onComplete,
  onStartSelling,
  onBrowse,
}: SignUpWizardProps) {
  // ── Navigation ─────────────────────────────────────────────────────────────
  const [stepIndex, setStepIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Lifted field state — never reset between steps ──────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [zip, setZip] = useState("");
  const [addrSelected, setAddrSelected] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const currentStep: StepKey = STEP_KEYS[stepIndex];

  // ── Per-step gate ────────────────────────────────────────────────────────────
  const stepReady = (): boolean => {
    switch (currentStep) {
      case "name":     return !!firstName.trim() && !!lastName.trim();
      case "location": return addrSelected;
      case "school":   return true; // optional
      case "review":   return termsAccepted;
    }
  };

  const HINT: Record<StepKey, string> = {
    name:     "Enter your first and last name to continue",
    location: "Select your address to continue",
    school:   "",
    review:   "Agree to the Terms & Conditions to continue",
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pendingToken}`,
        },
        body: JSON.stringify({
          display_name: `${firstName.trim()} ${lastName.trim()}`,
          neighborhood: neighborhood.trim(),
          pickup_address: address.trim() || undefined,
          zip_code: zip,
          pronouns: pronouns || undefined,
          school_seed_ids: schools.map((s) => s.id),
        }),
      });
      if (!res.ok) {
        const data: { detail?: string } = await res.json().catch(() => ({ detail: "Registration failed" }));
        throw new Error(data.detail ?? "Registration failed");
      }
      onComplete((await res.json()) as AuthUser);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = () => {
    if (!stepReady()) return;
    if (currentStep === "review") {
      void submit();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  if (done) {
    return (
      <section className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 bg-canvas">
        <div className="w-full max-w-md px-5">
          <WelcomeStep
            firstName={firstName.trim()}
            onStartSelling={onStartSelling}
            onBrowse={onBrowse}
          />
        </div>
      </section>
    );
  }

  const isReady = stepReady();
  const hint = HINT[currentStep];

  return (
    <section className="min-h-[calc(100vh-64px)] flex flex-col items-center px-4 bg-canvas pt-6 pb-16">
      <div className="w-full max-w-md pt-[82px]">
        {/* ── Step icon chip — above the headline, null on review step ── */}
        {STEP_ICONS[currentStep] !== null && (() => {
          const Icon = STEP_ICONS[currentStep] as LucideIcon;
          return (
            <div className="w-[38px] h-[38px] rounded-lg bg-primary-soft text-primary-text flex items-center justify-center mx-auto mb-3">
              <Icon className="w-5 h-5" />
            </div>
          );
        })()}

        {/* ── Back chevron — same markup as TypedInstruction's onBack chevron,
            centered relative container mb-2 directly above the typed headline.
            Hidden on step 0 (no back). ── */}
        <div className="relative flex items-center justify-center mb-2">
          {stepIndex > 0 && (
            <button
              type="button"
              aria-label="Back"
              onClick={() => setStepIndex((i) => i - 1)}
              className="absolute left-0 size-6 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <ChevronLeft className="size-3.5" />
            </button>
          )}
        </div>

        {/* ── Typed headline — keyed by step so component remounts and re-types ── */}
        <TypedHeadline text={HEADLINES[currentStep]} key={currentStep} />

        {/* ── Step content ── */}
        <div className="max-w-md mx-auto mt-[22px]" style={{ animation: "wizardStepIn 300ms ease-out both" }}>
          {currentStep === "name" && (
            <NameStep
              firstName={firstName}
              lastName={lastName}
              pronouns={pronouns}
              onFirst={setFirstName}
              onLast={setLastName}
              onPronouns={setPronouns}
            />
          )}
          {currentStep === "location" && (
            <LocationStep
              address={address}
              city={city}
              state={state}
              neighborhood={neighborhood}
              zip={zip}
              addrSelected={addrSelected}
              onChangeText={setAddress}
              onSelect={(s) => {
                setAddress(s.label);
                setZip(s.zip);
                setCity(s.city ?? "");
                setState(s.state ?? "");
                setNeighborhood(s.neighborhood ?? "");
                setAddrSelected(true);
              }}
            />
          )}
          {currentStep === "school" && (
            <SchoolStep
              selected={schools}
              onAdd={(s) => setSchools((prev) => (prev.length < 2 && !prev.some((x) => x.id === s.id) ? [...prev, s] : prev))}
              onRemove={(id) => setSchools((prev) => prev.filter((s) => s.id !== id))}
            />
          )}
          {currentStep === "review" && (
            <ReviewStep
              firstName={firstName}
              lastName={lastName}
              pronouns={pronouns}
              address={address}
              neighborhood={neighborhood}
              schools={schools}
              termsAccepted={termsAccepted}
              onTermsChange={setTermsAccepted}
              onEdit={(idx) => setStepIndex(idx)}
            />
          )}

          {error && <p className="text-sm text-error mt-3 text-center">{error}</p>}
        </div>

        {/* ── CTA button + hint ── */}
        <div className="max-w-md mx-auto mt-6">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!isReady || submitting}
            className="w-full text-center font-bold text-sm px-4 py-[13px] rounded-sm bg-primary text-on-primary border-none cursor-pointer disabled:bg-primary-disabled disabled:cursor-default transition-colors"
          >
            {submitting ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Creating profile…
              </span>
            ) : currentStep === "review" ? (
              "Create profile"
            ) : (
              "Continue"
            )}
          </button>
          {!isReady && hint && (
            <p className="text-center text-[10.5px] text-muted-soft mt-[9px]">{hint}</p>
          )}
        </div>
      </div>
    </section>
  );
}
