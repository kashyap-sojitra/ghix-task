import { create } from "zustand";
import Cookies from "js-cookie";
import { auth } from "@/lib/api";

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: Cookies.get("token") ?? null,
  isLoading: false,

  setAuth: (user, token) => {
    Cookies.set("token", token, { expires: 7 });
    set({ user, token });
  },

  logout: () => {
    Cookies.remove("token");
    set({ user: null, token: null });
  },

  checkAuth: async () => {
    const token = Cookies.get("token");
    if (!token) return;
    try {
      const res = await auth.me();
      set({ user: res.data.data });
    } catch {
      Cookies.remove("token");
      set({ user: null, token: null });
    }
  },
}));
