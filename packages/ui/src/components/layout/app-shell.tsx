import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sun, Moon, LogOut, ChevronLeft } from 'lucide-react';

import { cn, getInitials } from '../../lib/utils.js';
import { useIsMobile } from '../../hooks/use-mobile.js';
import { useTheme } from '../../hooks/use-theme.js';
import { Avatar, AvatarFallback } from '../ui/avatar.js';
import { Button } from '../ui/button.js';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet.js';
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
  expanded: { width: 240 },
  collapsed: { width: 64 },
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
    <motion.nav className="flex flex-col gap-1 px-2 py-2">
      {!collapsed && (
        <div className="px-3 py-2 text-lg font-bold tracking-tight text-foreground">
          {appName}
        </div>
      )}
      {!collapsed && <Separator className="mb-2" />}
      {navigation.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
            item.active
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground',
            collapsed && 'justify-center px-2',
          )}
          title={collapsed ? item.label : undefined}
        >
          <span className="shrink-0">{item.icon}</span>
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
        </a>
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
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <div className="px-4 py-4 text-lg font-bold tracking-tight">
          {appName}
        </div>
        <Separator />
        <nav className="flex flex-col gap-1 px-2 py-2">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
                item.active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground',
              )}
            >
              <span className="shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </a>
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
  const resolvedTheme =
    theme === 'system'
      ? typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      {!isMobile && (
        <motion.aside
          variants={sidebarVariants}
          animate={collapsed ? 'collapsed' : 'expanded'}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="hidden md:flex flex-col border-r bg-card"
        >
          <div className="flex-1 overflow-y-auto">
            <SidebarNav
              navigation={navigation}
              collapsed={collapsed}
              appName={appName}
            />
          </div>
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="icon"
              className="w-full"
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
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4">
          {isMobile && (
            <MobileNav navigation={navigation} appName={appName} />
          )}

          <div className="flex-1">
            {isMobile && (
              <span className="text-lg font-bold tracking-tight">
                {appName}
              </span>
            )}
          </div>

          <Button
            variant="ghost"
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
                    <p className="text-sm font-medium leading-none">
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
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
