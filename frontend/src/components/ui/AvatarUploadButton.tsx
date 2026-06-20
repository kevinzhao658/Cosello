// frontend/src/components/ui/AvatarUploadButton.tsx
// Shared clickable avatar with hover overlay and hidden file input.
// Used by MyAccountPage (profile header) and EditProfileModal.
//
// The caller owns the upload state (isUploading, error, onFileChange,
// onErrorClear) — typically wired to useProfilePictureUpload.  The
// component only handles rendering and the ref-click indirection.
import { useRef } from "react";
import { Loader2, Camera } from "lucide-react";

export interface AvatarUploadButtonProps {
  /** Current avatar URL; if null/undefined the fallback node is rendered */
  currentUrl: string | null | undefined;
  /**
   * Fallback content rendered inside the button when no image is available.
   * Typically a text initial (MyAccountPage) or a User icon (EditProfileModal).
   */
  fallback: React.ReactNode;
  /** Tailwind size class, e.g. "size-20" or "size-10" */
  size: string;
  /** Whether an upload is currently in progress */
  isUploading: boolean;
  /** Error message to display below the button; null hides the error */
  uploadError: string | null | undefined;
  /** Called when the user selects a file */
  onFileChange: (file: File) => void;
  /** Called when the button is clicked — use to clear a previous error */
  onErrorClear?: () => void;
  /** Size class for the overlay icons (e.g. "size-5" or "size-3") */
  iconSize?: string;
  /** Extra className applied to the error paragraph */
  errorClassName?: string;
  /** Alt text for the avatar image */
  alt?: string;
}

export function AvatarUploadButton({
  currentUrl,
  fallback,
  size,
  isUploading,
  uploadError,
  onFileChange,
  onErrorClear,
  iconSize = "size-5",
  errorClassName = "text-[11px] text-error mt-1",
  alt = "Profile",
}: AvatarUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after an error
    e.target.value = "";
    if (file) onFileChange(file);
  };

  return (
    <div>
      <div className="relative group">
        <button
          type="button"
          aria-label="Change profile photo"
          disabled={isUploading}
          onClick={() => {
            onErrorClear?.();
            inputRef.current?.click();
          }}
          className={`${size} rounded-full bg-surface-soft border border-hairline flex items-center justify-center overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${isUploading ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
        >
          {currentUrl ? (
            <img src={currentUrl} alt={alt} className="size-full object-cover" />
          ) : (
            fallback
          )}
        </button>

        {/* Hover overlay */}
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity motion-safe:duration-150 pointer-events-none"
        >
          {isUploading
            ? <Loader2 className={`${iconSize} text-white animate-spin`} />
            : <Camera className={`${iconSize} text-white`} />}
        </span>

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={handleFileChange}
        />
      </div>

      {uploadError && (
        <p className={errorClassName}>{uploadError}</p>
      )}
    </div>
  );
}
