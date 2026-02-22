import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Avatar,
    AvatarFallback,
    Badge,
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Input,
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    cn,
    getInitials,
    useTheme,
    type NavItem,
} from '@caricash/ui';
import {
    ChevronDown,
    ChevronRight,
    LayoutGrid,
    LogOut,
    Menu,
    Plus,
    ShieldCheck,
    Store,
    Sparkles,
    Building2,
    ArrowRightLeft,
    CreditCard,
    Sun,
    Moon,
    Laptop,
} from 'lucide-react';
import { useMerchantWorkspace } from '../lib/merchant-workspace.js';

export interface MerchantAppShellProps {
    navigation: NavItem[];
    appName: string;
    user: { name: string; role: string } | null;
    onLogout: () => void;
    children: React.ReactNode;
}

function getDayGreeting(date = new Date()): string {
    const hour = date.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

function mobileLabel(label: string): string {
    if (label === 'Dashboard') return 'Home';
    if (label === 'QR Collect') return 'Collect';
    if (label === 'Payments') return 'Payments';
    if (label === 'Transfer & Settle') return 'Move';
    return label;
}

function MerchantUserMenu({ user, onLogout }: { user: MerchantAppShellProps['user']; onLogout: () => void }) {
    if (!user) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-11 rounded-2xl px-2 hover:bg-accent/70">
                    <Avatar className="h-9 w-9 rounded-xl border bg-background/90">
                        <AvatarFallback className="rounded-xl text-xs">{getInitials(user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="hidden text-left sm:block">
                        <p className="text-xs font-semibold leading-tight">{user.name}</p>
                        <p className="text-[11px] leading-tight text-muted-foreground">{user.role}</p>
                    </div>
                    <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-2xl">
                <DropdownMenuLabel className="font-normal">
                    <div className="flex items-center gap-2">
                        <Avatar className="h-10 w-10 rounded-xl border bg-background/90">
                            <AvatarFallback className="rounded-xl text-xs">{getInitials(user.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{user.name}</p>
                            <p className="truncate text-xs text-muted-foreground">Merchant Client Portal</p>
                        </div>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2" disabled>
                    <ShieldCheck className="h-4 w-4" />
                    PCI-conscious merchant workspace
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2" onClick={onLogout}>
                    <LogOut className="h-4 w-4" />
                    Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function ThemeModeMenu({ inverted = false }: { inverted?: boolean }) {
    const { theme, setTheme } = useTheme();

    const options: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode }> = [
        { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
        { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
        { value: 'system', label: 'System', icon: <Laptop className="h-4 w-4" /> },
    ];

    const active = options.find((option) => option.value === theme) ?? options[2];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant={inverted ? 'ghost' : 'outline'}
                    size="sm"
                    className={cn(
                        'rounded-xl gap-2',
                        inverted
                            ? 'text-foreground hover:bg-accent/60 hover:text-foreground'
                            : 'bg-background/70',
                    )}
                >
                    {active.icon}
                    <span className="hidden sm:inline">{active.label}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className={cn(
                    'w-44 rounded-2xl',
                    inverted && 'border-border/70 bg-popover/95 text-popover-foreground',
                )}
            >
                <DropdownMenuLabel className={cn(inverted && 'text-muted-foreground')}>
                    Theme Mode
                </DropdownMenuLabel>
                <DropdownMenuSeparator className={cn(inverted && 'bg-border/60')} />
                {options.map((option) => (
                    <DropdownMenuItem
                        key={option.value}
                        className={cn(
                            'gap-2 rounded-xl',
                            inverted && 'focus:bg-accent/70 focus:text-foreground',
                        )}
                        onClick={() => setTheme(option.value)}
                    >
                        {option.icon}
                        <span>{option.label}</span>
                        {theme === option.value ? (
                            <span className="ml-auto text-xs text-muted-foreground">
                                Active
                            </span>
                        ) : null}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function StoreSwitcher({ compact = false }: { compact?: boolean }) {
    const { stores, activeStore, activeStoreCode, setActiveStoreCode, storesQuery } = useMerchantWorkspace();
    const [open, setOpen] = useState(false);
    const [draftCode, setDraftCode] = useState('');

    return (
        <>
            <div className={cn(
                'rounded-2xl border border-border/70 bg-background/40 p-2',
                compact && 'border-border/60 bg-background/80',
            )}
            >
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.12em]', compact ? 'text-muted-foreground' : 'text-muted-foreground')}>
                        Active Store
                    </p>
                    <Badge variant="outline" className={cn('rounded-full text-[10px]', compact ? 'bg-background/80' : 'border-border/60 bg-background/70')}>
                        {storesQuery.isFetching ? 'Syncing…' : `${stores.length || 0} stores`}
                    </Badge>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition-colors',
                        compact ? 'hover:bg-accent/50' : 'hover:bg-accent/40',
                    )}
                >
                    <div className="min-w-0 flex items-center gap-2">
                        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', compact ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                            <Store className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                            <span className={cn('block truncate text-sm font-semibold', compact ? 'text-foreground' : 'text-foreground')}>
                                {activeStore?.name ?? 'Select a store'}
                            </span>
                            <span className={cn('block truncate text-xs', compact ? 'text-muted-foreground' : 'text-muted-foreground')}>
                                {activeStoreCode || 'No store selected'}
                            </span>
                        </span>
                    </div>
                    <ChevronRight className={cn('h-4 w-4 shrink-0', compact ? 'text-muted-foreground' : 'text-muted-foreground')} />
                </button>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="rounded-3xl sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Switch Store Workspace</DialogTitle>
                        <DialogDescription>
                            Pick the store you want to collect for, manage team access, or move funds from.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid gap-2">
                            {stores.length > 0 ? stores.map((store) => {
                                const active = store.store_code === activeStoreCode;
                                return (
                                    <motion.button
                                        key={store.store_code}
                                        type="button"
                                        whileTap={{ scale: 0.99 }}
                                        onClick={() => {
                                            setActiveStoreCode(store.store_code);
                                            setOpen(false);
                                        }}
                                        className={cn(
                                            'flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-colors',
                                            active
                                                ? 'border-primary/25 bg-primary/10'
                                                : 'border-border/70 hover:bg-accent/40',
                                        )}
                                    >
                                        <div className="min-w-0 flex items-center gap-3">
                                            <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', active ? 'bg-primary/10 text-primary' : 'bg-muted')}>
                                                <Building2 className="h-4 w-4" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold">{store.name}</p>
                                                <p className="truncate text-xs text-muted-foreground">{store.store_code}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant={active ? 'default' : 'outline'} className={cn(active ? 'bg-primary text-primary-foreground hover:bg-primary/90' : '', 'rounded-full')}>
                                                {active ? 'Active' : (store.state ?? 'Store')}
                                            </Badge>
                                            <Badge variant="outline" className="rounded-full">{store.kyc_state ?? 'KYC'}</Badge>
                                        </div>
                                    </motion.button>
                                );
                            }) : (
                                <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                                    No stores found yet. You can add a branch from Settings.
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Quick store code access</p>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Input
                                    placeholder="Enter store code"
                                    value={draftCode}
                                    onChange={(e) => setDraftCode(e.target.value.toUpperCase())}
                                    className="h-10"
                                />
                                <Button
                                    type="button"
                                    className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                                    onClick={() => {
                                        const code = draftCode.trim();
                                        if (!code) return;
                                        setActiveStoreCode(code);
                                        setOpen(false);
                                    }}
                                >
                                    <Plus className="h-4 w-4" />
                                    Use code
                                </Button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline" className="rounded-xl">Close</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export function MerchantAppShell({
    navigation,
    appName,
    user,
    onLogout,
    children,
}: MerchantAppShellProps) {
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const activeItem = navigation.find((item) => item.active) ?? navigation[0];
    const greeting = useMemo(() => getDayGreeting(), []);
    const brandLabel = appName.replace(/\s+Merchant\s+Console$/i, '') || 'CariCash';

    function goTo(href: string) {
        void navigate({ to: href });
        setMobileMenuOpen(false);
    }

    return (
        <div className="relative min-h-svh overflow-x-clip bg-background text-foreground">
            <div className="relative z-10 mx-auto max-w-[1700px] p-2 sm:p-3 md:p-4">
                <div className="grid gap-3 md:grid-cols-[6.2rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)]">
                    <aside className="relative hidden min-h-[calc(100svh-2rem)] overflow-hidden rounded-[30px] border border-border/70 bg-card text-card-foreground shadow-[0_28px_70px_-35px_rgba(15,23,42,0.35)] md:flex md:flex-col md:justify-between md:p-3 xl:p-4">
                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute left-0 top-8 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />
                            <div className="absolute bottom-6 right-0 h-48 w-48 rounded-full bg-accent/60 blur-3xl" />
                        </div>

                        <div className="relative space-y-4">
                            <button
                                type="button"
                                onClick={() => goTo('/dashboard')}
                                className="flex w-full items-center gap-2 rounded-2xl border border-border/70 bg-background/30 px-3 py-2 text-left hover:bg-accent/40"
                            >
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted shadow-inner">
                                    <LayoutGrid className="h-5 w-5" />
                                </div>
                                <div className="hidden min-w-0 xl:block">
                                    <p className="truncate text-sm font-semibold">{brandLabel}</p>
                                    <p className="truncate text-xs text-muted-foreground">Merchant Client Portal</p>
                                </div>
                            </button>

                            <div className="hidden rounded-2xl border border-border/70 bg-background/30 p-3 xl:block">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{greeting}</p>
                                <p className="mt-1 text-sm font-semibold leading-tight">Welcome back{user?.name ? `, ${user.name}` : ''}</p>
                                <p className="mt-2 text-xs text-muted-foreground">Collect faster, settle smarter, and manage every store from one workspace.</p>
                            </div>

                            <StoreSwitcher />

                            <nav className="space-y-1.5">
                                {navigation.map((item) => (
                                    <button
                                        key={item.href}
                                        type="button"
                                        onClick={() => goTo(item.href)}
                                        className={cn(
                                            'group flex w-full items-center gap-2 rounded-2xl px-2 py-2 text-left transition-all duration-150 xl:px-3',
                                            item.active
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                                        )}
                                        aria-current={item.active ? 'page' : undefined}
                                        title={item.label}
                                    >
                                        <span className={cn(
                                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                                            item.active ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-muted text-foreground/80',
                                        )}>
                                            {item.icon}
                                        </span>
                                        <span className="hidden min-w-0 flex-1 truncate text-sm font-medium xl:block">{item.label}</span>
                                        <ChevronRight className={cn('hidden h-4 w-4 xl:block', item.active ? 'text-primary-foreground/80' : 'text-muted-foreground')} />
                                    </button>
                                ))}
                            </nav>
                        </div>

                        <div className="relative space-y-3">
                            <div className="hidden rounded-2xl border border-border/70 bg-background/30 p-3 xl:block">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold">Operations Pulse</p>
                                    <Sparkles className="h-4 w-4 text-primary" />
                                </div>
                                <div className="space-y-2 text-xs text-muted-foreground">
                                    <div className="flex items-center justify-between gap-2 rounded-xl bg-background/40 px-2 py-2">
                                        <span className="inline-flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Collections</span>
                                        <span>Live</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 rounded-xl bg-background/40 px-2 py-2">
                                        <span className="inline-flex items-center gap-1"><ArrowRightLeft className="h-3.5 w-3.5" /> Transfers</span>
                                        <span>Ready</span>
                                    </div>
                                </div>
                            </div>

                            <div className="hidden items-center justify-between rounded-2xl border border-border/70 bg-background/30 px-3 py-2 text-xs text-muted-foreground xl:flex">
                                <span>{user?.role ?? 'Merchant'}</span>
                                <ThemeModeMenu inverted />
                            </div>
                        </div>
                    </aside>

                    <div className="flex min-w-0 flex-col gap-3 md:gap-4">
                        <header className="sticky top-2 z-30 rounded-[26px] border border-border/70 bg-background/85 px-3 py-3 shadow-[0_22px_45px_-35px_rgba(15,23,42,0.22)] backdrop-blur-xl sm:px-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-10 w-10 rounded-xl md:hidden"
                                        onClick={() => setMobileMenuOpen(true)}
                                        aria-label="Open merchant menu"
                                    >
                                        <Menu className="h-5 w-5" />
                                    </Button>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{greeting}</p>
                                        <p className="truncate text-sm font-semibold sm:text-base">{user?.name ? `Welcome back, ${user.name}` : 'Welcome back'}</p>
                                        <p className="truncate text-xs text-muted-foreground">{activeItem?.label ?? 'Merchant Workspace'} • fluid collection and settlement operations</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <ThemeModeMenu />
                                    <MerchantUserMenu user={user} onLogout={onLogout} />
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Badge className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-primary hover:bg-primary/10">Collections Ready</Badge>
                                <Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1">Multi-store workspace</Badge>
                                <Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1">Responsive merchant UI</Badge>
                            </div>
                        </header>

                        <main className="min-w-0 pb-24 md:pb-4">
                            <motion.div
                                key={activeItem?.href}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-4 md:space-y-5"
                            >
                                {children}
                            </motion.div>
                        </main>
                    </div>
                </div>
            </div>

            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-background to-transparent md:hidden" />
            <nav className="fixed inset-x-3 bottom-3 z-40 rounded-3xl border border-border/70 bg-background/90 p-2 shadow-[0_24px_50px_-38px_rgba(15,23,42,0.28)] backdrop-blur-xl md:hidden">
                <div className="grid grid-cols-5 gap-1">
                    {navigation.slice(0, 5).map((item) => (
                        <button
                            key={item.href}
                            type="button"
                            onClick={() => goTo(item.href)}
                            className={cn(
                                'relative flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-medium transition-colors',
                                item.active ? 'text-primary' : 'text-muted-foreground',
                            )}
                        >
                            <AnimatePresence>
                                {item.active ? (
                                    <motion.span
                                        layoutId="merchant-bottom-nav"
                                        className="absolute inset-0 rounded-2xl bg-primary/10"
                                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                                    />
                                ) : null}
                            </AnimatePresence>
                            <span className="relative">{item.icon}</span>
                            <span className="relative truncate">{mobileLabel(item.label)}</span>
                        </button>
                    ))}
                </div>
            </nav>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetContent side="left" className="w-[90vw] max-w-sm border-r border-border bg-background p-0 text-foreground">
                    <SheetHeader className="border-b border-border p-5 text-left">
                        <SheetTitle>{brandLabel} Merchant</SheetTitle>
                        <SheetDescription>
                            Switch stores quickly, collect faster, and manage your operation on the go.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="flex h-full flex-col justify-between gap-4 p-4">
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-border/70 bg-card/70 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{greeting}</p>
                                <p className="mt-1 text-sm font-semibold">{user?.name ? `Welcome back, ${user.name}` : 'Merchant Workspace'}</p>
                            </div>

                            <StoreSwitcher />

                            <nav className="space-y-1.5">
                                {navigation.map((item) => (
                                    <button
                                        key={item.href}
                                        type="button"
                                        onClick={() => goTo(item.href)}
                                        className={cn(
                                            'flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left',
                                            item.active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent/50',
                                        )}
                                    >
                                        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', item.active ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-muted text-foreground/80')}>
                                            {item.icon}
                                        </span>
                                        <span className="flex-1 truncate text-sm font-medium">{item.label}</span>
                                        <ChevronRight className={cn('h-4 w-4', item.active ? 'text-primary-foreground/80' : 'text-muted-foreground')} />
                                    </button>
                                ))}
                            </nav>
                        </div>

                        <div className="rounded-2xl border border-border/70 bg-card/70 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold">Theme mode</p>
                                    <p className="text-xs text-muted-foreground">Choose light, dark, or system.</p>
                                </div>
                                <ThemeModeMenu inverted />
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                className="mt-3 w-full rounded-xl border-0 bg-primary text-primary-foreground hover:bg-primary/90"
                                onClick={() => {
                                    setMobileMenuOpen(false);
                                    onLogout();
                                }}
                            >
                                <LogOut className="h-4 w-4" />
                                Log out
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
