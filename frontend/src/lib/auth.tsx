"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

export type AuthState = {
  token: string | null;
  email: string | null;
};

const AuthContext = createContext<{
  auth: AuthState;
  setAuth: (next: AuthState) => void;
  logout: () => void;
}>({ auth: { token: null, email: null }, setAuth: () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuthState] = useState<AuthState>({ token: null, email: null });

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const email = typeof window !== "undefined" ? localStorage.getItem("email") : null;
    if (token) setAuthState({ token, email });
  }, []);

  const setAuth = (next: AuthState) => {
    setAuthState(next);
    if (typeof window !== "undefined") {
      if (next.token) {
        localStorage.setItem("token", next.token);
        localStorage.setItem("email", next.email || "");
      } else {
        localStorage.removeItem("token");
        localStorage.removeItem("email");
      }
    }
  };

  const logout = useCallback(() => setAuth({ token: null, email: null }), []);

  const value = useMemo(() => ({ auth, setAuth, logout }), [auth, setAuth, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
