import { useState, type CSSProperties } from "react";
import { Skeleton } from "./Skeleton";

// Shimmer skeleton placeholder that swaps to the real image once it's
// finished loading. The skeleton fills the parent box; the <img> fades in
// over the top via opacity transition. Both are absolutely positioned, so
// the consumer's wrapper must be `position: relative` (or the equivalent).
// Use when you want a uniform thumbnail loading treatment — listing cards,
// drafts gallery, AI review thumbnails, etc.
export function SkeletonImage({
  src,
  alt,
  className,
  style,
  loading = "lazy",
  fetchPriority = "auto",
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: CSSProperties;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
}) {
  const [loaded, setLoaded] = useState(false);

  // No src → leave the skeleton in place permanently (caller can recover by
  // re-rendering with a non-null src once it resolves).
  if (!src) {
    return <Skeleton className={`absolute inset-0 ${className ?? ""}`} />;
  }

  return (
    <>
      {!loaded && <Skeleton className={`absolute inset-0 ${className ?? ""}`} />}
      <img
        src={src}
        alt={alt}
        className={`absolute inset-0 size-full object-cover transition-opacity duration-200 ${
          loaded ? "opacity-100" : "opacity-0"
        } ${className ?? ""}`}
        style={style}
        loading={loading}
        {...({ fetchpriority: fetchPriority } as Record<string, string>)}
        decoding="async"
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}
