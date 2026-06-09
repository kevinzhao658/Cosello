import { useState, useRef, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Loader2, UserCircle } from "lucide-react";
import type { AuthUser } from "../contexts/AuthContext";
import { useNeighborhoods } from "../lib/useNeighborhoods";
import { useClickOutside } from "../hooks/useClickOutside";
import { NYC_ZIP_SET, NEIGHBORHOOD_ZIP } from "../lib/nycZips";
import { LocationCombobox } from "../components/LocationCombobox";

interface SignUpPageProps {
  pendingToken: string;
  onComplete: (user: AuthUser) => void;
  onCancel: () => void;
}

export default function SignUpPage({ pendingToken, onComplete, onCancel }: SignUpPageProps) {
  const { list: neighborhoodsList, isLoading: isLoadingNeighborhoods, error: neighborhoodsError, retry: retryNeighborhoods } = useNeighborhoods();
  const neighborhoods = neighborhoodsList ?? [];

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [zipTouched, setZipTouched] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isValidNeighborhood = neighborhoods.some(
    (n) => n.toLowerCase() === neighborhood.trim().toLowerCase()
  );

  const filtered = neighborhood.trim()
    ? neighborhoods.filter((n) =>
        n.toLowerCase().includes(neighborhood.trim().toLowerCase())
      )
    : neighborhoods;

  // Prefill ZIP from neighborhood when neighborhood becomes valid and user hasn't manually set ZIP
  useEffect(() => {
    if (isValidNeighborhood && !zipTouched) {
      const prefill = NEIGHBORHOOD_ZIP[neighborhood.trim()] ?? "";
      if (prefill) setZipCode(prefill);
    }
  }, [isValidNeighborhood, neighborhood, zipTouched]);

  // Close suggestions on click outside
  useClickOutside(
    [inputRef, suggestionsRef],
    () => setShowSuggestions(false),
    showSuggestions,
  );

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name");
      return;
    }
    if (!isValidNeighborhood) {
      setError("Please select a valid Manhattan neighborhood");
      return;
    }
    if (!NYC_ZIP_SET.has(zipCode)) {
      setError("Select your ZIP code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pendingToken}`,
        },
        body: JSON.stringify({
          display_name: `${firstName.trim()} ${lastName.trim()}`,
          neighborhood: neighborhood.trim(),
          pickup_address: pickupAddress.trim() || undefined,
          zip_code: zipCode,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Registration failed" }));
        throw new Error(data.detail);
      }

      const user = (await res.json()) as AuthUser;
      onComplete(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-sm">
        <div className="bg-canvas border border-hairline rounded-md p-8 shadow-card">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center size-14 bg-primary-soft rounded-full mb-4">
              <UserCircle className="size-7 text-primary" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-ink mb-1" style={{ letterSpacing: "-0.5px" }}>
              Complete Your Profile
            </h2>
            <p className="text-muted text-sm">Tell us a bit about yourself</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1.5 font-semibold">
                  First Name
                </label>
                <Input
                  type="text"
                  placeholder="First"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-semibold">
                  Last Name
                </label>
                <Input
                  type="text"
                  placeholder="Last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted mb-1.5 font-semibold">
                Default Pickup Address
              </label>
              <Input
                type="text"
                placeholder="Street address"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
              />
              <p className="text-[10px] text-muted-soft mt-1.5 leading-relaxed">
                Your address will never be visible to buyers without your consent. It will be used to group listings by local geography.
              </p>
            </div>

            <div className="relative">
              <label className="block text-xs text-muted mb-1.5 font-semibold">
                Neighborhood
              </label>
              {isLoadingNeighborhoods ? (
                <div className="text-sm text-muted py-3 flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Loading neighborhoods…
                </div>
              ) : neighborhoodsError ? (
                <div className="text-sm text-error py-3">
                  Couldn't load neighborhoods: {neighborhoodsError}.{" "}
                  <button
                    type="button"
                    onClick={retryNeighborhoods}
                    className="underline text-primary hover:text-primary-hover"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    ref={inputRef}
                    type="text"
                    placeholder="e.g., Chelsea"
                    value={neighborhood}
                    onChange={(e) => {
                      setNeighborhood(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && isValidNeighborhood) handleRegister();
                    }}
                  />

                  {showSuggestions && filtered.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border border-border-strong bg-canvas shadow-overlay"
                    >
                      {filtered.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setNeighborhood(n);
                            setShowSuggestions(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-soft transition-colors ${
                            n.toLowerCase() === neighborhood.trim().toLowerCase()
                              ? "text-primary"
                              : "text-ink"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}

                  {showSuggestions && filtered.length === 0 && neighborhood.trim() && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-border-strong bg-canvas shadow-overlay px-3 py-2 text-sm text-muted">
                      No matching neighborhoods
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1.5 font-semibold">
                  City
                </label>
                <Input
                  type="text"
                  value="New York"
                  disabled
                  className="cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-semibold">
                  State
                </label>
                <Input
                  type="text"
                  value="NY"
                  disabled
                  className="cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted mb-1.5 font-semibold">
                Zip Code <span className="text-error">*</span>
              </label>
              <LocationCombobox
                id="signup-zip"
                value={zipCode}
                onChange={(zip) => { setZipCode(zip); setZipTouched(true); }}
                placeholder="Search ZIP or neighborhood"
              />
            </div>

            {error && <p className="text-sm text-error">{error}</p>}

            <Button
              onClick={handleRegister}
              disabled={isLoading || isLoadingNeighborhoods || !isValidNeighborhood || !firstName.trim() || !lastName.trim() || !NYC_ZIP_SET.has(zipCode)}
              className="w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Get Started"
              )}
            </Button>

            <button
              onClick={onCancel}
              className="w-full text-sm text-muted hover:text-ink transition-colors mt-2"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
