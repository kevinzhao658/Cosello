import { X } from "lucide-react";
import { FOCUS_RING } from "../../lib/ui-constants";

export interface ModalCloseButtonProps {
  onClick: () => void;
  disabled?: boolean;
  /**
   * Button diameter. Defaults to 9 (size-9, icon size-5).
   * Use 8 (size-8, icon size-4) for the smaller close buttons in
   * BuyModal, EditListingModal, and App.tsx inline modals.
   */
  size?: 8 | 9;
  /**
   * Extra Tailwind classes appended to the button — useful for
   * z-index overrides ("z-10"), border variants, or one-off tweaks.
   */
  className?: string;
}

/**
 * Absolute top-right close button shared across all modals.
 *
 * Renders an X icon inside a circular ghost button. Positions itself
 * in the top-right corner of the nearest `relative` ancestor.
 *
 * Usage:
 *   <ModalCloseButton onClick={onClose} />
 *   <ModalCloseButton onClick={onClose} disabled={isSaving} />
 *   <ModalCloseButton onClick={onClose} size={8} className="z-10" />
 *   <ModalCloseButton onClick={onClose} size={8} className="z-10 bg-canvas border border-hairline" />
 */
export function ModalCloseButton({
  onClick,
  disabled,
  size = 9,
  className = "",
}: ModalCloseButtonProps) {
  const sizeClasses = size === 8 ? "size-8" : "size-9";
  const iconClasses = size === 8 ? "size-4" : "size-5";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      disabled={disabled}
      className={[
        "absolute top-3 right-3 rounded-full inline-flex items-center justify-center",
        "text-muted hover:text-ink hover:bg-surface-soft transition-colors",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        sizeClasses,
        FOCUS_RING,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <X className={iconClasses} />
    </button>
  );
}
