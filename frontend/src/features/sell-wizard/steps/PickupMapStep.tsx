import React, { useCallback, useEffect, useRef, useState } from "react";
// Static import: Mapbox REQUIRES its stylesheet for the map to display
// properly, and a fire-and-forget dynamic import can resolve after the map
// constructs (symptom: the canvas renders as a small strip). The CSS is tiny
// and harmless when the map never mounts.
import "mapbox-gl/dist/mapbox-gl.css";
import { Skeleton } from "../../../components/ui/Skeleton";
import { circlePolygon } from "../../../lib/geoCircle";
import { hasMapboxToken, searchAddresses, reverseGeocodeAddress } from "../../../lib/mapboxSearch";
import type { AddressSuggestion } from "../../../lib/mapboxSearch";

// Shared class string for the map frame — used for both the container and the
// Skeleton overlay so they are always the same size.
const MAP_FRAME_CLS =
  "w-full h-72 sm:h-96 max-w-2xl mx-auto rounded-md overflow-hidden border border-hairline";

export interface PickupMapStepProps {
  /** Seed center: pass null to use Manhattan center. */
  initialLat: number | null;
  initialLng: number | null;
  pin: { lat: number; lng: number } | null; // controlled
  onPinChange: (pin: { lat: number; lng: number }) => void;
  radiusMi: number; // controlled, 0.1–0.4
  onRadiusChange: (r: number) => void;
  pickupLabel: string; // selected suggestion label ("" if drag-only)
  onPickupLabelChange: (label: string) => void;
  /** Seller's saved profile address: geocoded once on load to seed the pin
   *  and shown as the search box's resting content. */
  defaultAddress?: string | null;
  /** Render-prop fallback: legacy fields shown when no token / GL init fails. */
  renderFallback: () => React.ReactNode;
}

// Manhattan center fallback
const MANHATTAN_CENTER: [number, number] = [-73.985, 40.748];

// Degree-per-mile scale at mid-Manhattan latitude (matches lib/geoCircle.ts).
const DEG_PER_MILE_LAT = 1 / 69.0;
const DEG_PER_MILE_LNG = 1 / 52.6;

export function PickupMapStep({
  initialLat,
  initialLng,
  pin,
  onPinChange,
  radiusMi,
  onRadiusChange,
  pickupLabel,
  onPickupLabelChange,
  defaultAddress = null,
  renderFallback,
}: PickupMapStepProps) {
  // Token check — if missing, fall back immediately
  if (!hasMapboxToken()) {
    return <>{renderFallback()}</>;
  }

  return (
    <PickupMapStepInner
      initialLat={initialLat}
      initialLng={initialLng}
      pin={pin}
      onPinChange={onPinChange}
      radiusMi={radiusMi}
      onRadiusChange={onRadiusChange}
      pickupLabel={pickupLabel}
      onPickupLabelChange={onPickupLabelChange}
      defaultAddress={defaultAddress}
      renderFallback={renderFallback}
    />
  );
}

