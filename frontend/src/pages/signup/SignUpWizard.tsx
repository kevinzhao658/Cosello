// frontend/src/pages/signup/SignUpWizard.tsx
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { AuthUser } from "../../contexts/AuthContext";
import { useNeighborhoods } from "../../lib/useNeighborhoods";
import { NYC_ZIP_SET, ZIP_NEIGHBORHOOD } from "../../lib/nycZips";
import type { School } from "../../lib/useSchoolSearch";
import { NameStep } from "./steps/NameStep";
import { LocationStep } from "./steps/LocationStep";
import { SchoolStep } from "./steps/SchoolStep";
import { CirclesStep, type Consent } from "./steps/CirclesStep";
import { WelcomeStep } from "./steps/WelcomeStep";

export interface SignUpWizardProps {
  pendingToken: string;
  onComplete: (user: AuthUser) => void;     // finalize auth/session
  onStartSelling: () => void;               // route into the sell wizard
  onBrowse: () => void;                      // route into the marketplace
  onCancel: () => void;
}

const STEPS = ["name", "location", "school", "circles"] as const;

export function SignUpWizard({ pendingToken, onComplete, onStartSelling, onBrowse, onCancel }: SignUpWizardProps) {
  const { list: neighborhoodsList } = useNeighborhoods();
  const neighborhoods = neighborhoodsList ?? [];

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [consent, setConsent] = useState<Consent>({ building: null, school: null, mutualFriends: null });

  const validNeighborhood = neighborhoods.some((n) => n.toLowerCase() === neighborhood.trim().toLowerCase());

  const stepValid = (): boolean => {
    switch (STEPS[step]) {
      case "name": return !!firstName.trim() && !!lastName.trim();
      case "location": return validNeighborhood && NYC_ZIP_SET.has(zip);
      case "school": return true; // optional
      case "circles": {
        const keys: (keyof Consent)[] = ["building", "mutualFriends", ...(schools.length ? (["school"] as (keyof Consent)[]) : [])];
        return keys.every((k) => consent[k] !== null);
      }
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pendingToken}` },
        body: JSON.stringify({
          display_name: `${firstName.trim()} ${lastName.trim()}`,
          neighborhood: neighborhood.trim(),
          pickup_address: address.trim() || undefined,
          zip_code: zip,
          school_seed_ids: schools.map((s) => s.id),
          share_building: consent.building === true,
          share_school: consent.school === true,
          share_mutual_friends: consent.mutualFriends === true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Registration failed" }));
        throw new Error((data as { detail: string }).detail);
      }
      onComplete((await res.json()) as AuthUser);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (!stepValid()) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else void submit();
  };

  /** When the user picks a ZIP via the combobox, also auto-derive the neighborhood. */
  const handleZipChange = (newZip: string) => {
    setZip(newZip);
    const derived = ZIP_NEIGHBORHOOD[newZip];
    if (derived) setNeighborhood(derived);
  };

  return (
    <section className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-sm bg-canvas border border-hairline rounded-md p-8 shadow-card">
        {done ? (
          <WelcomeStep firstName={firstName.trim()} onStartSelling={onStartSelling} onBrowse={onBrowse} />
        ) : (
          <>
            <div className="flex gap-1.5 mb-6">
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1 w-6 rounded-full ${i <= step ? "bg-primary" : "bg-hairline"}`} />
              ))}
            </div>

            {STEPS[step] === "name" && <NameStep firstName={firstName} lastName={lastName} onFirst={setFirstName} onLast={setLastName} />}
            {STEPS[step] === "location" && (
              <LocationStep
                address={address} zip={zip} neighborhood={neighborhood} neighborhoods={neighborhoods}
                onAddress={setAddress}
                onSelectAddress={(label, z) => { setAddress(label); handleZipChange(z); }}
                onZip={handleZipChange}
                onNeighborhood={setNeighborhood}
              />
            )}
            {STEPS[step] === "school" && (
              <SchoolStep token={pendingToken} selected={schools}
                onAdd={(s) => setSchools((prev) => (prev.length < 2 ? [...prev, s] : prev))}
                onRemove={(id) => setSchools((prev) => prev.filter((s) => s.id !== id))} />
            )}
            {STEPS[step] === "circles" && (
              <CirclesStep hasSchool={schools.length > 0} consent={consent}
                onAnswer={(k, v) => setConsent((prev) => ({ ...prev, [k]: v }))} />
            )}

            {error && <p className="text-sm text-error mt-3">{error}</p>}

            <Button onClick={next} disabled={!stepValid() || submitting} className="w-full mt-6 disabled:opacity-40">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : step === STEPS.length - 1 ? "Finish" : "Continue"}
            </Button>
            <div className="flex justify-between mt-3 text-sm">
              <button onClick={() => (step > 0 ? setStep(step - 1) : onCancel())} className="text-muted hover:text-ink">
                {step > 0 ? "Back" : "Cancel"}
              </button>
              {STEPS[step] === "school" && (
                <button onClick={() => setStep(step + 1)} className="text-muted hover:text-ink">Skip for now</button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
