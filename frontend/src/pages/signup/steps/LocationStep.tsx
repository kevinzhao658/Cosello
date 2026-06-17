// frontend/src/pages/signup/steps/LocationStep.tsx
import { Building2 } from "lucide-react";
import { AddressAutocompleteInput } from "../../../components/AddressAutocompleteInput";
import { LocationCombobox } from "../../../components/LocationCombobox";

export interface LocationStepProps {
  address: string;
  zip: string;
  neighborhood: string;
  neighborhoods: readonly string[];
  onAddress: (v: string) => void;
  onSelectAddress: (label: string, zip: string) => void;
  onZip: (v: string) => void;
  onNeighborhood: (v: string) => void;
}

export function LocationStep(p: LocationStepProps) {
  return (
    <div className="space-y-4">
      <div className="size-9 rounded-md bg-primary-soft text-primary-text flex items-center justify-center">
        <Building2 className="size-5" />
      </div>
      <h2 className="text-xl font-extrabold text-ink tracking-tight">Where are you based?</h2>
      <p className="text-sm text-muted">We use this to group nearby listings and set your building.</p>
      <AddressAutocompleteInput
        id="signup-address"
        placeholder="Street address"
        value={p.address}
        onChangeText={p.onAddress}
        onSelect={(s) => p.onSelectAddress(s.label, s.zip)}
      />
      <p className="text-[10px] text-muted-soft leading-relaxed">
        Your address always stays private, unless you choose to share it with mutuals or confirmed buyers.
      </p>
      <div>
        <label className="block text-xs text-muted mb-1.5 font-semibold">Neighborhood</label>
        <LocationCombobox id="signup-neighborhood-zip" value={p.zip} onChange={p.onZip} />
      </div>
    </div>
  );
}
