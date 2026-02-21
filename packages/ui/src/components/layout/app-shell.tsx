import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Menu,
    Sun,
    Moon,
    LogOut,
    ChevronLeft,
    Sparkles,
    CalendarDays,
} from 'lucide-react';

import { cn, getInitials } from '../../lib/utils.js';
import { useIsMobile } from '../../hooks/use-mobile.js';
import { useTheme } from '../../hooks/use-theme.js';
import { Avatar, AvatarFallback } from '../ui/avatar.js';
import { Button } from '../ui/button.js';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet.js';
import { Badge } from '../ui/badge.js';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '../ui/dropdown-menu.js';
import { Separator } from '../ui/separator.js';

export interface NavItem {
    label: string;
    href: string;
    icon: React.ReactNode;
    active?: boolean;
}

export interface AppShellProps {
    navigation: NavItem[];
    appName: string;
    user: { name: string; role: string } | null;
    onLogout: () => void;
    children: React.ReactNode;
}

const sidebarVariants = {
    expanded: { width: 280 },
    collapsed: { width: 84 },
};

function SidebarNav({
    navigation,
    collapsed,
    appName,
}: {
    navigation: NavItem[];
    collapsed: boolean;
    appName: string;
}) {
    return (
        <motion.nav className="flex flex-col gap-1.5 px-3 py-4">
            <div
                className={cn(
                    'mb-3 flex items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-3',
                    collapsed && 'justify-center px-0',
                )}
            >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Sparkles className="h-4 w-4" />
                </div>
                {!collapsed && (
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{appName}</p>
                        <p className="text-xs text-muted-foreground">Operations Console</p>
                    </div>
                )}
            </div>
            {!collapsed && (
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Navigation
                </p>
            )}
            {navigation.map((item) => (
                <motion.a
                    key={item.href}
                    href={item.href}
                    whileHover={collapsed ? undefined : { x: 2 }}
                    whileTap={{ scale: 0.99 }}
                    className={cn(
                        'group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold transition-all',
                        item.active
                            ? 'border-primary/25 bg-primary/12 text-foreground shadow-sm'
                            : 'text-muted-foreground hover:border-border/65 hover:bg-accent/35 hover:text-foreground',
                        collapsed && 'justify-center px-2.5',
                    )}
                    title={collapsed ? item.label : undefined}
                >
                    <span
                        className={cn(
                            'shrink-0 transition-colors',
                            item.active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                        )}
                    >
                        {item.icon}
                    </span>
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: 'auto' }}
                                exit={{ opacity: 0, width: 0 }}
                                className="overflow-hidden whitespace-nowrap"
                            >
                                {item.label}
                            </motion.span>
                        )}
                    </AnimatePresence>
                </motion.a>
            ))}
        </motion.nav>
    );
}

function MobileNav({
    navigation,
    appName,
}: {
    navigation: NavItem[];
    appName: string;
}) {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle menu</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[84vw] max-w-xs p-0">
                <div className="px-4 py-4">
                    <p className="text-base font-semibold">{appName}</p>
                    <p className="text-xs text-muted-foreground">Operations Console</p>
                </div>
                <Separator />
                <nav className="flex flex-col gap-1.5 px-3 py-3">
                    {navigation.map((item) => (
                        <motion.a
                            key={item.href}
                            href={item.href}
                            whileTap={{ scale: 0.99 }}
                            className={cn(
                                'flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold transition-colors',
                                item.active
                                    ? 'border-primary/25 bg-primary/10 text-foreground'
                                    : 'text-muted-foreground hover:border-border/65 hover:bg-accent/35 hover:text-foreground',
                            )}
                        >
                            <span
                                className={cn(
                                    'shrink-0',
                                    item.active ? 'text-primary' : 'text-muted-foreground',
                                )}
                            >
                                {item.icon}
                            </span>
                            <span>{item.label}</span>
                        </motion.a>
                    ))}
                </nav>
            </SheetContent>
        </Sheet>
    );
}

export function AppShell({
    navigation,
    appName,
    user,
    onLogout,
    children,
}: AppShellProps) {
    const [collapsed, setCollapsed] = useState(false);
    const isMobile = useIsMobile();
    const { theme, toggleTheme } = useTheme();
    const activeItem = navigation.find((item) => item.active) ?? navigation[0];
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

    return (
        <div className="flex h-screen overflow-hidden bg-transparent">
            {/* Desktop sidebar */}
            {!isMobile && (
                <motion.aside
                    variants={sidebarVariants}
                    animate={collapsed ? 'collapsed' : 'expanded'}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="hidden md:flex flex-col border-r border-border/70 bg-sidebar/85 backdrop-blur-md"
                >
                    <div className="flex-1 overflow-y-auto">
                        <SidebarNav
                            navigation={navigation}
                            collapsed={collapsed}
                            appName={appName}
                        />
                    </div>
                    <div className="border-t border-border/70 p-3">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-full"
                            onClick={() => setCollapsed(!collapsed)}
                        >
                            <motion.div
                                animate={{ rotate: collapsed ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </motion.div>
                        </Button>
                    </div>
                </motion.aside>
            )}

            {/* Main area */}
            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Header */}
                <header className="flex h-16 items-center gap-3 border-b border-border/70 bg-background/75 px-4 backdrop-blur-md md:px-6">
                    {isMobile && (
                        <MobileNav navigation={navigation} appName={appName} />
                    )}

                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground/95">
                                {activeItem?.label ?? appName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                                {isMobile ? appName : 'Enterprise workspace'}
                            </p>
                        </div>
                        {!isMobile && (
                            <Badge variant="outline" className="hidden lg:inline-flex">
                                <CalendarDays className="mr-1 h-3 w-3" />
                                {todayLabel}
                            </Badge>
                        )}
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

                    {user && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="relative h-8 w-8 rounded-full"
                                >
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback>
                                            {getInitials(user.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-semibold leading-none">
                                            {user.name}
                                        </p>
                                        <p className="text-xs leading-none text-muted-foreground">
                                            {user.role}
                                        </p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={onLogout}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </header>

                {/* Main content */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
