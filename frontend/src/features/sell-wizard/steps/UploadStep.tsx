import React, { useEffect, useState } from "react";
import { Upload, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/button";

const SELL_PROMPT = "Upload single or multiple items, and we'll do the rest";

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
  uploadedImagesCount, isGenerating, collapsed, fileInputRef, onUpload, onSubmit, onSwitchToBuy,
}: UploadStepProps) {
  const [sellDisplayText, setSellDisplayText] = useState("");
  const [sellLetterIndex, setSellLetterIndex] = useState(-1);
  useEffect(() => {
    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex <= SELL_PROMPT.length) {
        setSellDisplayText(SELL_PROMPT.slice(0, currentIndex));
        setSellLetterIndex(currentIndex - 1);
        currentIndex++;
      } else {
        clearInterval(typingInterval);
        setSellLetterIndex(-1);
      }
    }, 25);
    return () => clearInterval(typingInterval);
  }, []);

  return (
    <div className={`relative flex items-center gap-2 transition-all duration-300 overflow-hidden ${collapsed ? "max-h-0 mb-0 opacity-0 pointer-events-none" : "max-h-32 mb-2 opacity-100"}`}>
      <label className="flex-1 flex items-center gap-3 px-4 py-3 bg-white/5 border border-dashed border-fuchsia-400/40 rounded-lg cursor-pointer hover:bg-white/10 hover:border-fuchsia-400/60 transition-all">
        <Upload className="size-5 text-fuchsia-400 shrink-0" />
        <p className="text-sm inline-flex items-center" style={{ fontFamily: "'Courier Prime', monospace" }}>
          {sellDisplayText.split('').map((letter, index) => (
            <span
              key={index}
              className={`${index === sellLetterIndex ? 'animate-letter-flash' : 'text-white/70'}${letter === ' ' ? ' inline-block w-1.5' : ''}`}
            >
              {letter === ' ' ? ' ' : letter}
            </span>
          ))}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onUpload}
        />
      </label>

      <div className="flex bg-white/5 border border-white/20 rounded-lg overflow-hidden">
        <Button
          variant="ghost"
          onClick={onSwitchToBuy}
          className="h-[52px] px-4 rounded-none text-sm text-white/60 hover:text-white hover:bg-white/5"
        >
          Buy
        </Button>
        <Button
          variant="ghost"
          onClick={() => { /* already in sell */ }}
          className="h-[52px] px-4 rounded-none text-sm bg-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/30"
        >
          Sell
        </Button>
      </div>

      <Button
        size="icon"
        disabled={uploadedImagesCount === 0 || isGenerating}
        onClick={onSubmit}
        className={`h-[52px] w-[52px] bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 ${uploadedImagesCount === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        {isGenerating ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
      </Button>
    </div>
  );
}
