import { useState, useCallback } from "react";
import { apiFetch } from "../lib/api";
import type { AuthUser } from "../contexts/AuthContext";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

interface UseProfilePictureUploadOptions {
  onSuccess: (updatedUser: AuthUser) => void;
}

interface UseProfilePictureUploadReturn {
  isUploading: boolean;
  uploadError: string | null;
  upload: (file: File) => Promise<void>;
  clearError: () => void;
}

export function useProfilePictureUpload(
  options: UseProfilePictureUploadOptions,
): UseProfilePictureUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const clearError = useCallback(() => setUploadError(null), []);

  const upload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setUploadError("Please select an image file.");
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setUploadError("Image must be under 8 MB.");
        return;
      }

      setIsUploading(true);
      setUploadError(null);

      try {
        const formData = new FormData();
        // Field name must match the FastAPI parameter: `image`
        formData.append("image", file);

        const res = await apiFetch("/api/auth/profile-picture", {
          method: "PUT",
          // Do NOT set Content-Type; let the browser set the multipart boundary.
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ detail: `Upload failed (HTTP ${res.status})` }));
          const detail = (data as { detail?: string }).detail ?? `Upload failed (HTTP ${res.status})`;
          setUploadError(detail);
          return;
        }

        const updatedUser = (await res.json()) as AuthUser;
        options.onSuccess(updatedUser);
      } catch (err) {
        console.error("[useProfilePictureUpload] upload error:", err);
        setUploadError("Network error. Please try again.");
      } finally {
        setIsUploading(false);
      }
    },
    [options],
  );

  return { isUploading, uploadError, upload, clearError };
}
