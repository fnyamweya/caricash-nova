import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type ThemePreset =
    | 'claude'
    | 'neobrutualism'
    | 'supabase'
    | 'vercel'
    | 'mono'
    | 'notebook';
export type ShellVariant = 'workspace' | 'framed' | 'compact' | 'contrast';

export interface ThemePresetOption {
    value: ThemePreset;
    label: string;
    description: string;
}

export interface ShellVariantOption {
    value: ShellVariant;
    label: string;
    description: string;
}

export const THEME_PRESETS: ThemePresetOption[] = [
    {
        value: 'claude',
        label: 'Claude',
        description: 'Soft neutral UI with warm editorial tones',
    },
    {
        value: 'neobrutualism',
        label: 'Neobrutualism',
        description: 'Bold borders, hard contrast, playful emphasis',
    },
    {
        value: 'supabase',
        label: 'Supabase',
        description: 'Emerald product styling with clean developer surfaces',
    },
    {
        value: 'vercel',
        label: 'Vercel',
        description: 'Minimal monochrome product dashboard aesthetic',
    },
    {
        value: 'mono',
        label: 'Mono',
        description: 'Monospaced operator-console visual language',
    },
    {
        value: 'notebook',
        label: 'Notebook',
        description: 'Sketchbook-inspired dashboard theme with paper tone',
    },
];

export const SHELL_VARIANTS: ShellVariantOption[] = [
    {
        value: 'workspace',
        label: 'Workspace',
        description: 'Balanced spacing with soft glass panels',
    },
    {
        value: 'framed',
        label: 'Framed',
        description: 'Heavier panel treatment and elevated surfaces',
    },
    {
        value: 'compact',
        label: 'Compact',
        description: 'Dense layout for transaction-heavy workflows',
    },
    {
        value: 'contrast',
        label: 'Contrast',
        description: 'Sharper outlines and stronger visual separation',
    },
];

interface ThemeContextValue {
    theme: Theme;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: Theme) => void;
    toggleTheme: (origin?: { clientX?: number; clientY?: number } | null) => void;
    activeTheme: ThemePreset;
    setActiveTheme: (theme: ThemePreset) => void;
    shellVariant: ShellVariant;
    setShellVariant: (variant: ShellVariant) => void;
    themes: ThemePresetOption[];
    shellVariants: ShellVariantOption[];
}

