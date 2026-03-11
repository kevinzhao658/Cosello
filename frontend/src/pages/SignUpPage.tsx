import { useState, useRef, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Loader2, UserCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const MANHATTAN_NEIGHBORHOODS = [
  "Battery Park City",
  "Carnegie Hill",
  "Chelsea",
  "Chinatown",
  "Civic Center",
  "Clinton (Hell's Kitchen)",
  "East Harlem",
  "East Village",
  "Financial District",
  "Flatiron District",
  "Gramercy Park",
  "Greenwich Village",
  "Hamilton Heights",
  "Harlem",
  "Hudson Heights",
  "Inwood",
  "Kips Bay",
  "Lenox Hill",
  "Lincoln Square",
  "Little Italy",
  "Lower East Side",
  "Marble Hill",
  "Midtown East",
  "Midtown West",
  "Morningside Heights",
  "Murray Hill",
  "NoHo",
  "NoMad",
  "Nolita",
  "Roosevelt Island",
  "SoHo",
  "Stuyvesant Town",
  "Sutton Place",
  "Theater District",
  "Tribeca",
  "Tudor City",
  "Turtle Bay",
  "Two Bridges",
  "Upper East Side",
  "Upper West Side",
  "Washington Heights",
  "West Village",
  "Yorkville",
];

interface SignUpPageProps {
  onComplete: () => void;
}

export default function SignUpPage({ onComplete }: SignUpPageProps) {
  const { token, updateUser } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isValidNeighborhood = MANHATTAN_NEIGHBORHOODS.some(
    (n) => n.toLowerCase() === neighborhood.trim().toLowerCase()
  );

  const filtered = neighborhood.trim()
    ? MANHATTAN_NEIGHBORHOODS.filter((n) =>
        n.toLowerCase().includes(neighborhood.trim().toLowerCase())
      )
    : MANHATTAN_NEIGHBORHOODS;

  // Close suggestions on click outside
  useEffect(() => {
    if (!showSuggestions) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (inputRef.current?.contains(target)) return;
      if (suggestionsRef.current?.contains(target)) return;
      setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSuggestions]);

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name");
      return;
    }
    if (!isValidNeighborhood) {
      setError("Please select a valid Manhattan neighborhood");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: `${firstName.trim()} ${lastName.trim()}`,
          neighborhood: neighborhood.trim(),
          pickup_address: pickupAddress.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Registration failed" }));
        throw new Error(data.detail);
      }

      const user = await res.json();
      updateUser(user);
      onComplete();
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center size-14 bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 rounded-full mb-4">
              <UserCircle className="size-7 text-fuchsia-400" />
            </div>
            <h2 className="text-2xl font-light tracking-wider mb-1">
              Complete Your Profile
            </h2>
            <p className="text-white/50 text-sm">Tell us a bit about yourself</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                  First Name
                </label>
                <Input
                  type="text"
                  placeholder="First"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                  Last Name
                </label>
                <Input
                  type="text"
                  placeholder="Last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                />
              </div>
            </div>

            <div className="relative">
              <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                Neighborhood
              </label>
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
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
              />

              {showSuggestions && filtered.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border border-white/20 shadow-lg"
                  style={{ backgroundColor: "#18181b" }}
                >
                  {filtered.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setNeighborhood(n);
                        setShowSuggestions(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${
                        n.toLowerCase() === neighborhood.trim().toLowerCase()
                          ? "text-fuchsia-400"
                          : "text-white"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              {showSuggestions && filtered.length === 0 && neighborhood.trim() && (
                <div
                  className="absolute z-50 mt-1 w-full rounded-md border border-white/20 shadow-lg px-3 py-2 text-sm text-white/40"
                  style={{ backgroundColor: "#18181b" }}
                >
                  No matching neighborhoods
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                Default Pickup Address
              </label>
              <Input
                type="text"
                placeholder="Building name or cross roads"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
              />
              <p className="text-[10px] text-white/30 mt-1.5 leading-relaxed">
                Your address will never be visible to buyers without your consent. It will be used to group listings by local geography.
              </p>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              onClick={handleRegister}
              disabled={isLoading || !isValidNeighborhood || !firstName.trim() || !lastName.trim()}
              className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Get Started"
              )}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
