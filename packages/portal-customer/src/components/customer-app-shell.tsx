import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
    Bell,
    ChevronRight,
    Menu,
    LogOut,
    ShieldCheck,
    Sparkles,
    Wallet,
    SendHorizontal,
    ShoppingBag,
} from 'lucide-react';
import {
    AppearanceMenu,
    Avatar,
    AvatarFallback,
    Badge,
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    cn,
    getInitials,
    type NavItem,
} from '@caricash/ui';

export interface CustomerAppShellProps {
    navigation: NavItem[];
    appName: string;
    user: { name: string; role: string } | null;
    onLogout: () => void;
    children: React.ReactNode;
}

function mobileLabel(label: string): string {
    if (label === 'Dashboard') return 'Home';
    if (label === 'Send Money') return 'Send';
    if (label === 'Pay Merchant') return 'Pay';
    if (label === 'History') return 'Activity';
    if (label === 'Settings') return 'Settings';
    return label;
}

function getDayGreeting(date = new Date()): string {
    const hour = date.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

function getCustomerName(rawName?: string | null): { firstName: string; lastName: string } {
    const normalized = rawName?.trim() ?? '';
    if (!normalized) {
        return { firstName: 'Customer', lastName: '' };
    }

    // If the auth payload only contains a phone number, keep the greeting friendly.
    if (!/[A-Za-z]/.test(normalized)) {
        return { firstName: 'Customer', lastName: '' };
    }

    const parts = normalized.split(/\s+/).filter(Boolean);
    return {
        firstName: parts[0] ?? 'Customer',
        lastName: parts.slice(1).join(' '),
    };
}

function CustomerUserMenu({
    user,
    onLogout,
}: {
    user: { name: string; role: string } | null;
    onLogout: () => void;
}) {
    if (!user) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    className="h-10 rounded-xl px-2 hover:bg-accent/70"
                >
                    <Avatar className="h-8 w-8 rounded-xl border bg-background/70">
                        <AvatarFallback className="rounded-xl text-xs">
                            {getInitials(user.name)}
                        </AvatarFallback>
                    </Avatar>
                    <span className="hidden text-left sm:block">
                        <span className="block text-xs font-semibold leading-tight">
                            {user.name}
                        </span>
                        <span className="text-muted-foreground block text-[11px] leading-tight">
                            {user.role}
                        </span>
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl">
                <DropdownMenuLabel className="font-normal">
                    <div className="flex items-center gap-2">
                        <Avatar className="h-9 w-9 rounded-xl border bg-background/70">
                            <AvatarFallback className="rounded-xl text-xs">
                                {getInitials(user.name)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{user.name}</p>
                            <p className="text-muted-foreground truncate text-xs">
                                Customer Wallet
                            </p>
                        </div>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2" disabled>
                    <ShieldCheck className="h-4 w-4" />
                    Secure Wallet Experience
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="gap-2">
                    <LogOut className="h-4 w-4" />
                    Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function CustomerAppShell({
    navigation,
    appName,
    user,
    onLogout,
    children,
}: CustomerAppShellProps) {
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const activeItem = navigation.find((item) => item.active) ?? navigation[0];
    const greeting = useMemo(() => getDayGreeting(), []);
    const customerName = useMemo(() => getCustomerName(user?.name), [user?.name]);
    const welcomeLine = `Welcome ${customerName.firstName}${customerName.lastName ? ` ${customerName.lastName}` : ''}`;
    const brandLabel = appName.replace(/\s+Customer$/i, '') || 'CariCash';

    function goTo(href: string) {
        void navigate({ to: href });
    }

    return (
        <div className="relative min-h-svh overflow-x-clip bg-[color-mix(in_oklab,var(--background)_96%,#f3efe4)] text-foreground">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-20 left-[4%] h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute top-12 right-[5%] h-80 w-80 rounded-full bg-chart-2/16 blur-3xl" />
                <div className="absolute bottom-8 left-[35%] h-72 w-72 rounded-full bg-chart-3/14 blur-3xl" />
                <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/8 via-transparent to-transparent" />
            </div>

            <div className="relative z-10 mx-auto max-w-[1600px] p-2 sm:p-3 md:p-4">
                <div className="grid gap-3 md:grid-cols-[5.25rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)]">
                    <aside className="relative hidden overflow-hidden rounded-[28px] border border-white/20 bg-gradient-to-b from-[color-mix(in_oklab,var(--primary)_92%,black)] via-[color-mix(in_oklab,var(--primary)_78%,#0d3b2f)] to-[color-mix(in_oklab,var(--primary)_70%,#0b2f26)] text-primary-foreground shadow-[0_24px_60px_-36px_rgba(3,17,12,0.8)] md:flex md:min-h-[calc(100svh-2rem)] md:flex-col md:justify-between md:p-3 xl:p-4">
                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute -left-16 top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                            <div className="absolute bottom-10 right-0 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
                        </div>

                        <div className="relative space-y-4">
                            <button
                                type="button"
                                onClick={() => goTo('/dashboard')}
                                className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10"
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                                    <Wallet className="h-5 w-5" />
                                </div>
                                <div className="hidden min-w-0 xl:block">
                                    <p className="truncate text-sm font-semibold">{brandLabel}</p>
                                    <p className="truncate text-xs text-white/70">Customer Wallet</p>
                                </div>
                            </button>

                            <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-3 xl:block">
                                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-white/70">
                                    {greeting}
                                </p>
                                <p className="mt-1 text-sm font-semibold leading-tight">
                                    {welcomeLine}
                                </p>
                                <p className="mt-2 text-xs text-white/70">
                                    Everything you need for sending, paying, and tracking money.
                                </p>
                            </div>

                            <nav className="space-y-1.5">
                                {navigation.map((item) => (
                                    <button
                                        key={item.href}
                                        type="button"
                                        onClick={() => goTo(item.href)}
                                        className={cn(
                                            'group flex w-full items-center gap-2 rounded-2xl px-2 py-2 text-left text-sm transition-all duration-200 xl:px-3',
                                            item.active
                                                ? 'bg-white text-emerald-950 shadow-sm'
                                                : 'text-white/80 hover:bg-white/10 hover:text-white',
                                        )}
                                        aria-current={item.active ? 'page' : undefined}
                                        title={item.label}
                                    >
                                        <span
                                            className={cn(
                                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                                                item.active ? 'bg-emerald-100 text-emerald-800' : 'bg-white/5 text-white/90',
                                            )}
                                        >
                                            {item.icon}
                                        </span>
                                        <span className="hidden min-w-0 flex-1 truncate font-medium xl:block">
                                            {mobileLabel(item.label)}
                                        </span>
                                        <ChevronRight
                                            className={cn(
                                                'hidden h-4 w-4 shrink-0 xl:block',
                                                item.active ? 'text-emerald-700' : 'text-white/40',
                                            )}
                                        />
                                    </button>
                                ))}
                            </nav>
                        </div>

                        <div className="relative space-y-3">
                            <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-3 xl:block">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold">Complete profile</p>
                                    <Badge className="bg-white/10 text-white hover:bg-white/10">85%</Badge>
                                </div>
                                <p className="text-xs text-white/70">
                                    Finish KYC in Settings to unlock smoother limits and fewer payment checks.
                                </p>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="mt-3 w-full rounded-xl border-0 bg-white text-emerald-950 hover:bg-white/90"
                                    onClick={() => goTo('/settings')}
                                >
                                    <ShieldCheck className="h-4 w-4" />
                                    Verify Identity
                                </Button>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-2.5">
                                <div className="flex items-center gap-2">
                                    <Avatar className="h-10 w-10 rounded-xl border border-white/10 bg-white/10">
                                        <AvatarFallback className="rounded-xl bg-transparent text-xs text-white">
                                            {getInitials(user?.name ?? 'CU')}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="hidden min-w-0 flex-1 xl:block">
                                        <p className="truncate text-sm font-semibold">{user?.name ?? 'Customer'}</p>
                                        <p className="truncate text-xs text-white/70">Secure wallet session</p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 rounded-xl text-white hover:bg-white/10 hover:text-white"
                                        onClick={onLogout}
                                        title="Log out"
                                    >
                                        <LogOut className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="mt-2 hidden xl:flex items-center justify-between gap-2">
                                    <AppearanceMenu compact />
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="rounded-xl text-white hover:bg-white/10 hover:text-white"
                                        onClick={() => goTo('/settings')}
                                    >
                                        Settings
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </aside>

                    <div className="min-w-0 rounded-[28px] border border-border/70 bg-background/86 shadow-[0_28px_68px_-42px_color-mix(in_oklab,var(--foreground)_30%,transparent)] backdrop-blur-xl">
                        <header className="sticky top-0 z-30 rounded-t-[28px] border-b border-border/60 bg-background/78 px-3 py-3 backdrop-blur-xl sm:px-4 sm:py-4 lg:px-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 md:hidden">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 rounded-xl border-border/70 bg-background/80"
                                            onClick={() => setMobileMenuOpen(true)}
                                        >
                                            <Menu className="h-4 w-4" />
                                        </Button>
                                        <Badge variant="outline" className="rounded-xl">
                                            {activeItem?.label ?? 'Wallet'}
                                        </Badge>
                                    </div>
                                    <div className="mt-0 md:mt-0">
                                        <p className="truncate text-sm font-semibold text-primary">
                                            {greeting}
                                        </p>
                                        <p className="truncate text-sm font-medium sm:text-base">
                                            {welcomeLine}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="hidden h-9 w-9 rounded-xl border-border/70 md:inline-flex"
                                        title="Notifications"
                                    >
                                        <Bell className="h-4 w-4" />
                                    </Button>
                                    <div className="hidden sm:block md:hidden">
                                        <AppearanceMenu compact />
                                    </div>
                                    <div className="hidden md:block">
                                        <AppearanceMenu compact />
                                    </div>
                                    <CustomerUserMenu user={user} onLogout={onLogout} />
                                </div>
                            </div>

                            <div className="mt-3 hidden items-center gap-2 md:flex">
                                <Badge variant="outline" className="rounded-xl">
                                    {activeItem?.label ?? 'Wallet'}
                                </Badge>
                                <Badge variant="outline" className="rounded-xl inline-flex items-center gap-1">
                                    <ShieldCheck className="h-3 w-3 text-primary" />
                                    Secure session
                                </Badge>
                                <Badge variant="outline" className="rounded-xl">
                                    Mobile-friendly
                                </Badge>
                            </div>

                            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:hidden">
                                {navigation.map((item) => (
                                    <button
                                        key={item.href}
                                        type="button"
                                        onClick={() => goTo(item.href)}
                                        className={cn(
                                            'inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors',
                                            item.active
                                                ? 'border-primary/25 bg-primary/10 text-foreground'
                                                : 'border-border/70 bg-background/70 text-muted-foreground',
                                        )}
                                    >
                                        <span className={cn(item.active ? 'text-primary' : '')}>
                                            {item.icon}
                                        </span>
                                        {mobileLabel(item.label)}
                                    </button>
                                ))}
                            </div>
                        </header>

                        <main className="relative px-3 pb-[calc(env(safe-area-inset-bottom)+6.75rem)] pt-4 sm:px-4 sm:pt-5 md:px-5 md:pb-8 lg:px-6 lg:pt-6">
                            <div className="mx-auto max-w-[1280px] space-y-5 sm:space-y-6">
                                {children}
                            </div>
                        </main>
                    </div>
                </div>
            </div>

            <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:hidden">
                <div className="mx-auto max-w-lg rounded-3xl border border-border/70 bg-background/88 p-1.5 shadow-[0_22px_54px_-30px_color-mix(in_oklab,var(--foreground)_40%,transparent)] backdrop-blur-xl">
                    <div className="grid grid-cols-5 gap-1">
                        {navigation.map((item) => {
                            const isPrimaryPayAction = item.href === '/pay';
                            return (
                                <button
                                    key={item.href}
                                    type="button"
                                    onClick={() => goTo(item.href)}
                                    className={cn(
                                        'group relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-medium transition-all duration-200 active:scale-[0.98]',
                                        isPrimaryPayAction &&
                                            'mx-0.5 rounded-2xl border border-primary/25 bg-primary/10 shadow-[0_10px_24px_-16px_color-mix(in_oklab,var(--primary)_80%,black)]',
                                        item.active
                                            ? (isPrimaryPayAction ? 'text-primary' : 'text-foreground')
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                    aria-current={item.active ? 'page' : undefined}
                                    title={item.label}
                                >
                                    {item.active && !isPrimaryPayAction ? (
                                        <span className="absolute inset-0 rounded-2xl bg-primary/12 ring-1 ring-primary/20" />
                                    ) : null}
                                    {item.active && isPrimaryPayAction ? (
                                        <span className="absolute inset-0 rounded-2xl bg-primary/12 ring-1 ring-primary/30" />
                                    ) : null}
                                    <span
                                        className={cn(
                                            'relative z-10',
                                            item.active ? 'text-primary' : 'group-hover:text-foreground',
                                        )}
                                    >
                                        {item.icon}
                                    </span>
                                    <span className="relative z-10 leading-none">
                                        {mobileLabel(item.label)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </nav>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetContent side="left" className="w-[88vw] max-w-sm border-border/70 bg-background/95 px-0">
                    <div className="flex h-full flex-col">
                        <SheetHeader className="px-4 pt-4 text-left">
                            <SheetTitle className="flex items-center gap-2 text-base">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <Wallet className="h-4 w-4" />
                                </div>
                                {brandLabel}
                            </SheetTitle>
                            <SheetDescription className="text-left">
                                Consumer wallet navigation and quick actions.
                            </SheetDescription>
                        </SheetHeader>

                        <div className="px-4 pt-4">
                            <div className="rounded-2xl border border-border/70 bg-primary/5 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
                                    {greeting}
                                </p>
                                <p className="mt-1 text-sm font-semibold">{welcomeLine}</p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Tap a section below or use quick actions to move money fast.
                                </p>
                            </div>
                        </div>

                        <nav className="flex-1 space-y-2 px-4 py-4">
                            {navigation.map((item) => (
                                <button
                                    key={item.href}
                                    type="button"
                                    onClick={() => {
                                        setMobileMenuOpen(false);
                                        goTo(item.href);
                                    }}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors',
                                        item.active
                                            ? 'border-primary/20 bg-primary/10'
                                            : 'border-border/70 bg-background/70 hover:bg-muted/30',
                                    )}
                                >
                                    <span className={cn(
                                        'flex h-9 w-9 items-center justify-center rounded-xl',
                                        item.active ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted-foreground',
                                    )}>
                                        {item.icon}
                                    </span>
                                    <span className="flex-1 text-sm font-medium">
                                        {mobileLabel(item.label)}
                                    </span>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </button>
                            ))}

                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <Button
                                    type="button"
                                    className="rounded-xl"
                                    onClick={() => {
                                        setMobileMenuOpen(false);
                                        goTo('/send');
                                    }}
                                >
                                    <SendHorizontal className="h-4 w-4" />
                                    Send
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-xl border-primary/20 bg-primary/5"
                                    onClick={() => {
                                        setMobileMenuOpen(false);
                                        goTo('/pay');
                                    }}
                                >
                                    <ShoppingBag className="h-4 w-4 text-primary" />
                                    Pay
                                </Button>
                            </div>
                        </nav>

                        <div className="space-y-3 border-t border-border/70 px-4 py-4">
                            <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-3 py-2.5">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">{user?.name ?? 'Customer'}</p>
                                    <p className="truncate text-xs text-muted-foreground">Secure wallet session</p>
                                </div>
                                <Avatar className="h-9 w-9 rounded-xl border bg-background">
                                    <AvatarFallback className="rounded-xl text-xs">
                                        {getInitials(user?.name ?? 'CU')}
                                    </AvatarFallback>
                                </Avatar>
                            </div>
                            <div className="flex items-center gap-2">
                                <AppearanceMenu compact />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1 rounded-xl"
                                    onClick={() => {
                                        setMobileMenuOpen(false);
                                        goTo('/settings');
                                    }}
                                >
                                    <ShieldCheck className="h-4 w-4" />
                                    Settings
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-10 w-10 rounded-xl"
                                    onClick={onLogout}
                                >
                                    <LogOut className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
