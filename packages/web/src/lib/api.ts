const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as Record<string, string>).error ?? `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

export interface LoginResult {
  token: string;
  actor_id: string;
  actor_type: string;
}

export function login(
  type: string,
  credentials: Record<string, string>,
): Promise<LoginResult> {
  return request<LoginResult>(`/auth/${type}/login`, {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export interface BalanceResult {
  owner_type: string;
  owner_id: string;
  currency: string;
  account_id: string;
  balance: string;
}

export function getBalance(
  ownerType: string,
  ownerId: string,
  currency: string,
): Promise<BalanceResult> {
  return request<BalanceResult>(
    `/wallets/${ownerType}/${ownerId}/${currency}/balance`,
  );
}
