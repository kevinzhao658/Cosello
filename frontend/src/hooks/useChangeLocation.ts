import { useState, useCallback } from "react";
import { apiFetch } from "../lib/api";
import { ZIP_NEIGHBORHOOD } from "../lib/nycZips";
import type { AuthUser } from "../contexts/AuthContext";

export interface UseChangeLocationReturn {
  open: boolean;
  openModal: () => void;
  close: () => void;
  zip: string;
  setZip: (zip: string) => void;
  error: string;
  isSubmitting: boolean;
  submit: () => Promise<void>;
}

// Marketplace "Change location" — ZIP is the single source of truth. The
// neighborhood (and its community membership) is derived from the chosen ZIP,
// so there's no separate neighborhood field to drift out of sync.
export function useChangeLocation(
  user: AuthUser | null,
  updateUser: (user: AuthUser) => void,
): UseChangeLocationReturn {
  const [open, setOpen] = useState(false);
  const [zip, setZip] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openModal = useCallback(() => {
    setZip(user?.zip_code ?? "");
    setError("");
    setOpen(true);
  }, [user?.zip_code]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const submit = useCallback(async () => {
    const z = zip.trim();
    const neighborhood = ZIP_NEIGHBORHOOD[z];
    if (!neighborhood) {
      setError("Select a ZIP code");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ neighborhood, zip_code: z }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Update failed" }));
        throw new Error(data.detail || "Update failed");
      }
      const updated = await res.json();
      updateUser(updated);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsSubmitting(false);
    }
  }, [zip, updateUser]);

  return {
    open,
    openModal,
    close,
    zip,
    setZip,
    error,
    isSubmitting,
    submit,
  };
}
