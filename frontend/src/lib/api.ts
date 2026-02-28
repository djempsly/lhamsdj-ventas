const BASE_URL = "http://127.0.0.1:8000/api";

export const getToken = () => localStorage.getItem("access_token");

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = "/";
    return;
  }

  return res;
};

export const api = {
  get: (endpoint: string) => apiFetch(endpoint),
  post: (endpoint: string, data: unknown) => apiFetch(endpoint, { method: "POST", body: JSON.stringify(data) }),
  put: (endpoint: string, data: unknown) => apiFetch(endpoint, { method: "PUT", body: JSON.stringify(data) }),
  patch: (endpoint: string, data: unknown) => apiFetch(endpoint, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (endpoint: string) => apiFetch(endpoint, { method: "DELETE" }),
};
