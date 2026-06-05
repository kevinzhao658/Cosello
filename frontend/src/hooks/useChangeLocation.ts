import { useState, useCallback } from "react";
import { apiFetch } from "../lib/api";
import type { AuthUser } from "../contexts/AuthContext";

export interface UseChangeLocationReturn {
  open: boolean;
  openModal: () => void;
  close: () => void;
  zip: string;
  setZip: (zip: string) => void;
  neighborhood: string;
  setNeighborhood: (neighborhood: string) => void;
  error: string;
  isSubmitting: boolean;
  submit: () => Promise<void>;
}

export function useChangeLocation(
  user: AuthUser | null,
  updateUser: (user: AuthUser) => void,
): UseChangeLocationReturn {
  const [open, setOpen] = useState(false);
  const [zip, setZip] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openModal = useCallback(() => {
    setZip(user?.zip_code ?? "");
    setNeighborhood(user?.neighborhood ?? "");
    setError("");
    setOpen(true);
  }, [user?.zip_code, user?.neighborhood]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const submit = useCallback(async () => {
    setIsSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          neighborhood: neighborhood.trim(),
          zip_code: zip.trim() || undefined,
        }),
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
  }, [neighborhood, zip, updateUser]);

  return {
    open,
    openModal,
    close,
    zip,
    setZip,
    neighborhood,
    setNeighborhood,
    error,
    isSubmitting,
    submit,
  };
}
