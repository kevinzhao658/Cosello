import { useState, useRef, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Loader2, ArrowRight, Phone, ChevronDown, CheckCircle } from "lucide-react";
import type { AuthUser } from "../contexts/AuthContext";

const COUNTRIES = [
  { flag: "🇺🇸", name: "United States", code: "+1", maxDigits: 10, format: [3, 3, 4] },
  { flag: "🇨🇦", name: "Canada", code: "+1", maxDigits: 10, format: [3, 3, 4] },
  { flag: "🇬🇧", name: "United Kingdom", code: "+44", maxDigits: 10, format: [4, 6] },
  { flag: "🇦🇺", name: "Australia", code: "+61", maxDigits: 9, format: [3, 3, 3] },
  { flag: "🇩🇪", name: "Germany", code: "+49", maxDigits: 11, format: [3, 4, 4] },
  { flag: "🇫🇷", name: "France", code: "+33", maxDigits: 9, format: [1, 2, 2, 2, 2] },
  { flag: "🇯🇵", name: "Japan", code: "+81", maxDigits: 10, format: [2, 4, 4] },
  { flag: "🇰🇷", name: "South Korea", code: "+82", maxDigits: 10, format: [2, 4, 4] },
  { flag: "🇮🇳", name: "India", code: "+91", maxDigits: 10, format: [5, 5] },
  { flag: "🇧🇷", name: "Brazil", code: "+55", maxDigits: 11, format: [2, 5, 4] },
  { flag: "🇲🇽", name: "Mexico", code: "+52", maxDigits: 10, format: [2, 4, 4] },
  { flag: "🇨🇳", name: "China", code: "+86", maxDigits: 11, format: [3, 4, 4] },
  { flag: "🇮🇹", name: "Italy", code: "+39", maxDigits: 10, format: [3, 3, 4] },
  { flag: "🇪🇸", name: "Spain", code: "+34", maxDigits: 9, format: [3, 3, 3] },
  { flag: "🇳🇬", name: "Nigeria", code: "+234", maxDigits: 10, format: [3, 3, 4] },
];

function formatPhone(digits: string, format: number[]): string {
  let result = "";
  let pos = 0;
  for (let i = 0; i < format.length && pos < digits.length; i++) {
    const chunk = digits.slice(pos, pos + format[i]);
    result += (i > 0 ? "-" : "") + chunk;
    pos += format[i];
  }
  return result;
}

function stripNonDigits(value: string): string {
  return value.replace(/\D/g, "");
}

interface SignInPageProps {
  onSuccess: (token: string, userExists: boolean, user: AuthUser | null) => void;
  onCancel: () => void;
}

export default function SignInPage({ onSuccess, onCancel }: SignInPageProps) {
  const [rawDigits, setRawDigits] = useState("");
  const [countryIdx, setCountryIdx] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const country = COUNTRIES[countryIdx];
  const formatted = formatPhone(rawDigits, country.format);
  const fullNumber = `${country.code}${rawDigits}`;
  const isPhoneComplete = rawDigits.length === country.maxDigits;

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Check if phone number exists in DB once all digits are entered
  useEffect(() => {
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    setUserExists(null);

    if (!isPhoneComplete) return;

    setCheckingPhone(true);
    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-phone?phone_number=${encodeURIComponent(fullNumber)}`);
        if (res.ok) {
          const data = await res.json();
          setUserExists(data.exists);
        }
      } catch {
        // silently ignore
      } finally {
        setCheckingPhone(false);
      }
    }, 300);

    return () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, [rawDigits, countryIdx]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = stripNonDigits(e.target.value);
    if (digits.length <= country.maxDigits) {
      setRawDigits(digits);
    }
  };

  const handleSendOTP = async () => {
    if (!rawDigits) {
      setError("Please enter a phone number");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: fullNumber }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Failed to send code" }));
        throw new Error(data.detail);
      }

      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Failed to send code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: fullNumber, otp_code: otp }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Verification failed" }));
        throw new Error(data.detail);
      }

      const data = await res.json();
      onSuccess(data.access_token, data.user_exists, data.user);
    } catch (err: any) {
      setError(err.message || "Verification failed");
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
              <Phone className="size-7 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-light tracking-wider mb-1">
              {step === "phone" ? "Sign In" : "Enter Code"}
            </h2>
            <p className="text-white/50 text-sm">
              {step === "phone"
                ? "Enter your phone number to continue"
                : `We sent a code to ${country.code} ${formatted}`}
            </p>
          </div>

          {step === "phone" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                  Phone Number
                </label>
                <div className="flex items-stretch gap-0">
                  {/* Country code button */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="flex items-center gap-1 px-3 h-full rounded-l-md border border-r-0 border-white/20 bg-white/5 text-white text-sm hover:bg-white/10 transition-colors whitespace-nowrap"
                    >
                      {country.flag} {country.code}
                      <ChevronDown className="size-3 text-white/40" />
                    </button>

                    {dropdownOpen && (
                      <div
                        className="absolute z-50 mt-1 left-0 min-w-[280px] max-h-52 overflow-y-auto rounded-md border border-white/20 shadow-lg"
                        style={{ backgroundColor: "#18181b" }}
                      >
                        {COUNTRIES.map((c, i) => (
                          <button
                            key={`${c.code}-${c.name}`}
                            type="button"
                            onClick={() => {
                              setCountryIdx(i);
                              setRawDigits("");
                              setDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${
                              i === countryIdx ? "text-cyan-400" : "text-white"
                            }`}
                          >
                            {c.flag} {c.name} ({c.code})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Phone number input */}
                  <div className="relative flex-1">
                    <Input
                      type="tel"
                      inputMode="numeric"
                      placeholder={country.format.map((n) => "0".repeat(n)).join("-")}
                      value={formatted}
                      onChange={handlePhoneChange}
                      onKeyDown={(e) => e.key === "Enter" && isPhoneComplete && handleSendOTP()}
                      className="bg-white/5 border-white/20 text-white placeholder:text-white/30 rounded-l-none pr-9"
                    />
                    {isPhoneComplete && userExists === true && (
                      <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-emerald-400" />
                    )}
                    {checkingPhone && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-white/30 animate-spin" />
                    )}
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <Button
                onClick={handleSendOTP}
                disabled={isLoading || !isPhoneComplete}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    Continue
                    <ArrowRight className="size-4 ml-2" />
                  </>
                )}
              </Button>

              <Button
                onClick={onCancel}
                variant="ghost"
                className="w-full text-white/40 hover:text-white/60"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                  Verification Code
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyOTP()}
                  className="bg-white/5 border-white/20 text-white text-center text-2xl tracking-[0.4em] placeholder:text-white/20"
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <Button
                onClick={handleVerifyOTP}
                disabled={isLoading || otp.length !== 6}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white border-0"
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : "Verify"}
              </Button>

              <Button
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setError("");
                }}
                variant="ghost"
                className="w-full text-white/40 hover:text-white/60"
              >
                Use a different number
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
