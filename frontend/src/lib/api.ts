const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: "include", // Send httpOnly cookies
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Try refresh
    try {
      const refreshRes = await fetch(`${API_URL}/auth/refresh/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (refreshRes.ok) {
        // Retry original request
        return fetch(`${API_URL}${endpoint}`, {
          ...options,
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
        });
      }
    } catch {
      // Refresh failed
    }
    localStorage.removeItem("usuario");
    localStorage.removeItem("tema");
    window.location.href = "/";
    return;
  }

  return res;
};

export const api = {
  get: (endpoint: string) => apiFetch(endpoint),
  post: (endpoint: string, data: unknown) =>
    apiFetch(endpoint, { method: "POST", body: JSON.stringify(data) }),
  put: (endpoint: string, data: unknown) =>
    apiFetch(endpoint, { method: "PUT", body: JSON.stringify(data) }),
  patch: (endpoint: string, data: unknown) =>
    apiFetch(endpoint, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (endpoint: string) => apiFetch(endpoint, { method: "DELETE" }),
};
