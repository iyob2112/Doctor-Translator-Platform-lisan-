import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api, { setTokens, getAccessToken } from "../api/client.js";
import { disconnectSocket } from "../hooks/useSocket.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function boot() {
      if (!getAccessToken()) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get("/auth/me");
        setUser(data.user);
      } catch {
        setTokens({});
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      async login(email, password) {
        const { data } = await api.post("/auth/login", { email, password });
        setTokens(data);
        setUser(data.user);
        return data.user;
      },
      async updateProfile(payload) {
        const { data } = await api.patch("/auth/me", payload);
        setUser(data.user);
        return data.user;
      },
      async logout() {
        try {
          await api.post("/auth/logout", {
            refreshToken: localStorage.getItem("refreshToken"),
          });
        } catch {
          /* ignore */
        }
        setTokens({});
        setUser(null);
        disconnectSocket();
      },
      setUser,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
