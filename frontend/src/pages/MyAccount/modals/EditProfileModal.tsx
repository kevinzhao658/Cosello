import React from "react";
import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { X, User, Loader2 } from "lucide-react";

export interface EditProfileModalProps {
  open: boolean;
  editFirstName: string;
  editLastName: string;
  editPickupAddress: string;
  editNeighborhood: string;
  editZipCode: string;
  editShowSuggestions: boolean;
  editFilteredNeighborhoods: readonly string[];
  editIsValidNeighborhood: boolean;
  editProfileError: string;
  isUpdatingProfile: boolean;
  editNeighborhoodRef: React.RefObject<HTMLInputElement | null>;
  editSuggestionsRef: React.RefObject<HTMLDivElement | null>;
  setEditFirstName: (s: string) => void;
  setEditLastName: (s: string) => void;
  setEditPickupAddress: (s: string) => void;
  setEditNeighborhood: (s: string) => void;
  setEditZipCode: (s: string) => void;
  setEditShowSuggestions: (b: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function EditProfileModal({
  open, editFirstName, editLastName, editPickupAddress, editNeighborhood, editZipCode,
  editShowSuggestions, editFilteredNeighborhoods, editIsValidNeighborhood,
  editProfileError, isUpdatingProfile, editNeighborhoodRef, editSuggestionsRef,
  setEditFirstName, setEditLastName, setEditPickupAddress, setEditNeighborhood,
  setEditZipCode, setEditShowSuggestions, onClose, onSubmit,
}: EditProfileModalProps) {
  if (!open) return null;
  return (
    <ModalShell open onClose={onClose} z={50}>
      <div className="relative border border-white/15 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors">
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
            <User className="size-5 text-fuchsia-400" />
          </div>
          <h3 className="text-lg font-medium">Edit Profile</h3>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">First Name</label>
              <Input
                type="text"
                placeholder="First"
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
              />
            </div>
            <div>
              <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Last Name</label>
              <Input
                type="text"
                placeholder="Last"
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Default Pickup Address</label>
            <Input
              type="text"
              placeholder="Street address"
              value={editPickupAddress}
              onChange={(e) => setEditPickupAddress(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
            />
            <p className="text-[10px] text-white/30 mt-1.5 leading-relaxed">
              Your address will never be visible to buyers without your consent. It will be used to group listings by local geography.
            </p>
          </div>

          <div className="relative">
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Neighborhood</label>
            <Input
              ref={editNeighborhoodRef}
              type="text"
              placeholder="e.g., Chelsea"
              value={editNeighborhood}
              onChange={(e) => {
                setEditNeighborhood(e.target.value);
                setEditShowSuggestions(true);
              }}
              onFocus={() => setEditShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && editIsValidNeighborhood) onSubmit();
              }}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
            />

            {editShowSuggestions && editFilteredNeighborhoods.length > 0 && (
              <div
                ref={editSuggestionsRef}
                className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border border-white/20 shadow-lg"
                style={{ backgroundColor: "#18181b" }}
              >
                {editFilteredNeighborhoods.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setEditNeighborhood(n);
                      setEditShowSuggestions(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${
                      n.toLowerCase() === editNeighborhood.trim().toLowerCase()
                        ? "text-fuchsia-400"
                        : "text-white"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            {editShowSuggestions && editFilteredNeighborhoods.length === 0 && editNeighborhood.trim() && (
              <div
                className="absolute z-50 mt-1 w-full rounded-md border border-white/20 shadow-lg px-3 py-2 text-sm text-white/40"
                style={{ backgroundColor: "#18181b" }}
              >
                No matching neighborhoods
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">City</label>
              <Input type="text" value="New York" disabled className="bg-white/5 border-white/20 text-white/50 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">State</label>
              <Input type="text" value="NY" disabled className="bg-white/5 border-white/20 text-white/50 cursor-not-allowed" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Zip Code</label>
            <Input
              type="text"
              placeholder="e.g., 10001"
              value={editZipCode}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d-]/g, "").slice(0, 10);
                setEditZipCode(val);
              }}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
            />
          </div>

          {editProfileError && <p className="text-sm text-red-400">{editProfileError}</p>}

          <Button
            onClick={onSubmit}
            disabled={isUpdatingProfile || !editIsValidNeighborhood || !editFirstName.trim() || !editLastName.trim()}
            className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isUpdatingProfile ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
