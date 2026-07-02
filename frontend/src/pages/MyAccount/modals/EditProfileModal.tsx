import React from "react";
import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { User, Loader2 } from "lucide-react";
import { MODAL_TITLE } from "../constants";
import { AvatarUploadButton } from "../../../components/ui/AvatarUploadButton";
import { ModalCloseButton } from "../../../components/ui/ModalCloseButton";
import { AddressAutocompleteInput } from "../../../components/AddressAutocompleteInput";
import type { AddressSuggestion } from "../../../lib/mapboxSearch";
import { ZIP_NEIGHBORHOOD } from "../../../lib/nycZips";

const LABEL_CLASS =
  "block text-[11px] font-semibold text-muted mb-1.5";

const SELECT_CLASS =
  "w-full rounded-md border border-border-strong bg-canvas px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export interface EditProfileModalProps {
  open: boolean;
  // Avatar upload
  avatarUrl: string | null;
  isUploadingAvatar: boolean;
  avatarUploadError: string | null;
  onAvatarChange: (file: File) => void;
  onAvatarErrorClear: () => void;
  // Profile fields
  editFirstName: string;
  editLastName: string;
  editPickupAddress: string;
  editNeighborhood: string;
  editZipCode: string;
  editIsValidNeighborhood: boolean;
  editProfileError: string;
  isUpdatingProfile: boolean;
  isLoadingNeighborhoods: boolean;
  neighborhoodsError: string | null;
  neighborhoods: readonly string[];
  setEditFirstName: (s: string) => void;
  setEditLastName: (s: string) => void;
  setEditPickupAddress: (s: string) => void;
  setEditNeighborhood: (s: string) => void;
  setEditZipCode: (s: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function EditProfileModal({
  open, avatarUrl, isUploadingAvatar, avatarUploadError, onAvatarChange, onAvatarErrorClear,
  editFirstName, editLastName, editPickupAddress, editNeighborhood, editZipCode,
  editIsValidNeighborhood,
  editProfileError, isUpdatingProfile, isLoadingNeighborhoods, neighborhoodsError,
  neighborhoods,
  setEditFirstName, setEditLastName, setEditPickupAddress, setEditNeighborhood,
  setEditZipCode, onClose, onSubmit,
}: EditProfileModalProps) {
  if (!open) return null;

  function handleAddressSelect(s: AddressSuggestion): void {
    setEditPickupAddress(s.label);
    setEditZipCode(s.zip);
    setEditNeighborhood(ZIP_NEIGHBORHOOD[s.zip] ?? "");
  }

  return (
    <ModalShell open onClose={onClose} z={50}>
      <div className="relative bg-canvas border border-hairline rounded-md max-w-sm w-full mx-4 shadow-overlay max-h-[90vh] flex flex-col">
        <ModalCloseButton onClick={onClose} />

        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <AvatarUploadButton
                currentUrl={avatarUrl}
                fallback={<User className="size-5 text-primary" />}
                size="size-10"
                isUploading={isUploadingAvatar}
                uploadError={null}
                onFileChange={onAvatarChange}
                onErrorClear={onAvatarErrorClear}
                iconSize="size-3"
              />
            </div>
            <h3 className={`text-xl ${MODAL_TITLE}`}>Edit Profile</h3>
          </div>
          {avatarUploadError && (
            <p className="text-[11px] text-error mt-2">{avatarUploadError}</p>
          )}
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
            <AddressAutocompleteInput
              id="edit-profile-address"
              placeholder="Start typing your address"
              value={editPickupAddress}
              onChangeText={setEditPickupAddress}
              onSelect={handleAddressSelect}
            />
            <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
              Your address will never be visible to buyers without your consent. It will be used to group listings by local geography.
            </p>
          </div>

          <div>
            <label className={LABEL_CLASS}>Neighborhood</label>
            {isLoadingNeighborhoods ? (
              <div className="text-sm text-muted py-2 flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading neighborhoods...
              </div>
            ) : neighborhoodsError ? (
              <div className="text-sm text-error py-2">
                Couldn't load neighborhoods. Other fields still editable.
              </div>
            ) : (
              <select
                value={editNeighborhood}
                onChange={(e) => setEditNeighborhood(e.target.value)}
                className={SELECT_CLASS}
              >
                {!editNeighborhood && (
                  <option value="">Select a neighborhood</option>
                )}
                {neighborhoods.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
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
            <label className={LABEL_CLASS}>ZIP Code</label>
            <Input
              type="text"
              value={editZipCode || ""}
              placeholder="Derived from address"
              disabled
            />
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
