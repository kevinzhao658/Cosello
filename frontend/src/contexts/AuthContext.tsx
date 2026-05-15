import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { setApiToken, setOnUnauthorized } from "../lib/api";

export interface AuthUser {
  id: string;
  phone_number: string;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
  pickup_address: string | null;
  zip_code: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsRegistration: boolean;
  login: (token: string, user: AuthUser | null) => void;
  logout: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from Supabase on mount; subscribe to auth changes.
  useEffect(() => {
    let isMounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      const session = data.session;
      if (session) {
        setToken(session.access_token);
        const cachedProfile = localStorage.getItem("auth_user");
        if (cachedProfile) {
          try {
            setUser(JSON.parse(cachedProfile) as AuthUser);
          } catch {
            // ignore bad JSON; profile will be re-fetched by the effect below
          }
        }
      }
      setIsLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === "SIGNED_OUT" || !session) {
        setToken(null);
        setUser(null);
        localStorage.removeItem("auth_user");
        return;
      }
      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED — sync the access token.
      setToken(session.access_token);
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // If we have a token but no profile cached, fetch /api/auth/me.
  useEffect(() => {
    if (!token || user || isLoading) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as AuthUser;
          setUser(data);
          localStorage.setItem("auth_user", JSON.stringify(data));
        } else {
          // Token rejected by backend — sign out of Supabase to clear state.
          await supabase.auth.signOut();
        }
      } catch {
        // network error — keep token, user will retry
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, user, isLoading]);

  const login = useCallback((newToken: string, newUser: AuthUser | null) => {
    setToken(newToken);
    setUser(newUser);
    if (newUser) {
      localStorage.setItem("auth_user", JSON.stringify(newUser));
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setToken(null);
    setUser(null);
    localStorage.removeItem("auth_user");
  }, []);

  const updateUser = useCallback((updated: AuthUser) => {
    setUser(updated);
    localStorage.setItem("auth_user", JSON.stringify(updated));
  }, []);

  // Keep the apiFetch token registry in sync with auth state.
  useEffect(() => {
    setApiToken(token);
  }, [token]);

  useEffect(() => {
    setOnUnauthorized(() => {
      void supabase.auth.signOut();
    });
    return () => setOnUnauthorized(null);
  }, []);

  const needsRegistration =
    token !== null && user !== null && (!user.display_name || !user.neighborhood);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: token !== null && user !== null,
      needsRegistration,
      login,
      logout,
      updateUser,
    }),
    [user, token, isLoading, needsRegistration, login, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
