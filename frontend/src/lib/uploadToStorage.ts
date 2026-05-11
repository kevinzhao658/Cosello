const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;
type AllowedExt = (typeof ALLOWED_EXTENSIONS)[number];

interface SignedUploadEntry {
  upload_url: string;
  public_url: string;
  path: string;
}

const MAX_FILES = 20;

const extFromFile = (file: File): AllowedExt => {
  const raw = file.name.split(".").pop()?.toLowerCase() ?? "";
  const normalized = raw === "jpeg" ? "jpeg" : raw;
  if ((ALLOWED_EXTENSIONS as readonly string[]).includes(normalized)) {
    return normalized as AllowedExt;
  }
  throw new Error(
    `Unsupported file type: ${file.name}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
  );
};

const requestSignedUrl = async (
  ext: AllowedExt,
  token: string,
): Promise<SignedUploadEntry> => {
  const res = await fetch("/api/storage/signed-upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ count: 1, ext }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to mint upload URL" }));
    throw new Error(err.detail || "Failed to mint upload URL");
  }
  const data = (await res.json()) as SignedUploadEntry[];
  if (!Array.isArray(data) || data.length < 1 || !data[0].upload_url) {
    throw new Error("Invalid signed upload URL response");
  }
  return data[0];
};

const putFile = async (uploadUrl: string, file: File): Promise<void> => {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Upload failed for ${file.name} (${res.status})`);
  }
};

export const uploadToStorage = async (
  files: File[],
  token: string,
): Promise<string[]> => {
  if (files.length === 0) return [];
  if (files.length > MAX_FILES) {
    throw new Error(`Maximum ${MAX_FILES} photos per upload`);
  }
  if (!token) {
    throw new Error("Sign in to upload");
  }

  const uploads = files.map(async (file) => {
    const ext = extFromFile(file);
    const { upload_url, public_url } = await requestSignedUrl(ext, token);
    await putFile(upload_url, file);
    return public_url;
  });

  return Promise.all(uploads);
};
