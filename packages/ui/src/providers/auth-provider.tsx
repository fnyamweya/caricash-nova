import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export interface Actor {
    id: string;
    type: string;
    name: string;
}

export interface AuthState {
    isAuthenticated: boolean;
    token: string | null;
    actor: Actor | null;
}

interface AuthContextValue extends AuthState {
    login: (token: string, actor: Actor) => void;
    logout: () => void;
}

const TOKEN_KEY = 'caricash_token';
const ACTOR_KEY = 'caricash_actor';

const AuthContext = createContext<AuthContextValue | null>(null);

function loadInitialState(): AuthState {
    if (typeof window === 'undefined') {
        return { isAuthenticated: false, token: null, actor: null };
    }

    const token = localStorage.getItem(TOKEN_KEY);
    const actorJson = localStorage.getItem(ACTOR_KEY);
    let actor: Actor | null = null;

    if (actorJson) {
        try {
            actor = JSON.parse(actorJson) as Actor;
        } catch {
            actor = null;
        }
    }

    return {
        isAuthenticated: !!token,
        token,
        actor,
    };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>(loadInitialState);

    useEffect(() => {
        const initial = loadInitialState();
        setState(initial);
    }, []);

    const login = useCallback((token: string, actor: Actor) => {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(ACTOR_KEY, JSON.stringify(actor));
        setState({ isAuthenticated: true, token, actor });
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ACTOR_KEY);
        setState({ isAuthenticated: false, token: null, actor: null });
    }, []);

    return (
        <AuthContext.Provider value={{ ...state, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
