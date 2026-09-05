import { create } from "zustand";
import { persist } from "zustand/middleware";
import { jwtDecode } from "jwt-decode";

interface JwtPayload {
  userId: string;
  role: string;
}

interface AuthState {
  token: string | null;
  userId: string | null;
  role: string | null;
  login: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      role: null,
      login: (token: string) => {
        const decoded = jwtDecode<JwtPayload>(token);
        set({ token, userId: decoded.userId, role: decoded.role });
      },
      logout: () => set({ token: null, userId: null, role: null }),
    }),
    { name: "auth-storage" },
  ),
);