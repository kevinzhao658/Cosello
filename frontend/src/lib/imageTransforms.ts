export type ThumbResize = "cover" | "contain" | "fill";

export type ThumbOpts = {
  w?: number;
  h?: number;
  q?: number;
  resize?: ThumbResize;
};

export type ThumbPresetName = "card" | "small" | "modalPreview";

export const THUMB_PRESETS: Record<ThumbPresetName, ThumbOpts> = {
  card: { w: 400, q: 75 },
  small: { w: 80, q: 75 },
  modalPreview: { w: 240, q: 75 },
};

const OBJECT_PATH = "/storage/v1/object/public/";
const RENDER_PATH = "/storage/v1/render/image/public/";

export function thumbUrl(
  url: string | null | undefined,
  opts: ThumbOpts = {},
): string {
  if (!url) return "";

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) return url;

  const prefix = `${supabaseUrl}${OBJECT_PATH}`;
  if (!url.startsWith(prefix)) return url;

  const rest = url.slice(prefix.length);
  const params = new URLSearchParams();
  if (opts.w !== undefined) params.set("width", String(opts.w));
  if (opts.h !== undefined) params.set("height", String(opts.h));
  params.set("quality", String(opts.q ?? 75));
  const hasBothDims = opts.w !== undefined && opts.h !== undefined;
  params.set("resize", opts.resize ?? (hasBothDims ? "cover" : "contain"));

  return `${supabaseUrl}${RENDER_PATH}${rest}?${params.toString()}`;
}
