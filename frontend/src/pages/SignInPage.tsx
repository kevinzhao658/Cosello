import { useState, useRef, useEffect } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Loader2, ArrowRight, Phone, ChevronDown, CheckCircle } from "lucide-react";
import type { AuthUser } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { useClickOutside } from "../hooks/useClickOutside";

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

// Cloudflare's always-passes test key for local dev; production key set via VITE_TURNSTILE_SITE_KEY.
// When the env var is absent, the widget is not rendered and signInWithOtp is called without a
// captchaToken, preserving the pre-Turnstile behavior exactly.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const hasSiteKey = Boolean(TURNSTILE_SITE_KEY);

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
  // Turnstile token state — string when solved, null when absent/consumed/expired
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Typed ref for the Turnstile widget instance — used to reset after each OTP send
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);

  const country = COUNTRIES[countryIdx];
  const formatted = formatPhone(rawDigits, country.format);
  const fullNumber = `${country.code}${rawDigits}`;
  const isPhoneComplete = rawDigits.length === country.maxDigits;

  // Close dropdown on click outside
  useClickOutside(dropdownRef, () => setDropdownOpen(false), dropdownOpen);

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

  // Reset the Turnstile widget and clear the local token — called after every OTP send attempt
  // (success or failure) so that the single-use token is never resubmitted, and before any resend.
  const resetCaptcha = () => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  };

  const handleSendOTP = async () => {
    if (!rawDigits) {
      setError("Please enter a phone number");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Only pass captchaToken when the site key is configured; otherwise omit entirely
      // to preserve the pre-Turnstile signInWithOtp behavior (Supabase CAPTCHA toggle is OFF).
      const { error: otpError } = hasSiteKey
        ? await supabase.auth.signInWithOtp({
            phone: fullNumber,
            options: { captchaToken: captchaToken ?? undefined },
          })
        : await supabase.auth.signInWithOtp({
            phone: fullNumber,
          });

      // Token is single-use — reset widget regardless of outcome so the next send gets a fresh token.
      resetCaptcha();

      if (otpError) {
        // Surface CAPTCHA-related Supabase errors as human-readable copy rather than raw codes.
        const msg = otpError.message ?? "";
        if (msg.toLowerCase().includes("captcha")) {
          setError("CAPTCHA verification failed. Please complete the security check and try again.");
        } else {
          throw new Error(msg || "Failed to send code");
        }
        return;
      }

      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
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
      // Supabase enforces CAPTCHA on the OTP *request* (signInWithOtp), not on verifyOtp.
      // The verification step does not require a captchaToken under standard Supabase configuration,
      // so we intentionally omit it here.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: fullNumber,
        token: otp,
        type: "sms",
      });

      if (verifyError) {
        throw new Error(verifyError.message || "Verification failed");
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        throw new Error("Session unavailable after verification");
      }

      const accessToken = session.access_token;
      const meRes = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let profile: AuthUser | null = null;
      if (meRes.ok) {
        profile = (await meRes.json()) as AuthUser;
      } else if (meRes.status !== 404) {
        // 404 = profile doesn't exist yet (new user); other errors should surface.
        const data = await meRes.json().catch(() => ({ detail: "Failed to load profile" }));
        throw new Error(data.detail || "Failed to load profile");
      }

      const userExists = profile !== null && Boolean(profile.display_name);
      onSuccess(accessToken, userExists, profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
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
              <Phone className="size-7 text-primary" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-ink mb-1" style={{ letterSpacing: "-0.5px" }}>
              {step === "phone" ? "Sign In" : "Enter Code"}
            </h2>
            <p className="text-muted text-sm">
              {step === "phone"
                ? "Enter your phone number to continue"
                : `We sent a code to ${country.code} ${formatted}`}
            </p>
          </div>

          {step === "phone" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-muted mb-1.5 font-semibold">
                  Phone Number
                </label>
                <div className="flex items-stretch gap-0">
                  {/* Country code button */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="flex items-center gap-1 px-3 h-9 rounded-l-md border border-r-0 border-border-strong bg-canvas text-ink text-sm hover:bg-surface-soft transition-colors whitespace-nowrap"
                    >
                      {country.flag} {country.code}
                      <ChevronDown className="size-3 text-muted" />
                    </button>

                    {dropdownOpen && (
                      <div className="absolute z-50 mt-1 left-0 min-w-[280px] max-h-52 overflow-y-auto rounded-md border border-border-strong bg-canvas shadow-overlay">
                        {COUNTRIES.map((c, i) => (
                          <button
                            key={`${c.code}-${c.name}`}
                            type="button"
                            onClick={() => {
                              setCountryIdx(i);
                              setRawDigits("");
                              setDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-soft transition-colors ${
                              i === countryIdx ? "text-primary" : "text-ink"
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
                      className="rounded-l-none pr-9"
                    />
                    {isPhoneComplete && userExists === true && (
                      <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-primary" />
                    )}
                    {checkingPhone && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted animate-spin" />
                    )}
                  </div>
                </div>
              </div>

              {/* Turnstile CAPTCHA widget — only rendered when VITE_TURNSTILE_SITE_KEY is set.
                  Uses managed mode so users typically see nothing (or a brief checkbox if
                  Cloudflare requests interactivity). theme="light" to match the light UI
                  (the widget is a cross-origin iframe, so only Turnstile's light/dark/auto
                  themes are available — no arbitrary CSS). */}
              {hasSiteKey && (
                <div className="flex justify-center">
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={TURNSTILE_SITE_KEY!}
                    onSuccess={(token: string) => setCaptchaToken(token)}
                    onExpire={() => {
                      // Token expired (~5 min) — clear state and reset so a fresh token is issued.
                      setCaptchaToken(null);
                      turnstileRef.current?.reset();
                    }}
                    onError={(code: string) => {
                      // Widget-level error (network failure, script blocked, etc.) — reset so the
                      // user can retry, and surface a human-readable message via existing error state.
                      setCaptchaToken(null);
                      turnstileRef.current?.reset();
                      setError(`Security check failed (${code}). Please refresh and try again.`);
                    }}
                    options={{ theme: "light", size: "normal" }}
                  />
                </div>
              )}

              {error && <p className="text-sm text-error">{error}</p>}

              <Button
                onClick={handleSendOTP}
                disabled={isLoading || !isPhoneComplete || (hasSiteKey && !captchaToken)}
                className="w-full disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="w-full text-muted hover:text-ink"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-muted mb-1.5 font-semibold">
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
                  className="text-center text-2xl tracking-[0.4em]"
                />
              </div>

              {error && <p className="text-sm text-error">{error}</p>}

              <Button
                onClick={handleVerifyOTP}
                disabled={isLoading || otp.length !== 6}
                className="w-full"
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : "Verify"}
              </Button>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setOtp("");
                    setError("");
                    // resetCaptcha() is called inside handleSendOTP after the request, so the
                    // widget will already be reset by the time the user hits Resend. Calling
                    // handleSendOTP here directly ensures we never reuse a consumed token — the
                    // widget re-issues a fresh token for the next send.
                    handleSendOTP();
                  }}
                  disabled={isLoading}
                  className="text-sm text-primary hover:text-primary-hover transition-colors disabled:opacity-50"
                >
                  Resend code
                </button>
                <span className="text-hairline">|</span>
                <button
                  onClick={() => {
                    setStep("phone");
                    setOtp("");
                    setError("");
                    // Clear any stale captcha token when returning to the phone step.
                    // The widget remounts naturally (it is only rendered on step === "phone"),
                    // which resets it and issues a new token automatically.
                    setCaptchaToken(null);
                  }}
                  className="text-sm text-muted hover:text-ink transition-colors"
                >
                  Use a different number
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
