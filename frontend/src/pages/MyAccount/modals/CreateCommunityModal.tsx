import React from "react";
import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { X, Plus, ImagePlus, Loader2, Unlock, Lock } from "lucide-react";
import { FOCUS_RING, MODAL_TITLE } from "../constants";

const LABEL_CLASS =
  "block text-[11px] font-semibold tracking-[0.18em] uppercase text-muted mb-1.5";

export interface CreateCommunityModalProps {
  open: boolean;
  createName: string;
  createDescription: string;
  createPickupAddress: string;
  createNeighborhood: string;
  createZipCode: string;
  createIsPublic: boolean;
  createImagePreview: string | null;
  createError: string | null;
  isCreating: boolean;
  createImageRef: React.RefObject<HTMLInputElement>;
  setCreateName: (s: string) => void;
  setCreateDescription: (s: string) => void;
  setCreatePickupAddress: (s: string) => void;
  setCreateNeighborhood: (s: string) => void;
  setCreateZipCode: (s: string) => void;
  setCreateIsPublic: (b: boolean) => void;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onCreate: () => void;
}

export function CreateCommunityModal({
  open, createName, createDescription, createPickupAddress, createNeighborhood, createZipCode,
  createIsPublic, createImagePreview, createError, isCreating, createImageRef,
  setCreateName, setCreateDescription, setCreatePickupAddress, setCreateNeighborhood,
  setCreateZipCode, setCreateIsPublic, onImageSelect, onClose, onCreate,
}: CreateCommunityModalProps) {
  if (!open) return null;
  return (
    <ModalShell open onClose={onClose} z={50}>
      <div className="relative bg-canvas border border-hairline rounded-md max-w-md w-full mx-4 shadow-overlay max-h-[90vh] flex flex-col">
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
              <Plus className="size-5 text-primary" />
            </div>
            <h3 className={`text-xl ${MODAL_TITLE}`}>Create a Community</h3>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4 overflow-y-auto">
          <div className="flex flex-col items-center">
            <button
              onClick={() => createImageRef.current?.click()}
              className={`size-20 rounded-full border border-dashed border-border-strong bg-surface-soft hover:bg-surface-card hover:border-primary transition-colors flex items-center justify-center cursor-pointer overflow-hidden ${FOCUS_RING}`}
              aria-label="Choose community badge image"
            >
              {createImagePreview ? (
                <img src={createImagePreview} alt="Preview" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-5 text-muted" />
              )}
            </button>
            <span className="text-[11px] text-muted mt-1.5">Community Badge</span>
            <input
              ref={createImageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onImageSelect}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Community Name *</label>
            <Input
              type="text"
              placeholder="e.g., Chelsea Book Club"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Description *</label>
            <textarea
              placeholder="What's this community about?"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              rows={2}
              className={`w-full rounded-md bg-canvas border border-border-strong text-ink placeholder:text-muted-soft text-sm px-3 py-2 resize-none focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30`}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Pickup Address</label>
            <Input
              type="text"
              placeholder="Street address"
              value={createPickupAddress}
              onChange={(e) => setCreatePickupAddress(e.target.value)}
            />
            <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
              Address is never shown publicly — used to group listings by local geography.
            </p>
          </div>

          <div>
            <label className={LABEL_CLASS}>Neighborhood *</label>
            <Input
              type="text"
              placeholder="e.g., Chelsea, the office, swimming pool..."
              value={createNeighborhood}
              onChange={(e) => setCreateNeighborhood(e.target.value)}
            />
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
            <Input
              type="text"
              placeholder="e.g., 10001"
              value={createZipCode}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d-]/g, "").slice(0, 10);
                setCreateZipCode(val);
              }}
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              {createIsPublic ? (
                <Unlock className="size-4 text-primary" />
              ) : (
                <Lock className="size-4 text-muted" />
              )}
              <span className="text-sm text-ink">
                {createIsPublic ? "Public" : "Private"}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={createIsPublic}
              aria-label={createIsPublic ? "Make community private" : "Make community public"}
              onClick={() => setCreateIsPublic(!createIsPublic)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                createIsPublic ? "bg-primary" : "bg-surface-strong"
              } ${FOCUS_RING}`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-canvas transition-transform ${
                  createIsPublic ? "left-5.5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {createError && (
            <p className="text-sm text-error">{createError}</p>
          )}
        </div>

        <div className="border-t border-hairline px-6 py-4 flex items-center justify-end gap-2">
          <Button onClick={onClose} variant="outline" size="sm">
            Cancel
          </Button>
          <Button
            disabled={!createName.trim() || !createDescription.trim() || !createNeighborhood.trim() || isCreating}
            onClick={onCreate}
            size="sm"
          >
            {isCreating ? <Loader2 className="size-4 motion-safe:animate-spin" /> : "Create"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