// Inner component — only rendered when token is present
function PickupMapStepInner({
  initialLat,
  initialLng,
  pin,
  onPinChange,
  radiusMi,
  onRadiusChange,
  pickupLabel,
  onPickupLabelChange,
  defaultAddress = null,
  renderFallback,
}: PickupMapStepProps) {
  type MapboxGl = typeof import("mapbox-gl");

  const [gl, setGl] = useState<MapboxGl | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [glFailed, setGlFailed] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InstanceType<MapboxGl["Map"]> | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const circleReadyRef = useRef(false);
  // Skip ONE moveend reverse-geocode after a programmatic ease (search/seed).
  const suppressReverseRef = useRef(false);

  // Debounce ref for search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  // Abort for the dragend reverse geocode (pin -> address field sync)
  const reverseAbortRef = useRef<AbortController | null>(null);

  // ── Privacy-mask offset ────────────────────────────────────────────────
  // The circle is deliberately NOT centered on the pin, so buyers can't
  // deduce the pin from the circle's center. Direction and distance fraction
  // are fixed per mount: stable while dragging or resizing, no jumping.
  const maskOffsetRef = useRef({
    angle: Math.random() * Math.PI * 2,
    frac: 0.25 + Math.random() * 0.2, // 25-45% of the radius
  });
  // Orbit demo: while the seller uses the slider, the circle sweeps AROUND
  // the pin through every position it could occupy (the pin is the axis; the
  // center travels the ring of possible placements in x and y). When the
  // slider goes idle the sweep glides back to the resting offset and the
  // motion disappears. `sweep` is the extra angle beyond the resting angle.
  const wobbleRef = useRef({ sweep: 0, raf: 0, lastActivity: 0 });
  // Live mirrors for the rAF loop (avoids stale closures).
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const radiusRef = useRef(radiusMi);
  radiusRef.current = radiusMi;

  const maskCenter = useCallback(
    (p: { lat: number; lng: number }, r: number, extraAngle = 0): { lat: number; lng: number } => {
      const { angle, frac } = maskOffsetRef.current;
      const d = r * frac;
      const a = angle + extraAngle;
      return {
        lat: p.lat + d * DEG_PER_MILE_LAT * Math.sin(a),
        lng: p.lng + d * DEG_PER_MILE_LNG * Math.cos(a),
      };
    },
    [],
  );

  const redrawCircle = useCallback(
    (extraAngle = 0) => {
      const m = mapRef.current;
      if (!m || !circleReadyRef.current) return;
      const source = m.getSource("area") as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;
      // The pin IS the live map center (Uber-style), so the mask follows the
      // viewport during pans, not just after moveend commits the pin state.
      const ctr = m.getCenter();
      const c = maskCenter({ lat: ctr.lat, lng: ctr.lng }, radiusRef.current, extraAngle);
      source.setData(circlePolygon(c.lat, c.lng, radiusRef.current));
    },
    [maskCenter],
  );

  // Constant orbit: the mask circles the pin continuously (the pin is the
  // axis), slow at rest and faster while the slider is in use, so its resting
  // spot never reads as meaningful. Skipped under prefers-reduced-motion.
  const bumpWobble = useCallback(() => {
    wobbleRef.current.lastActivity = performance.now();
  }, []);

  useEffect(() => {
    if (!mapLoaded) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const w = wobbleRef.current;
    const tick = () => {
      const sliderActive = performance.now() - w.lastActivity < 250;
      w.sweep += sliderActive ? 0.045 : 0.006; // ~17s per revolution at rest
      redrawCircle(w.sweep);
      w.raf = requestAnimationFrame(tick);
    };
    w.raf = requestAnimationFrame(tick);
    return () => {
      if (w.raf) cancelAnimationFrame(w.raf);
      w.raf = 0;
    };
  }, [mapLoaded, redrawCircle]);

  // Search combobox ref for click-outside
  const comboboxRef = useRef<HTMLDivElement>(null);

  // Default the pickup to the seller's saved profile address: geocode it once
  // after the map loads, move the pin there, and surface it in the search box.
  // Skipped when an address was already chosen this session.
  const autoSeededRef = useRef(false);
  useEffect(() => {
    if (autoSeededRef.current || !mapLoaded) return;
    autoSeededRef.current = true;
    const addr = defaultAddress?.trim();
    if (!addr || pickupLabel.trim() !== "") return;
    searchAddresses(addr)
      .then((results) => {
        const hit = results[0];
        if (hit) {
          onPinChange({ lat: hit.lat, lng: hit.lng });
          onPickupLabelChange(hit.label);
        }
      })
      .catch(() => {
        /* profile address didn't geocode: seller can search or drag instead */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded]);

  // Lazy-load mapbox-gl (its stylesheet is statically imported at the top of
  // this file so it is guaranteed to be applied before the map constructs)
  useEffect(() => {
    let cancelled = false;
    import("mapbox-gl")
      .then((mod) => {
        if (cancelled) return;
        // mapbox-gl is a CJS-wrapped ESM module; the actual namespace may land
        // on .default in some bundler configurations. Treat as unknown first to
        // avoid the type narrowing error, then cast to the known MapboxGl type.
        const maybeDefault = (mod as unknown as { default?: MapboxGl }).default;
        const resolved: MapboxGl = maybeDefault ?? (mod as unknown as MapboxGl);
        setGl(resolved);
      })
      .catch(() => {
        if (!cancelled) setGlFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute initial center
  const initCenter: [number, number] =
    initialLng !== null && initialLat !== null
      ? [initialLng, initialLat]
      : MANHATTAN_CENTER;

  // Initialize map once gl module is ready
  useEffect(() => {
    if (!gl || !mapContainerRef.current) return;
    if (mapRef.current) return; // already initialized


    const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
    let map: InstanceType<MapboxGl["Map"]>;
    try {
      map = new gl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: initCenter,
        zoom: 14.5,
        accessToken: TOKEN,
      });
    } catch {
      setGlFailed(true);
      return;
    }

    // Only escalate errors that happen BEFORE the map finishes loading —
    // Mapbox also emits transient post-load tile errors that must not yank
    // the whole step over to the fallback mid-interaction.
    let glLoaded = false;
    map.on("error", () => {
      if (!glLoaded) setGlFailed(true);
    });

    mapRef.current = map;

    // Uber-style control: the pin is a FIXED overlay at the viewport center
    // (rendered in JSX); panning the map is how the user moves the pin. The
    // committed pin location is simply the map center at rest.
    map.on("movestart", () => {
      if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
    });
    map.on("moveend", () => {
      if (tooltipRef.current) tooltipRef.current.style.opacity = "1";
      const c = map.getCenter();
      onPinChange({ lat: c.lat, lng: c.lng });
      // Programmatic moves (search selection / profile seed) keep their own
      // label; only user pans re-derive the address from the new center.
      if (suppressReverseRef.current) {
        suppressReverseRef.current = false;
        return;
      }
      reverseAbortRef.current?.abort();
      const controller = new AbortController();
      reverseAbortRef.current = controller;
      reverseGeocodeAddress(c.lat, c.lng, controller.signal)
        .then((hit) => {
          if (!controller.signal.aborted && hit) onPickupLabelChange(hit.label);
        })
        .catch(() => {
          /* keep the previous address on failure */
        });
    });

    const startLng = pin?.lng ?? initCenter[0];
    const startLat = pin?.lat ?? initCenter[1];

    map.on("load", () => {
      glLoaded = true;
      // Resize after load so the GL canvas fills its container, then again
      // after two animation frames to cover the lazy-import + step-mount
      // sizing race (layout may settle a frame after `load`).
      map.resize();
      requestAnimationFrame(() => requestAnimationFrame(() => map.resize()));

      // Add circle source + layers — drawn at the privacy-mask offset, NOT
      // centered on the pin.
      const initialMask = maskCenter({ lat: startLat, lng: startLng }, radiusMi);
      map.addSource("area", {
        type: "geojson",
        data: circlePolygon(initialMask.lat, initialMask.lng, radiusMi),
      });
      map.addLayer({
        id: "area-fill",
        type: "fill",
        source: "area",
        paint: { "fill-color": "#7C3AED", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "area-line",
        type: "line",
        source: "area",
        paint: { "line-color": "#7C3AED", "line-opacity": 0.55, "line-width": 2 },
      });
      circleReadyRef.current = true;
      setMapLoaded(true);

      // Fire initial pin so wizard always has coords
      if (pin === null) {
        onPinChange({ lat: startLat, lng: startLng });
      }
    });

    // Fix 1 (continued): ResizeObserver so the canvas tracks the container
    // after any layout shift (step becoming visible, viewport resize, etc.).
    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        mapRef.current?.resize();
        rafId = null;
      });
    });
    if (mapContainerRef.current) ro.observe(mapContainerRef.current);

    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      map.remove();
      mapRef.current = null;
      circleReadyRef.current = false;
      setMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  // Update circle when pin or radius changes (after map loaded), and ease the
  // map when the pin was set externally (search selection / profile seed) so
  // the center pin lands on it. User pans already ARE the pin, so the distance
  // check makes this a no-op for them.
  useEffect(() => {
    if (!mapRef.current || !circleReadyRef.current || !pin) return;
    redrawCircle(wobbleRef.current.sweep);
    const c = mapRef.current.getCenter();
    if (Math.abs(c.lat - pin.lat) > 0.00005 || Math.abs(c.lng - pin.lng) > 0.00005) {
      suppressReverseRef.current = true; // keep the chosen label on arrival
      mapRef.current.easeTo({ center: [pin.lng, pin.lat] });
    }
  }, [pin, radiusMi, redrawCircle]);

  // Click-outside for search dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setHighlightIndex(0);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchAbortRef.current?.abort();

    if (value.trim().length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      setSearchError(null);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchLoading(true);
      setSearchError(null);
      try {
        const results = await searchAddresses(value, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(results);
          setShowDropdown(true);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setSearchError("Search unavailable. Drag the pin instead.");
        setShowDropdown(true);
        setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 300);
  }, []);

  const selectSuggestion = useCallback((s: AddressSuggestion) => {
    setSearchQuery("");
    setShowDropdown(false);
    setSuggestions([]);
    onPinChange({ lat: s.lat, lng: s.lng });
    onPickupLabelChange(s.label);
    // Map easing handled by the pin update effect
  }, [onPinChange, onPickupLabelChange]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = suggestions[highlightIndex];
      if (s) selectSuggestion(s);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowDropdown(false);
    }
  };

  // Slider fill percentage for mkt-range
  const sliderFill = `${((Math.min(Math.max(radiusMi, 0.1), 0.4) - 0.1) / 0.3) * 100}%`;

  // GL failed (pre-load) — show fallback. MUST come after every hook above:
  // an early return between hooks corrupts React's hook order and was the
  // root cause of the broken half-rendered map ("sliver") whenever Mapbox
  // emitted any error event.
  if (glFailed) {
    return <>{renderFallback()}</>;
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Map frame. The address search floats over the map's top edge; the map
          is taller to give the floating input room. */}
      <div className={`relative ${MAP_FRAME_CLS}`}>
        {/* Map stays visible from init (never visibility-hidden — GL needs a
            normally-rendered container); the skeleton overlays on top until load.
            Geometry is INLINE on purpose: mapbox-gl.css sets `.mapboxgl-map
            { position: relative }` on this same element, which ties with
            Tailwind's `.absolute` and wins on stylesheet order — collapsing the
            container to its content height (the 34px marker) and shrinking the
            canvas to a sliver. Inline styles outrank any stylesheet. */}
        <div
          ref={mapContainerRef}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" }}
        />
        {!mapLoaded && (
          <Skeleton className="absolute inset-0 z-10 rounded-none pointer-events-none" />
        )}

        {/* Fixed center pin (Uber-style): the map moves underneath it. The
            wrapper is shifted up by half the pin height so the pin TIP marks
            the exact center. pointer-events-none keeps the map fully pannable. */}
        {mapLoaded && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
            <div className="relative -translate-y-1/2 flex flex-col items-center">
              <div
                ref={tooltipRef}
                className="absolute bottom-full mb-1.5 whitespace-nowrap bg-canvas/90 border border-hairline rounded-full px-2 py-0.5 text-[10px] text-muted shadow-card transition-opacity duration-150"
              >
                Move the map to adjust
              </div>
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                style={{ filter: "drop-shadow(0 2px 4px rgba(91,33,182,0.35))" }}
                aria-hidden="true"
              >
                <path d="M20 10c0 6-8 13-8 13s-8-7-8-13a8 8 0 0 1 16 0Z" fill="#7C3AED" />
                <circle cx="12" cy="10" r="3" fill="#FFFFFF" />
              </svg>
            </div>
          </div>
        )}

        {/* Floating address search over the map's top edge */}
        <div ref={comboboxRef} className="absolute top-3 inset-x-3 z-20">
          <input
            type="text"
            value={searchFocused ? searchQuery : pickupLabel || searchQuery}
            placeholder="Insert pickup address"
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => {
              setSearchFocused(true);
              // Start editing from the committed address so it can be refined.
              if (pickupLabel && searchQuery === "") setSearchQuery(pickupLabel);
              if (suggestions.length > 0) setShowDropdown(true);
            }}
            onBlur={() => {
              // Deferred so a mousedown on a suggestion lands before the close.
              setTimeout(() => {
                setSearchFocused(false);
                setShowDropdown(false);
              }, 150);
            }}
            onKeyDown={handleSearchKeyDown}
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            className="w-full h-10 px-3 rounded-md border border-border-strong bg-canvas/95 backdrop-blur-sm shadow-card text-base text-ink md:text-sm placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
          {showDropdown && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+4px)] z-[300] bg-canvas border border-hairline rounded-md shadow-card max-h-52 overflow-y-auto"
            >
              {searchLoading ? (
                <li className="px-3 py-2 text-sm text-muted select-none">Searching…</li>
              ) : searchError ? (
                <li className="px-3 py-2 text-sm text-error select-none">{searchError}</li>
              ) : suggestions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted select-none">No Manhattan matches</li>
              ) : (
                suggestions.map((s, idx) => (
                  <li
                    key={idx}
                    role="option"
                    aria-selected={idx === highlightIndex}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectSuggestion(s);
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`px-3 py-2 text-sm cursor-pointer select-none ${
                      idx === highlightIndex
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-ink hover:bg-surface-soft"
                    }`}
                  >
                    {s.label}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>


      {/* "Location mask" slider with inline value + helper text */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-muted">
          Location mask: {radiusMi.toFixed(2)} mi
        </label>
        <input
          type="range"
          min={0.1}
          max={0.4}
          step={0.05}
          value={radiusMi}
          onChange={(e) => {
            onRadiusChange(Number(e.target.value));
            bumpWobble();
          }}
          onPointerDown={bumpWobble}
          className="mkt-range w-full"
          style={{ ["--mkt-range-fill" as string]: sliderFill }}
          aria-label="Location mask radius in miles"
        />
        <div className="flex justify-between text-[10px] text-muted px-0.5">
          <span>0.10 mi</span>
          <span>0.40 mi</span>
        </div>
        <p className="text-[10px] text-muted-soft leading-relaxed">
          Location mask positioning will be applied randomly around your location.
        </p>
      </div>
    </div>
  );
}
