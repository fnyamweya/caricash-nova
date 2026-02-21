import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import {
    ArrowRight,
    ChevronLeft,
    Command,
    LogOut,
    Menu,
    Moon,
    Search,
    Sparkles,
    Sun,
} from 'lucide-react';
import {
    Avatar,
    AvatarFallback,
    Badge,
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Input,
    Separator,
    Sheet,
    SheetContent,
    SheetTrigger,
    cn,
    getInitials,
    useIsMobile,
    useTheme,
} from '@caricash/ui';
import type { StaffNavGroup, StaffNavItem } from '../navigation.js';

export interface StaffAppShellProps {
    navigation: StaffNavItem[];
    appName: string;
    user: { name: string; role: string } | null;
    onLogout: () => void;
    children: React.ReactNode;
}

const navGroupOrder: StaffNavGroup[] = ['Core', 'Operations', 'Controls'];

const navGroupLabels: Record<StaffNavGroup, string> = {
    Core: 'Core Modules',
    Operations: 'Operations',
    Controls: 'Risk and Controls',
};

function isActivePath(pathname: string, href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
}

function groupNavigation(navigation: StaffNavItem[]) {
    return navGroupOrder.map((group) => ({
        group,
        items: navigation.filter((item) => item.group === group),
    }));
}

export function StaffAppShell({
    navigation,
    appName,
    user,
    onLogout,
    children,
}: StaffAppShellProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [quickNavTerm, setQuickNavTerm] = useState('');
    const [mobileOpen, setMobileOpen] = useState(false);
    const isMobile = useIsMobile();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const groupedNavigation = useMemo(() => groupNavigation(navigation), [navigation]);
    const activeItem =
        navigation.find((item) => isActivePath(location.pathname, item.href)) ?? navigation[0];
    const quickActions = navigation
        .filter((item) => item.group === activeItem.group && item.href !== activeItem.href)
        .slice(0, 3);
    const quickNavMatches = useMemo(() => {
        const normalized = quickNavTerm.trim().toLowerCase();
        if (!normalized) {
            return [];
        }

        return navigation
            .filter((item) => {
                return (
                    item.label.toLowerCase().includes(normalized) ||
                    item.description.toLowerCase().includes(normalized)
                );
            })
            .slice(0, 6);
    }, [navigation, quickNavTerm]);
    const todayLabel = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(new Date());
    const resolvedTheme =
        theme === 'system'
            ? typeof window !== 'undefined' &&
                window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light'
            : theme;

    function goTo(href: StaffNavItem['href']) {
        void navigate({ to: href });
        setQuickNavTerm('');
        setMobileOpen(false);
    }

    function renderNavigationLinks(options: { compact: boolean }) {
        return groupedNavigation.map(({ group, items }) => {
            if (items.length === 0) {
                return null;
            }

            return (
                <section key={group} className="space-y-2">
                    {!options.compact ? (
                        <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {navGroupLabels[group]}
                        </p>
                    ) : null}
                    <div className="space-y-1">
                        {items.map((item) => {
                            const active = isActivePath(location.pathname, item.href);
                            return (
                                <button
                                    key={item.href}
                                    type="button"
                                    onClick={() => goTo(item.href)}
                                    className={cn(
                                        'group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
                                        active
                                            ? 'border-primary/30 bg-primary/12 text-foreground shadow-sm'
                                            : 'border-transparent text-muted-foreground hover:border-border/65 hover:bg-accent/45 hover:text-foreground',
                                        options.compact && 'justify-center px-2.5',
                                    )}
                                    title={options.compact ? item.label : undefined}
                                >
                                    <span
                                        className={cn(
                                            'shrink-0',
                                            active
                                                ? 'text-primary'
                                                : 'text-muted-foreground group-hover:text-foreground',
                                        )}
                                    >
                                        {item.icon}
                                    </span>
                                    {!options.compact ? (
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold">
                                                {item.label}
                                            </span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {item.description}
                                            </span>
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                </section>
            );
        });
    }

    return (
        <div className="flex h-screen overflow-hidden bg-transparent">
            {!isMobile ? (
                <aside
                    className={cn(
                        'hidden shrink-0 flex-col border-r border-border/70 bg-sidebar/85 backdrop-blur md:flex',
                        collapsed ? 'w-24' : 'w-[320px]',
                    )}
                >
                    <div className={cn('p-4', collapsed ? 'pb-3' : 'pb-4')}>
                        <div
                            className={cn(
                                'flex items-center gap-3 rounded-2xl border border-border/75 bg-card/70 p-3',
                                collapsed && 'justify-center',
                            )}
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            {!collapsed ? (
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">
                                        {appName}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        Staff Operations Workspace
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
                        {renderNavigationLinks({ compact: collapsed })}
                    </div>

                    <div className="space-y-3 border-t border-border/70 p-3">
                        {!collapsed && user ? (
                            <div className="rounded-xl border border-border/70 bg-card/65 p-3">
                                <p className="text-sm font-semibold">{user.name}</p>
                                <p className="text-xs text-muted-foreground">{user.role}</p>
                            </div>
                        ) : null}
                        <Button
                            variant="outline"
                            size="icon"
                            className={cn('h-10', collapsed ? 'w-full' : 'w-full')}
                            onClick={() => setCollapsed((prev) => !prev)}
                            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            <ChevronLeft
                                className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')}
                            />
                        </Button>
                    </div>
                </aside>
            ) : null}

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <header className="relative z-20 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur md:px-6">
                    <div className="flex flex-wrap items-center gap-3">
                        {isMobile ? (
                            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="outline" size="icon">
                                        <Menu className="h-5 w-5" />
                                        <span className="sr-only">Open navigation</span>
                                    </Button>
                                </SheetTrigger>
                                <SheetContent
                                    side="left"
                                    className="w-[92vw] max-w-sm overflow-y-auto p-0"
                                >
                                    <div className="space-y-4 px-4 py-4">
                                        <div>
                                            <p className="text-sm font-semibold">{appName}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Staff Operations Workspace
                                            </p>
                                        </div>
                                        <Separator />
                                        <div className="space-y-4">
                                            {renderNavigationLinks({ compact: false })}
                                        </div>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        ) : null}

                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                                {activeItem.label}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                                {navGroupLabels[activeItem.group]} • {todayLabel}
                            </p>
                        </div>

                        <div className="relative hidden w-full max-w-md lg:block">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={quickNavTerm}
                                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                    setQuickNavTerm(event.target.value)
                                }
                                placeholder="Quick jump to module or function..."
                                className="pl-9"
                                aria-label="Quick navigation"
                            />
                            {quickNavMatches.length > 0 ? (
                                <div className="absolute left-0 right-0 top-[calc(100%+0.45rem)] overflow-hidden rounded-xl border border-border/80 bg-popover/95 shadow-xl">
                                    {quickNavMatches.map((item) => (
                                        <button
                                            key={item.href}
                                            type="button"
                                            onClick={() => goTo(item.href)}
                                            className="flex w-full items-center justify-between gap-3 border-b border-border/50 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent/50"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-semibold">
                                                    {item.label}
                                                </span>
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {item.description}
                                                </span>
                                            </span>
                                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        <Button
                            variant="outline"
                            size="icon"
                            onClick={toggleTheme}
                            aria-label="Toggle theme"
                        >
                            {resolvedTheme === 'dark' ? (
                                <Sun className="h-4 w-4" />
                            ) : (
                                <Moon className="h-4 w-4" />
                            )}
                        </Button>

                        {user ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="relative h-10 w-10 rounded-full"
                                    >
                                        <Avatar className="h-10 w-10">
                                            <AvatarFallback>
                                                {getInitials(user.name)}
                                            </AvatarFallback>
                                        </Avatar>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-64">
                                    <DropdownMenuLabel className="font-normal">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold leading-none">
                                                {user.name}
                                            </p>
                                            <p className="text-xs leading-none text-muted-foreground">
                                                {user.role}
                                            </p>
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem
                                            onClick={() => setQuickNavTerm('')}
                                            className="gap-2"
                                        >
                                            <Command className="h-4 w-4" />
                                            Clear quick navigation
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={onLogout} className="gap-2">
                                        <LogOut className="h-4 w-4" />
                                        Log out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : null}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5 lg:px-8 lg:py-6">
                    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
                        <section className="rounded-2xl border border-border/75 bg-card/70 p-4 shadow-sm backdrop-blur-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                        Active Module
                                    </p>
                                    <h2 className="mt-1 text-lg font-semibold">
                                        {activeItem.label}
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        {activeItem.description}
                                    </p>
                                </div>
                                <Badge variant="outline">{navGroupLabels[activeItem.group]}</Badge>
                            </div>
                            {quickActions.length > 0 ? (
                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        Suggested next:
                                    </span>
                                    {quickActions.map((item) => (
                                        <Button
                                            key={item.href}
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => goTo(item.href)}
                                        >
                                            {item.label}
                                        </Button>
                                    ))}
                                </div>
                            ) : null}
                        </section>

                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
