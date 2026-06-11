import { useState, useCallback } from "react";
import { NYC_ZIP_SET } from "../lib/nycZips";
import { setLocationOnProfile } from "../lib/setLocationOnProfile";
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
    // Belt-and-suspenders pre-check: surface the error before toggling the
    // submitting spinner so the UX matches today's behaviour (the Save button
    // is already disabled unless a valid ZIP is selected, so this guard should
    // rarely trigger in practice).
    if (!NYC_ZIP_SET.has(zip.trim())) {
      setError("Select a ZIP code");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const updated = await setLocationOnProfile(zip);
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
