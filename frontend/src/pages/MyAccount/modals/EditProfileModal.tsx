import React from "react";
import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { X, User, Loader2 } from "lucide-react";
import { FOCUS_RING, MODAL_TITLE } from "../constants";
import { NYC_ZIPS, NYC_ZIP_SET } from "../../../lib/nycZips";

const LABEL_CLASS =
  "block text-[11px] font-semibold text-muted mb-1.5";

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
  isLoadingNeighborhoods: boolean;
  neighborhoodsError: string | null;
  editNeighborhoodRef: React.RefObject<HTMLInputElement>;
  editSuggestionsRef: React.RefObject<HTMLDivElement>;
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
  editProfileError, isUpdatingProfile, isLoadingNeighborhoods, neighborhoodsError,
  editNeighborhoodRef, editSuggestionsRef,
  setEditFirstName, setEditLastName, setEditPickupAddress, setEditNeighborhood,
  setEditZipCode, setEditShowSuggestions, onClose, onSubmit,
}: EditProfileModalProps) {
  if (!open) return null;
  return (
    <ModalShell open onClose={onClose} z={50}>
      <div className="relative bg-canvas border border-hairline rounded-md max-w-sm w-full mx-4 shadow-overlay max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          aria-label="Close"
          className={`absolute top-3 right-3 size-9 rounded-full text-muted hover:text-ink hover:bg-surface-soft inline-flex items-center justify-center ${FOCUS_RING}`}
        >
          <X className="size-5" />
        </button>

        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-primary-soft rounded-full flex items-center justify-center">
              <User className="size-5 text-primary" />
            </div>
            <h3 className={`text-xl ${MODAL_TITLE}`}>Edit Profile</h3>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>First Name</label>
              <Input
                type="text"
                placeholder="First"
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Last Name</label>
              <Input
                type="text"
                placeholder="Last"
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Pickup Address</label>
            <Input
              type="text"
              placeholder="Street address"
              value={editPickupAddress}
              onChange={(e) => setEditPickupAddress(e.target.value)}
            />
            <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
              Your address will never be visible to buyers without your consent. It will be used to group listings by local geography.
            </p>
          </div>

          <div className="relative">
            <label className={LABEL_CLASS}>Neighborhood</label>
            {isLoadingNeighborhoods ? (
              <div className="text-sm text-muted py-2 flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading neighborhoods…
              </div>
            ) : neighborhoodsError ? (
              <div className="text-sm text-error py-2">
                Couldn't load neighborhoods. Other fields still editable.
              </div>
            ) : (
              <>
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
                />

                {editShowSuggestions && editFilteredNeighborhoods.length > 0 && (
                  <div
                    ref={editSuggestionsRef}
                    className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border border-hairline bg-canvas shadow-overlay"
                  >
                    {editFilteredNeighborhoods.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setEditNeighborhood(n);
                          setEditShowSuggestions(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-soft transition-colors ${
                          n.toLowerCase() === editNeighborhood.trim().toLowerCase()
                            ? "text-primary font-semibold"
                            : "text-ink"
                        } ${FOCUS_RING}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}

                {editShowSuggestions && editFilteredNeighborhoods.length === 0 && editNeighborhood.trim() && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-hairline bg-canvas shadow-overlay px-3 py-2 text-sm text-muted">
                    No matching neighborhoods
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>City</label>
              <Input type="text" value="New York" disabled />
            </div>
            <div>
              <label className={LABEL_CLASS}>State</label>
              <Input type="text" value="NY" disabled />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Zip Code</label>
            <select
              value={NYC_ZIP_SET.has(editZipCode) ? editZipCode : ""}
              onChange={(e) => setEditZipCode(e.target.value)}
              className="w-full rounded-md border border-input bg-canvas px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <option value="" disabled>Select ZIP</option>
              {NYC_ZIPS.map(({ zip, neighborhood }) => (
                <option key={zip} value={zip}>{zip} — {neighborhood}</option>
              ))}
            </select>
          </div>

          {editProfileError && <p className="text-sm text-error">{editProfileError}</p>}
        </div>

        <div className="border-t border-hairline px-6 py-4 flex items-center justify-end gap-2">
          <Button
            onClick={onSubmit}
            disabled={isUpdatingProfile || isLoadingNeighborhoods || (!neighborhoodsError && !editIsValidNeighborhood) || !editFirstName.trim() || !editLastName.trim()}
            size="sm"
          >
            {isUpdatingProfile ? <Loader2 className="size-4 motion-safe:animate-spin" /> : "Save Changes"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
