import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Loader2, UserCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface SignUpPageProps {
  onComplete: () => void;
}

export default function SignUpPage({ onComplete }: SignUpPageProps) {
  const { token, updateUser } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    if (!displayName.trim() || !neighborhood.trim()) {
      setError("Please fill in all fields");
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
          display_name: displayName.trim(),
          neighborhood: neighborhood.trim(),
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
            <div>
              <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                Display Name
              </label>
              <Input
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
              />
            </div>

            <div>
              <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                Neighborhood
              </label>
              <Input
                type="text"
                placeholder="e.g. Chelsea"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              onClick={handleRegister}
              disabled={isLoading}
              className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0"
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
