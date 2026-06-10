import { useState } from "react";
import { NYC_ZIPS, NYC_ZIP_SET } from "../lib/nycZips";

const SESSION_KEY = "confirm_zip_dismissed";

interface ConfirmZipBannerProps {
  currentZip: string | null;
  onConfirm: (zip: string) => Promise<void>;
}

export function ConfirmZipBanner({ currentZip, onConfirm }: ConfirmZipBannerProps) {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === "1",
  );
  const [selectedZip, setSelectedZip] = useState<string>(
    currentZip && NYC_ZIP_SET.has(currentZip) ? currentZip : "",
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  const handleNotNow = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setDismissed(true);
  };

  const handleConfirm = async () => {
    if (!NYC_ZIP_SET.has(selectedZip)) {
      setError("Select a ZIP code first");
      return;
    }
    setError(null);
    setConfirming(true);
    try {
      await onConfirm(selectedZip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm ZIP");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="w-full bg-primary-soft border-b border-hairline px-4 py-2.5 flex flex-wrap items-center gap-3 text-sm">
      <span className="text-ink flex-1 min-w-0">
        Confirm your ZIP code so we can show accurate distances
      </span>

      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <select
          value={selectedZip}
          onChange={(e) => {
            setSelectedZip(e.target.value);
            setError(null);
          }}
          className="rounded-md border border-input bg-canvas px-2 py-1.5 text-sm text-ink shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          aria-label="Select ZIP code"
        >
          <option value="" disabled>Select ZIP</option>
          {NYC_ZIPS.map(({ zip, neighborhood }) => (
            <option key={zip} value={zip}>{zip} — {neighborhood}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming || !NYC_ZIP_SET.has(selectedZip)}
          className="inline-flex items-center h-8 px-3 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          {confirming ? "Confirming…" : "Confirm"}
        </button>

        <button
          type="button"
          onClick={handleNotNow}
          className="text-muted hover:text-ink text-sm transition-colors focus:outline-none focus-visible:underline"
        >
          Not now
        </button>
      </div>

      {error && (
        <p className="w-full text-xs text-error mt-0.5">{error}</p>
      )}
    </div>
  );
}
