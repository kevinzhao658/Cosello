import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface AuthUser {
  id: number;
  phone_number: string;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsRegistration: boolean;
  login: (token: string, user: AuthUser | null) => void;
  logout: () => void;
  updateUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("auth_token");
    const savedUser = localStorage.getItem("auth_user");

    if (savedToken) {
      setToken(savedToken);
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch {
          // ignore bad JSON
        }
      }
    }
    setIsLoading(false);
  }, []);

  // If we have a token but no user, fetch /api/auth/me
  useEffect(() => {
    if (!token || user || isLoading) return;

    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: AuthUser = await res.json();
          setUser(data);
          localStorage.setItem("auth_user", JSON.stringify(data));
        } else {
          // token invalid
          setToken(null);
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_user");
        }
      } catch {
        // network error — keep token, user will retry
      }
    })();
  }, [token, user, isLoading]);

  const login = (newToken: string, newUser: AuthUser | null) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("auth_token", newToken);
    if (newUser) {
      localStorage.setItem("auth_user", JSON.stringify(newUser));
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  };

  const updateUser = (updated: AuthUser) => {
    setUser(updated);
    localStorage.setItem("auth_user", JSON.stringify(updated));
  };

  const needsRegistration =
    token !== null && user !== null && (!user.display_name || !user.neighborhood);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: token !== null && user !== null,
        needsRegistration,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
