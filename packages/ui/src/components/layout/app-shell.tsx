import { useMemo } from 'react';
import { CalendarDays, LogOut, Search, Sparkles } from 'lucide-react';

import { getInitials, cn } from '../../lib/utils.js';
import { useTheme } from '../../hooks/use-theme.js';
import { AppearanceMenu } from '../shared/appearance-menu.js';
import { Avatar, AvatarFallback } from '../ui/avatar.js';
import { Badge } from '../ui/badge.js';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu.js';
import { Input } from '../ui/input.js';
import { Separator } from '../ui/separator.js';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarRail,
    SidebarSeparator,
    SidebarTrigger,
    useSidebar,
} from '../ui/sidebar.js';

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
    brandSubtitle?: string;
    headerSubtitle?: string;
    navLabel?: string;
    searchPlaceholder?: string;
    hideSearch?: boolean;
}

function UserSidebarMenu({
    user,
    onLogout,
}: {
    user: { name: string; role: string } | null;
    onLogout: () => void;
}) {
    const { isMobile } = useSidebar();

    if (!user) {
        return null;
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <Avatar className="h-8 w-8 rounded-lg border bg-muted/50">
                                <AvatarFallback className="rounded-lg text-xs">
                                    {getInitials(user.name)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">{user.name}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                    {user.role}
                                </span>
                            </div>
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                        side={isMobile ? 'bottom' : 'right'}
                        align="end"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                <Avatar className="h-8 w-8 rounded-lg border bg-muted/50">
                                    <AvatarFallback className="rounded-lg text-xs">
                                        {getInitials(user.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">{user.name}</span>
                                    <span className="truncate text-xs text-muted-foreground">
                                        {user.role}
                                    </span>
                                </div>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onLogout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

export function AppShell({
    navigation,
    appName,
    user,
    onLogout,
    children,
    brandSubtitle = 'Digital Wallet Workspace',
    headerSubtitle,
    navLabel = 'Navigation',
    searchPlaceholder = 'Search modules (coming soon)',
    hideSearch = false,
}: AppShellProps) {
    const { shellVariant, activeTheme, themes } = useTheme();
    const activeItem = navigation.find((item) => item.active) ?? navigation[0];
    const activeThemeLabel =
        themes.find((themeOption) => themeOption.value === activeTheme)?.label ?? activeTheme;
    const todayLabel = useMemo(
        () =>
            new Intl.DateTimeFormat(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
            }).format(new Date()),
        [],
    );

    const sidebarVariant =
        shellVariant === 'workspace'
            ? 'inset'
            : shellVariant === 'framed'
                ? 'floating'
                : shellVariant === 'contrast'
                    ? 'inset'
                    : 'sidebar';

    const sidebarSizing = {
        workspace: { width: '17rem', icon: '3.25rem' },
        framed: { width: '18rem', icon: '3.25rem' },
        compact: { width: '15rem', icon: '3rem' },
        contrast: { width: '17rem', icon: '3.25rem' },
    }[shellVariant];

    return (
        <SidebarProvider
            defaultOpen
            style={{
                '--sidebar-width': sidebarSizing.width,
                '--sidebar-width-icon': sidebarSizing.icon,
            } as React.CSSProperties}
        >
            <Sidebar
                collapsible="icon"
                variant={sidebarVariant}
                className={cn(
                    shellVariant === 'contrast' &&
                        '[&_[data-slot=sidebar-inner]]:border-2 [&_[data-slot=sidebar-inner]]:shadow-none',
                )}
            >
                <SidebarHeader>
                    <div className="flex items-center gap-3 rounded-lg border border-sidebar-border/70 bg-sidebar/60 p-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                            <Sparkles className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{appName}</p>
                            <p className="text-sidebar-foreground/70 truncate text-xs">
                                {brandSubtitle}
                            </p>
                        </div>
                    </div>
                </SidebarHeader>

                <SidebarSeparator />

                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupLabel>{navLabel}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {navigation.map((item) => (
                                    <SidebarMenuItem key={item.href}>
                                        <SidebarMenuButton
                                            asChild
                                            isActive={Boolean(item.active)}
                                            tooltip={item.label}
                                        >
                                            <a href={item.href}>
                                                {item.icon}
                                                <span>{item.label}</span>
                                            </a>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>

                <SidebarSeparator />
                <SidebarFooter>
                    <UserSidebarMenu user={user} onLogout={onLogout} />
                </SidebarFooter>
                <SidebarRail />
            </Sidebar>

            <SidebarInset
                className={cn(
                    'min-h-svh',
                    shellVariant === 'contrast' && 'md:border md:border-border',
                )}
            >
                <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
                    <div className="flex min-w-0 items-center gap-2">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-1 h-4" />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                                {activeItem?.label ?? appName}
                            </p>
                            <p className="text-muted-foreground truncate text-xs">
                                {headerSubtitle ?? appName}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!hideSearch ? (
                            <div className="relative hidden w-56 md:block">
                                <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    value=""
                                    readOnly
                                    aria-label="Search placeholder"
                                    className="h-8 pl-8 text-xs"
                                    placeholder={searchPlaceholder}
                                />
                            </div>
                        ) : null}
                        <Badge variant="outline" className="hidden md:inline-flex">
                            <CalendarDays className="h-3 w-3" />
                            {todayLabel}
                        </Badge>
                        <Badge variant="outline" className="hidden lg:inline-flex">
                            {activeThemeLabel}
                        </Badge>
                        <AppearanceMenu compact />
                    </div>
                </header>

                <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto">
                        <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:space-y-7 md:p-6">
                            {children}
                        </div>
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
