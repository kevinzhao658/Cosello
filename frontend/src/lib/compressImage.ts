import imageCompression from "browser-image-compression";

/**
 * Compress a single image file to at most 2048px on the longest side,
 * at most 2 MB, encoded as JPEG.
 *
 * EXIF orientation is baked into the pixel data and the orientation tag
 * is stripped (`preserveExif` defaults to false in browser-image-compression).
 * This means the output is always upright in pixels — consistent with the
 * backend's `ImageOps.exif_transpose` which acts as defense-in-depth for
 * uncompressed fallback files only.
 *
 * Compression runs off-main-thread via a Web Worker (`useWebWorker: true`).
 * On failure the original file is returned unmodified so the upload is never
 * blocked by a compression error.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    return await imageCompression(file, {
      maxWidthOrHeight: 2048,
      maxSizeMB: 2,
      useWebWorker: true,
      fileType: "image/jpeg",
      // preserveExif defaults to false — orientation is baked into pixels,
      // orientation tag is stripped. Output is always upright.
    });
  } catch {
    // Graceful fallback: never block the upload on a compression failure.
    return file;
  }
}
