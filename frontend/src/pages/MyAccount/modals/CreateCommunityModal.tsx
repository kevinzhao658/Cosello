import React from "react";
import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { X, Plus, ImagePlus, Loader2, Unlock, Lock } from "lucide-react";

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
  createImageRef: React.RefObject<HTMLInputElement | null>;
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
      <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors">
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
            <Plus className="size-5 text-fuchsia-400" />
          </div>
          <h3 className="text-lg font-medium">Create a Community</h3>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col items-center">
            <button
              onClick={() => createImageRef.current?.click()}
              className="size-20 rounded-full border-2 border-dashed border-white/20 bg-white/[0.03] hover:bg-white/5 hover:border-white/30 transition-all flex flex-col items-center justify-center cursor-pointer overflow-hidden"
            >
              {createImagePreview ? (
                <img src={createImagePreview} alt="Preview" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-5 text-white/30" />
              )}
            </button>
            <span className="text-[11px] text-white/30 mt-1.5">Community Badge</span>
            <input
              ref={createImageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onImageSelect}
            />
          </div>

          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Community Name *</label>
            <Input
              type="text"
              placeholder="e.g., Chelsea Book Club"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
            />
          </div>

          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Description *</label>
            <textarea
              placeholder="What's this community about?"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white placeholder:text-white/30 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50"
            />
          </div>

          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Pickup Address</label>
            <Input
              type="text"
              placeholder="Street address"
              value={createPickupAddress}
              onChange={(e) => setCreatePickupAddress(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
            />
            <p className="text-[10px] text-white/30 mt-1.5 leading-relaxed">
              Address is never shown publicly — used to group listings by local geography.
            </p>
          </div>

          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Neighborhood *</label>
            <Input
              type="text"
              placeholder="e.g., Chelsea, the office, swimming pool..."
              value={createNeighborhood}
              onChange={(e) => setCreateNeighborhood(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">City</label>
              <Input type="text" value="New York" disabled className="bg-white/5 border-white/20 text-white/50 cursor-not-allowed" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">State</label>
              <Input type="text" value="NY" disabled className="bg-white/5 border-white/20 text-white/50 cursor-not-allowed" />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Zip Code</label>
            <Input
              type="text"
              placeholder="e.g., 10001"
              value={createZipCode}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d-]/g, "").slice(0, 10);
                setCreateZipCode(val);
              }}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              {createIsPublic ? (
                <Unlock className="size-4 text-cyan-400" />
              ) : (
                <Lock className="size-4 text-fuchsia-400" />
              )}
              <span className="text-sm text-white/70">
                {createIsPublic ? "Public" : "Private"}
              </span>
            </div>
            <button
              onClick={() => setCreateIsPublic(!createIsPublic)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                createIsPublic ? "bg-cyan-500" : "bg-white/20"
              }`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${
                  createIsPublic ? "left-5.5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {createError && (
            <p className="text-sm text-red-400">{createError}</p>
          )}

          <Button
            disabled={!createName.trim() || !createDescription.trim() || !createNeighborhood.trim() || isCreating}
            onClick={onCreate}
            className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isCreating ? <Loader2 className="size-4 animate-spin" /> : "Create"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
