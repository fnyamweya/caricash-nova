import { useMemo } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { CalendarDays, LogOut, Search, Sparkles } from 'lucide-react';
import {
    AppearanceMenu,
    Avatar,
    AvatarFallback,
    Badge,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Input,
    Separator,
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
    cn,
    getInitials,
    useSidebar,
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

function StaffUserSidebarMenu({
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

function StaffSidebarGroups({
    groupedNavigation,
    pathname,
    onNavigate,
}: {
    groupedNavigation: ReturnType<typeof groupNavigation>;
    pathname: string;
    onNavigate: (href: StaffNavItem['href']) => void;
}) {
    const { setOpenMobile } = useSidebar();

    return (
        <>
            {groupedNavigation.map(({ group, items }) => {
                if (items.length === 0) {
                    return null;
                }

                return (
                    <SidebarGroup key={group}>
                        <SidebarGroupLabel>{navGroupLabels[group]}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {items.map((item) => {
                                    const active = isActivePath(pathname, item.href);
                                    return (
                                        <SidebarMenuItem key={item.href}>
                                            <SidebarMenuButton
                                                type="button"
                                                isActive={active}
                                                tooltip={item.label}
                                                onClick={() => {
                                                    onNavigate(item.href);
                                                    setOpenMobile(false);
                                                }}
                                                className="h-auto items-start gap-2 py-2"
                                            >
                                                <span className="mt-0.5">{item.icon}</span>
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-medium">
                                                        {item.label}
                                                    </span>
                                                    <span className="text-muted-foreground block truncate text-xs group-data-[collapsible=icon]:hidden">
                                                        {item.description}
                                                    </span>
                                                </span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    );
                                })}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                );
            })}
        </>
    );
}

export function StaffAppShell({
    navigation,
    appName,
    user,
    onLogout,
    children,
}: StaffAppShellProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const { shellVariant, activeTheme, themes } = useTheme();
    const groupedNavigation = useMemo(() => groupNavigation(navigation), [navigation]);
    const activeItem =
        navigation.find((item) => isActivePath(location.pathname, item.href)) ?? navigation[0];
    const activeThemeLabel =
        themes.find((themeOption) => themeOption.value === activeTheme)?.label ?? activeTheme;

    const sidebarVariant =
        shellVariant === 'workspace'
            ? 'inset'
            : shellVariant === 'framed'
                ? 'floating'
                : shellVariant === 'contrast'
                    ? 'inset'
                    : 'sidebar';

    const sidebarSizing = {
        workspace: { width: '19rem', icon: '3.25rem' },
        framed: { width: '20rem', icon: '3.25rem' },
        compact: { width: '17rem', icon: '3rem' },
        contrast: { width: '19rem', icon: '3.25rem' },
    }[shellVariant];

    const todayLabel = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(new Date());

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
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{appName}</p>
                            <p className="text-sidebar-foreground/70 truncate text-xs">
                                Control Center
                            </p>
                        </div>
                    </div>
                </SidebarHeader>

                <SidebarSeparator />
                <SidebarContent>
                    <StaffSidebarGroups
                        groupedNavigation={groupedNavigation}
                        pathname={location.pathname}
                        onNavigate={(href) => void navigate({ to: href })}
                    />
                </SidebarContent>
                <SidebarSeparator />
                <SidebarFooter>
                    <StaffUserSidebarMenu user={user} onLogout={onLogout} />
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
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold">{activeItem.label}</p>
                                <Badge variant="outline" className="hidden sm:inline-flex">
                                    {activeItem.group}
                                </Badge>
                            </div>
                            <p className="text-muted-foreground truncate text-xs">
                                {activeItem.description}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative hidden w-64 md:block">
                            <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
                            <Input
                                value=""
                                readOnly
                                aria-label="Search placeholder"
                                className="h-8 pl-8 text-xs"
                                placeholder="Search modules (coming soon)"
                            />
                        </div>
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