interface ThemeProviderProps {
    children: ReactNode;
    defaultTheme?: Theme;
    defaultActiveTheme?: ThemePreset;
    defaultShellVariant?: ShellVariant;
    storageKeyPrefix?: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
    if (typeof window === 'undefined') {
        return 'light';
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
}

function isThemeMode(value: string | null): value is Theme {
    return value === 'light' || value === 'dark' || value === 'system';
}

function isThemePreset(value: string | null): value is ThemePreset {
    return THEME_PRESETS.some((theme) => theme.value === value);
}

function isShellVariant(value: string | null): value is ShellVariant {
    return SHELL_VARIANTS.some((variant) => variant.value === value);
}

function runWithOptionalViewTransition(
    origin: { clientX?: number; clientY?: number } | null | undefined,
    callback: () => void,
) {
    if (typeof document === 'undefined') {
        callback();
        return;
    }

    const root = document.documentElement;
    if (typeof origin?.clientX === 'number' && typeof origin?.clientY === 'number') {
        root.style.setProperty('--x', `${origin.clientX}px`);
        root.style.setProperty('--y', `${origin.clientY}px`);
    }

    const doc = document as Document & {
        startViewTransition?: (update: () => void) => unknown;
    };

    if (typeof doc.startViewTransition === 'function') {
        doc.startViewTransition(() => {
            callback();
        });
        return;
    }

    callback();
}

export function ThemeProvider({
    children,
    defaultTheme = 'system',
    defaultActiveTheme = 'vercel',
    defaultShellVariant = 'workspace',
    storageKeyPrefix = 'caricash',
}: ThemeProviderProps) {
    const modeKey = `${storageKeyPrefix}_theme_mode`;
    const presetKey = `${storageKeyPrefix}_theme_preset`;
    const shellKey = `${storageKeyPrefix}_shell_variant`;

    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window === 'undefined') {
            return defaultTheme;
        }
        const stored = localStorage.getItem(modeKey);
        return isThemeMode(stored) ? stored : defaultTheme;
    });
    const [activeTheme, setActiveThemeState] = useState<ThemePreset>(() => {
        if (typeof window === 'undefined') {
            return defaultActiveTheme;
        }
        const stored = localStorage.getItem(presetKey);
        return isThemePreset(stored) ? stored : defaultActiveTheme;
    });
    const [shellVariant, setShellVariantState] = useState<ShellVariant>(() => {
        if (typeof window === 'undefined') {
            return defaultShellVariant;
        }
        const stored = localStorage.getItem(shellKey);
        return isShellVariant(stored) ? stored : defaultShellVariant;
    });
    const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
        getSystemTheme(),
    );

    const resolvedTheme: ResolvedTheme =
        theme === 'system' ? systemTheme : theme;

    const setTheme = useCallback(
        (nextTheme: Theme) => {
            setThemeState(nextTheme);
            if (typeof window !== 'undefined') {
                localStorage.setItem(modeKey, nextTheme);
            }
        },
        [modeKey],
    );

    const setActiveTheme = useCallback(
        (nextTheme: ThemePreset) => {
            setActiveThemeState(nextTheme);
            if (typeof window !== 'undefined') {
                localStorage.setItem(presetKey, nextTheme);
            }
        },
        [presetKey],
    );

    const setShellVariant = useCallback(
        (nextVariant: ShellVariant) => {
            setShellVariantState(nextVariant);
            if (typeof window !== 'undefined') {
                localStorage.setItem(shellKey, nextVariant);
            }
        },
        [shellKey],
    );

    const toggleTheme = useCallback(
        (origin?: { clientX?: number; clientY?: number } | null) => {
            runWithOptionalViewTransition(origin, () => {
                setThemeState((current) => {
                    const currentResolved =
                        current === 'system' ? getSystemTheme() : current;
                    const next = currentResolved === 'dark' ? 'light' : 'dark';
                    if (typeof window !== 'undefined') {
                        localStorage.setItem(modeKey, next);
                    }
                    return next;
                });
            });
        },
        [modeKey],
    );

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => setSystemTheme(mql.matches ? 'dark' : 'light');
        onChange();
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }

        const root = document.documentElement;
        root.classList.toggle('dark', resolvedTheme === 'dark');
        root.setAttribute('data-theme', activeTheme);
        root.setAttribute('data-shell-variant', shellVariant);
    }, [activeTheme, resolvedTheme, shellVariant]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const onStorage = (event: StorageEvent) => {
            if (event.storageArea !== localStorage) {
                return;
            }

            if (event.key === modeKey && isThemeMode(event.newValue)) {
                setThemeState(event.newValue);
            }
            if (event.key === presetKey && isThemePreset(event.newValue)) {
                setActiveThemeState(event.newValue);
            }
            if (event.key === shellKey && isShellVariant(event.newValue)) {
                setShellVariantState(event.newValue);
            }
        };

        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [modeKey, presetKey, shellKey]);

    const value = useMemo<ThemeContextValue>(
        () => ({
            theme,
            resolvedTheme,
            setTheme,
            toggleTheme,
            activeTheme,
            setActiveTheme,
            shellVariant,
            setShellVariant,
            themes: THEME_PRESETS,
            shellVariants: SHELL_VARIANTS,
        }),
        [
            activeTheme,
            resolvedTheme,
            setActiveTheme,
            setShellVariant,
            setTheme,
            shellVariant,
            theme,
            toggleTheme,
        ],
    );

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

