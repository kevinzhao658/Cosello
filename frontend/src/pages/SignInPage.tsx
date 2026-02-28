import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Loader2, ArrowRight, Phone } from "lucide-react";
import type { AuthUser } from "../contexts/AuthContext";

interface SignInPageProps {
  onSuccess: (token: string, userExists: boolean, user: AuthUser | null) => void;
  onCancel: () => void;
}

export default function SignInPage({ onSuccess, onCancel }: SignInPageProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOTP = async () => {
    const phone = phoneNumber.trim();
    if (!phone) {
      setError("Please enter a phone number");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phone }),
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
        body: JSON.stringify({ phone_number: phoneNumber.trim(), otp_code: otp }),
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
                : `We sent a code to ${phoneNumber}`}
            </p>
          </div>

          {step === "phone" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                  Phone Number
                </label>
                <Input
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <Button
                onClick={handleSendOTP}
                disabled={isLoading}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white border-0"
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
