// frontend/src/components/ui/ToggleSwitch.tsx
// Shared accessible toggle-switch used in MyAccountPage (Settings panel) and
// CircleSettings.  Props match both original inline implementations.

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export interface ToggleSwitchProps {
  /** Whether the switch is in the "on" / checked state */
  checked: boolean;
  /** Called with the next boolean value when the user clicks the switch */
  onChange: (value: boolean) => void;
  /** Accessible aria-label for screen readers */
  label: string;
}

export function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors motion-safe:duration-150 ${FOCUS_RING} ${checked ? "bg-primary" : "bg-surface-strong"}`}
    >
      <span
        className={`inline-block size-5 transform rounded-full bg-canvas shadow-card transition-transform motion-safe:duration-150 ${checked ? "translate-x-5" : "translate-x-0.5"}`}
      />
    </button>
  );
}
