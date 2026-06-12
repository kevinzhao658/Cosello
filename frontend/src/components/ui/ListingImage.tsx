import { useState, type CSSProperties } from "react";
import { THUMB_PRESETS, thumbUrl, type ThumbPresetName } from "../../lib/imageTransforms";
import { Skeleton } from "./Skeleton";

const ERROR_IMG_SRC =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg==";

type Props = {
  src: string | null | undefined;
  alt: string;
  size: ThumbPresetName;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function ListingImage({ src, alt, size, priority, className, style }: Props) {
  const [didError, setDidError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (didError || !src) {
    return (
      <div
        className={`inline-block bg-white/5 text-center align-middle ${className ?? ""}`}
        style={style}
      >
        <div className="flex items-center justify-center w-full h-full">
          <img src={ERROR_IMG_SRC} alt={alt} data-original-url={src ?? ""} />
        </div>
      </div>
    );
  }

  const preset = THUMB_PRESETS[size];
  const w = preset.w;
  const src1x = thumbUrl(src, preset);
  const src2x = w !== undefined ? thumbUrl(src, { ...preset, w: w * 2 }) : src1x;
  const srcSet = src1x === src ? undefined : `${src1x} 1x, ${src2x} 2x`;

  return (
    <>
      {!loaded && <Skeleton className={className} />}
      <img
        src={src1x}
        srcSet={srcSet}
        alt={alt}
        className={`${className ?? ""} transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
        style={style}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        {...({ fetchpriority: priority ? "high" : "auto" } as Record<string, string>)}
        onLoad={() => setLoaded(true)}
        onError={() => setDidError(true)}
      />
    </>
  );
}
