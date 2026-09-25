import { create } from "zustand";
import { persist } from "zustand/middleware";
import { jwtDecode } from "jwt-decode";

interface JwtPayload {
  userId: string;
  role: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  userId: string | null;
  role: string | null;
  login: (token: string, refreshToken: string) => void;
  setToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      userId: null,
      role: null,
      login: (token: string, refreshToken: string) => {
        const decoded = jwtDecode<JwtPayload>(token);
        set({
          token,
          refreshToken,
          userId: decoded.userId,
          role: decoded.role,
        });
      },
      // Used after a silent refresh: swap in the new access token,
      // keep everything else (the refresh token stays the same).
      setToken: (token: string) => {
        const decoded = jwtDecode<JwtPayload>(token);
        set({ token, userId: decoded.userId, role: decoded.role });
      },
      logout: () =>
        set({ token: null, refreshToken: null, userId: null, role: null }),
    }),
    { name: "auth-storage" },
  ),
);