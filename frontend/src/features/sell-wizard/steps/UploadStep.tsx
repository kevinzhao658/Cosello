import React, { useState } from "react";
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
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLButtonElement>) => {
    // Ignore flicker as the cursor passes over child elements.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    // Synthesize a ChangeEvent so the existing onUpload handler (which expects
    // a file-input change) can run unchanged. Mirrors the pattern used in
    // SellWizard.tsx for the filled-state drop zone.
    const synthetic = {
      target: { files: e.dataTransfer.files, value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    onUpload(synthetic);
  };

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
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full flex flex-col items-center justify-center gap-3 px-4 py-12 bg-surface-soft border-2 border-dashed rounded-lg cursor-pointer transition-all text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
          isDragOver
            ? "border-primary bg-primary-tint"
            : "border-border-strong hover:border-primary hover:bg-primary-soft/40"
        }`}
      >
        <ImagePlus className="size-6 text-primary" />
        <span className={`text-sm font-medium transition-colors ${isDragOver ? "text-primary" : "text-body"}`}>
          {isDragOver ? "Drop to upload" : "Drop or click to upload photos"}
        </span>
      </button>
    </div>
  );
}
