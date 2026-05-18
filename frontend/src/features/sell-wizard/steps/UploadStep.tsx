import React from "react";
import { ImagePlus } from "lucide-react";

export interface UploadStepProps {
  uploadedImagesCount: number;
  isGenerating: boolean;
  collapsed: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  onSwitchToBuy: () => void;
}

export function UploadStep({
  uploadedImagesCount, collapsed, fileInputRef, onUpload,
}: UploadStepProps) {
  // When images are loaded the filled-state composer (rendered in SellWizard)
  // takes over the visual — UploadStep keeps the hidden <input> mounted so
  // the wizard's fileInputRef stays valid.
  const hasPhotos = uploadedImagesCount > 0;

  return (
    <div
      className={`relative transition-all duration-300 overflow-hidden ${
        collapsed ? "max-h-0 mb-0 opacity-0 pointer-events-none" : (hasPhotos ? "max-h-0 mb-0 opacity-0" : "max-h-[260px] mb-2 opacity-100")
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onUpload}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full flex flex-col items-center justify-center gap-3 px-4 py-12 bg-surface-soft border-2 border-dashed border-border-strong rounded-lg cursor-pointer hover:border-primary hover:bg-primary-soft/40 transition-all text-center"
      >
        <ImagePlus className="size-6 text-primary" />
        <span className="text-sm font-medium text-body">Drop or click to upload photos</span>
      </button>
    </div>
  );
}
