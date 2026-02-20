import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createElement } from "react";

export interface AuthState {
  token: string;
  actor_id: string;
  actor_type: string;
}

interface AuthContextValue {
  auth: AuthState | null;
  setAuth: (state: AuthState) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadAuth(): AuthState | null {
  const token = localStorage.getItem("token");
  const actor_id = localStorage.getItem("actor_id");
  const actor_type = localStorage.getItem("actor_type");
  if (token && actor_id && actor_type) {
    return { token, actor_id, actor_type };
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<AuthState | null>(loadAuth);

  const setAuth = useCallback((state: AuthState) => {
    localStorage.setItem("token", state.token);
    localStorage.setItem("actor_id", state.actor_id);
    localStorage.setItem("actor_type", state.actor_type);
    setAuthState(state);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("actor_id");
    localStorage.removeItem("actor_type");
    setAuthState(null);
  }, []);

  const isAuthenticated = useCallback(() => auth !== null, [auth]);

  return createElement(
    AuthContext.Provider,
    { value: { auth, setAuth, logout, isAuthenticated } },
    children,
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
