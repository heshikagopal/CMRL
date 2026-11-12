import axios from "axios";

const TOKEN_KEY = "cmrl_itam_token";

const RAW_API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/+$/, "") || "";

// Origin without trailing `/api` (empty string in local Vite proxy mode)
export const BACKEND_ORIGIN = RAW_API_BASE.endsWith("/api")
  ? RAW_API_BASE.slice(0, -4)
  : RAW_API_BASE;

export const API_BASE_URL = BACKEND_ORIGIN ? `${BACKEND_ORIGIN}/api` : "/api";

export function resolveBackendUrl(path?: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return BACKEND_ORIGIN ? `${BACKEND_ORIGIN}${normalized}` : normalized;
}

export function getWebSocketBaseUrl(): string {
  if (BACKEND_ORIGIN) {
    return BACKEND_ORIGIN.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.includes("/login")) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem("cmrl_itam_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getApiErrorMessage(err: unknown, fallback = "Operation failed"): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  }
  return fallback;
}

export async function downloadAuthorizedFile(url: string, filename: string): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(resolveBackendUrl(url), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objUrl);
}
