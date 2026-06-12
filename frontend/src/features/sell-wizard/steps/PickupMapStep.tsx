import React, { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "../../../components/ui/Skeleton";
import { circlePolygon } from "../../../lib/geoCircle";
import { hasMapboxToken, searchAddresses } from "../../../lib/mapboxSearch";
import type { AddressSuggestion } from "../../../lib/mapboxSearch";

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
  /** Render-prop fallback: legacy fields shown when no token / GL init fails. */
  renderFallback: () => React.ReactNode;
}

// Manhattan center fallback
const MANHATTAN_CENTER: [number, number] = [-73.985, 40.748];

export function PickupMapStep({
  initialLat,
  initialLng,
  pin,
  onPinChange,
  radiusMi,
  onRadiusChange,
  pickupLabel,
  onPickupLabelChange,
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

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InstanceType<MapboxGl["Map"]> | null>(null);
  const markerRef = useRef<InstanceType<MapboxGl["Marker"]> | null>(null);
  const markerElementRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const circleReadyRef = useRef(false);

  // Debounce ref for search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Search combobox ref for click-outside
  const comboboxRef = useRef<HTMLDivElement>(null);

  // Lazy-load mapbox-gl (+ its stylesheet — required for attribution styling)
  useEffect(() => {
    let cancelled = false;
    void import("mapbox-gl/dist/mapbox-gl.css");
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

    map.on("error", () => {
      setGlFailed(true);
    });

    mapRef.current = map;

    // Build the custom HTML marker element
    const el = document.createElement("div");
    el.style.cssText = "position:relative;display:flex;flex-direction:column;align-items:center;cursor:grab;";
    markerElementRef.current = el;

    // Tooltip pill — visible when idle, hidden during drag
    const tooltip = document.createElement("div");
    tooltip.textContent = "Drag to adjust";
    tooltip.style.cssText = [
      "position:absolute",
      "bottom:calc(100% + 6px)",
      "white-space:nowrap",
      "background:rgba(var(--canvas-rgb,255,255,255),0.9)",
      "border:1px solid var(--hairline,#e5e7eb)",
      "border-radius:9999px",
      "padding:2px 8px",
      "font-size:10px",
      "color:var(--muted,#6b7280)",
      "box-shadow:0 1px 4px rgba(0,0,0,0.12)",
      "pointer-events:none",
      "transition:opacity 0.15s",
    ].join(";");
    tooltipRef.current = tooltip;
    el.appendChild(tooltip);

    // MapPin SVG (lucide path, amber primary color, 34px)
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "34");
    svg.setAttribute("height", "34");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "#D4A017");
    svg.setAttribute("stroke", "#9a7000");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    // MapPin paths: the body + the dot
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M20 10c0 6-8 13-8 13s-8-7-8-13a8 8 0 0 1 16 0Z");
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "10");
    circle.setAttribute("r", "3");
    svg.appendChild(path);
    svg.appendChild(circle);
    el.appendChild(svg);

    const startLng = pin?.lng ?? initCenter[0];
    const startLat = pin?.lat ?? initCenter[1];

    const marker = new gl.Marker({ element: el, draggable: true, anchor: "bottom" })
      .setLngLat([startLng, startLat])
      .addTo(map);
    markerRef.current = marker;

    // Drag events — hide tooltip during drag, show on end
    marker.on("drag", () => {
      if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
    });
    marker.on("dragend", () => {
      if (tooltipRef.current) tooltipRef.current.style.opacity = "1";
      const lngLat = marker.getLngLat();
      onPinChange({ lat: lngLat.lat, lng: lngLat.lng });
    });

    map.on("load", () => {
      // Add circle source + layers
      map.addSource("area", {
        type: "geojson",
        data: circlePolygon(startLat, startLng, radiusMi),
      });
      map.addLayer({
        id: "area-fill",
        type: "fill",
        source: "area",
        paint: { "fill-color": "#D4A017", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "area-line",
        type: "line",
        source: "area",
        paint: { "line-color": "#D4A017", "line-opacity": 0.6, "line-width": 2 },
      });
      circleReadyRef.current = true;
      setMapLoaded(true);

      // Fire initial pin so wizard always has coords
      if (pin === null) {
        onPinChange({ lat: startLat, lng: startLng });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleReadyRef.current = false;
      setMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  // Update circle when pin or radius changes (after map loaded)
  useEffect(() => {
    if (!mapRef.current || !circleReadyRef.current || !pin) return;
    const source = mapRef.current.getSource("area") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(circlePolygon(pin.lat, pin.lng, radiusMi));
    // Update marker position if the pin changed from search (not drag)
    if (markerRef.current) {
      const current = markerRef.current.getLngLat();
      if (Math.abs(current.lat - pin.lat) > 0.00001 || Math.abs(current.lng - pin.lng) > 0.00001) {
        markerRef.current.setLngLat([pin.lng, pin.lat]);
        mapRef.current.easeTo({ center: [pin.lng, pin.lat] });
      }
    }
  }, [pin, radiusMi]);

  // GL failed — show fallback
  if (glFailed) {
    return <>{renderFallback()}</>;
  }

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
        setSearchError("Search unavailable — drag the pin instead");
        setShowDropdown(true);
        setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 300);
  }, []);

  const selectSuggestion = useCallback((s: AddressSuggestion) => {
    setSearchQuery(s.label);
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

  return (
    <div className="space-y-4">
      {/* Search box */}
      <div ref={comboboxRef} className="relative">
        <input
          type="text"
          value={searchQuery}
          placeholder={pickupLabel || "Search for an address…"}
          onChange={(e) => handleSearchChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          onKeyDown={handleSearchKeyDown}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          className="w-full h-10 px-3 rounded-md border border-border-strong bg-canvas text-base text-ink md:text-sm placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
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

      {/* Map container */}
      <div className="relative w-full rounded-lg overflow-hidden border border-hairline" style={{ height: 320 }}>
        {!mapLoaded && (
          <Skeleton className="absolute inset-0 rounded-none" />
        )}
        <div
          ref={mapContainerRef}
          className="absolute inset-0"
          style={{ visibility: mapLoaded ? "visible" : "hidden" }}
        />
      </div>

      {/* Radius slider */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label className="text-[11px] font-semibold text-muted">Area size</label>
          <span className="text-[11px] text-muted">{radiusMi.toFixed(2)} mi</span>
        </div>
        <input
          type="range"
          min={0.1}
          max={0.4}
          step={0.05}
          value={radiusMi}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="mkt-range w-full"
          style={{ ["--mkt-range-fill" as string]: sliderFill }}
          aria-label="Area size in miles"
        />
        <div className="flex justify-between text-[10px] text-muted px-0.5">
          <span>0.10 mi</span>
          <span>0.40 mi</span>
        </div>
      </div>
      <p className="text-[10px] text-muted-soft leading-relaxed">
        Buyers see only the shaded area — your exact address is never shared until pickup is confirmed.
      </p>
    </div>
  );
}
