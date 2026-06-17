// frontend/src/pages/signup/steps/LocationStep.tsx
// Location step: address autocomplete → revealed read-only city/state/neighborhood/zip,
// building disclosure always shown. Icon chip + TypedHeadline are in the wizard shell.
import { ShieldCheck } from "lucide-react";
import { AddressAutocompleteInput } from "../../../components/AddressAutocompleteInput";
import type { AddressSuggestion } from "../../../lib/mapboxSearch";

export interface LocationStepProps {
  address: string;
  city: string;
  state: string;
  neighborhood: string;
  zip: string;
  addrSelected: boolean;
  onChangeText: (v: string) => void;
  onSelect: (s: AddressSuggestion) => void;
}

// Shared read-only field style
const roInput =
  "w-full border-[1.5px] border-border-strong rounded-sm px-[13px] py-[11px] text-sm text-body bg-surface-soft font-sans";

export function LocationStep({
  address,
  city,
  state,
  neighborhood,
  zip,
  addrSelected,
  onChangeText,
  onSelect,
}: LocationStepProps) {
  return (
    <div>
      {/* Street address autocomplete */}
      <div className="text-[11px] font-semibold text-muted-soft mb-[5px]">Street address</div>
      <AddressAutocompleteInput
        id="signup-address"
        placeholder="Start typing your address"
        value={address}
        onChangeText={onChangeText}
        onSelect={onSelect}
      />

      {/* City / State / Neighborhood / ZIP — revealed after selection */}
      {addrSelected && (
        <div
          className="grid grid-cols-2 gap-3 mt-1 mb-0.5"
          style={{ animation: "wizardStepIn 250ms ease-out both" }}
        >
          <div>
            <div className="text-[11px] font-semibold text-muted-soft mb-[5px]">City</div>
            <input className={roInput} value={city} readOnly />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-muted-soft mb-[5px]">State</div>
            <input className={roInput} value={state} readOnly />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-muted-soft mb-[5px]">Neighborhood</div>
            <input className={roInput} value={neighborhood} readOnly />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-muted-soft mb-[5px]">ZIP</div>
            <input className={roInput} value={zip} readOnly />
          </div>
        </div>
      )}

      {/* Building disclosure — always shown */}
      <div className="flex gap-[9px] items-start mt-4 px-[13px] py-[11px] border border-hairline bg-surface-soft rounded-lg">
        <ShieldCheck className="w-[15px] h-[15px] text-primary-text flex-none mt-[1px]" />
        <p className="m-0 text-[11.5px] text-muted leading-[1.5]">
          Your exact address stays private. We&apos;ll let others{" "}
          <strong className="text-body font-semibold">in your building</strong> know
          you&apos;re neighbors, so it&apos;s easier to sell to people you trust. You can
          change this in Settings.
        </p>
      </div>
    </div>
  );
}
