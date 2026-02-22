import {
    Check,
    Contrast,
    LayoutPanelTop,
    Monitor,
    Moon,
    Palette,
    Sun,
} from 'lucide-react';

import { cn } from '../../lib/utils.js';
import { useTheme, type ShellVariant, type Theme, type ThemePreset } from '../../hooks/use-theme.js';
import { Button } from '../ui/button.js';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu.js';

interface AppearanceMenuProps {
    compact?: boolean;
    align?: 'start' | 'center' | 'end';
    className?: string;
}

function ThemeModeIcon({ mode }: { mode: Theme }) {
    if (mode === 'light') return <Sun className="h-4 w-4" />;
    if (mode === 'dark') return <Moon className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
}

function SelectionItem({
    selected,
    icon,
    label,
    description,
    onSelect,
}: {
    selected: boolean;
    icon: React.ReactNode;
    label: string;
    description?: string;
    onSelect: () => void;
}) {
    return (
        <DropdownMenuItem
            onSelect={() => onSelect()}
            className="items-start gap-2.5"
        >
            <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{label}</span>
                    {selected ? (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : null}
                </span>
                {description ? (
                    <span className="block truncate text-xs text-muted-foreground">
                        {description}
                    </span>
                ) : null}
            </span>
        </DropdownMenuItem>
    );
}

export function AppearanceMenu({
    compact = false,
    align = 'end',
    className,
}: AppearanceMenuProps) {
    const {
        theme,
        resolvedTheme,
        setTheme,
        activeTheme,
        setActiveTheme,
        shellVariant,
        setShellVariant,
        themes,
        shellVariants,
    } = useTheme();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size={compact ? 'icon' : 'sm'}
                    className={cn(
                        compact ? 'h-9 w-9' : 'gap-2',
                        className,
                    )}
                    aria-label="Change appearance"
                >
                    <Palette className="h-4 w-4" />
                    {!compact ? (
                        <>
                            <span className="hidden sm:inline">Appearance</span>
                            <span className="text-xs text-muted-foreground">
                                {resolvedTheme === 'dark' ? 'Dark' : 'Light'}
                            </span>
                        </>
                    ) : null}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} className="w-80 max-w-[92vw]">
                <DropdownMenuLabel className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    Appearance
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuGroup>
                    <DropdownMenuLabel className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Mode
                    </DropdownMenuLabel>
                    {([
                        ['system', 'System', 'Follow the device preference'],
                        ['light', 'Light', 'Force light mode'],
                        ['dark', 'Dark', 'Force dark mode'],
                    ] as const).map(([value, label, description]) => (
                        <SelectionItem
                            key={value}
                            selected={theme === value}
                            icon={<ThemeModeIcon mode={value} />}
                            label={label}
                            description={description}
                            onSelect={() => setTheme(value)}
                        />
                    ))}
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                <DropdownMenuGroup>
                    <DropdownMenuLabel className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Template Themes
                    </DropdownMenuLabel>
                    {themes.map((preset) => (
                        <SelectionItem
                            key={preset.value}
                            selected={activeTheme === preset.value}
                            icon={<Palette className="h-4 w-4" />}
                            label={preset.label}
                            description={preset.description}
                            onSelect={() => setActiveTheme(preset.value as ThemePreset)}
                        />
                    ))}
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                <DropdownMenuGroup>
                    <DropdownMenuLabel className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Layout Variants
                    </DropdownMenuLabel>
                    {shellVariants.map((variant) => (
                        <SelectionItem
                            key={variant.value}
                            selected={shellVariant === variant.value}
                            icon={variant.value === 'contrast'
                                ? <Contrast className="h-4 w-4" />
                                : <LayoutPanelTop className="h-4 w-4" />}
                            label={variant.label}
                            description={variant.description}
                            onSelect={() => setShellVariant(variant.value as ShellVariant)}
                        />
                    ))}
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

