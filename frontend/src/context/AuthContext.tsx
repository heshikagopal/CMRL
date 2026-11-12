import React, { createContext, useContext, useEffect, useState } from "react";
import { api, getAuthToken, setAuthToken } from "@/api/client";
import type { RoleName, User } from "@/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  hasRole: (...roles: RoleName[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("cmrl_itam_user");
    try {
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(!!getAuthToken());

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<User>("/auth/me")
      .then((res) => {
        setUser(res.data);
        localStorage.setItem("cmrl_itam_user", JSON.stringify(res.data));
      })
      .catch(() => {
        setAuthToken(null);
        localStorage.removeItem("cmrl_itam_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string): Promise<User> => {
    const res = await api.post<{ access_token: string; user: User }>("/auth/login", { username, password });
    setAuthToken(res.data.access_token);
    localStorage.setItem("cmrl_itam_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    setAuthToken(null);
    localStorage.removeItem("cmrl_itam_user");
    setUser(null);
  };

  const hasRole = (...roles: RoleName[]) => {
    if (!user) return false;
    return roles.includes(user.role.name);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
