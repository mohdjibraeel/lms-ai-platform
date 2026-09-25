import axios from "axios";
import { useAuthStore } from "../store/authStore";

const BASE_URL = "http://localhost:4000/api/v1";

const api = axios.create({
  baseURL: BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If several requests fail at the same moment (a page usually fires a few),
// they all share ONE refresh call instead of each making their own.
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    const refreshToken = useAuthStore.getState().refreshToken;
    // Plain axios here, NOT `api` — otherwise a failed refresh would
    // trigger this same handler again and loop forever.
    refreshPromise = axios
      .post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
      .then((res) => {
        const newToken = res.data.access_token as string;
        useAuthStore.getState().setToken(newToken);
        return newToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.error?.code;
    const { refreshToken } = useAuthStore.getState();

    // Only react to "your token is invalid or expired". A wrong password at
    // login is also a 401, but has a different code, so it is left alone.
    if (
      error.response?.status === 401 &&
      code === "INVALID_TOKEN" &&
      refreshToken &&
      original &&
      !original._retry
    ) {
      original._retry = true; // never retry the same request twice
      try {
        const newToken = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);

export default api;