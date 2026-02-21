// === Primitives ===
export { Button, buttonVariants } from './components/ui/button.js';
export { Input } from './components/ui/input.js';
export { Label } from './components/ui/label.js';
export {
    Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
} from './components/ui/card.js';
export { Badge, badgeVariants } from './components/ui/badge.js';
export {
    Dialog, DialogTrigger, DialogContent, DialogHeader,
    DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from './components/ui/dialog.js';
export {
    Table, TableHeader, TableBody, TableFooter,
    TableRow, TableHead, TableCell, TableCaption,
} from './components/ui/table.js';
export {
    Select, SelectTrigger, SelectValue, SelectContent,
    SelectItem, SelectGroup, SelectLabel, SelectSeparator,
} from './components/ui/select.js';
export { Skeleton } from './components/ui/skeleton.js';
export { Separator } from './components/ui/separator.js';
export { Avatar, AvatarImage, AvatarFallback } from './components/ui/avatar.js';
export {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup,
} from './components/ui/dropdown-menu.js';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs.js';
export {
    Sheet, SheetTrigger, SheetContent, SheetHeader,
    SheetTitle, SheetDescription, SheetFooter, SheetClose,
} from './components/ui/sheet.js';

// === Layout ===
export { AppShell } from './components/layout/app-shell.js';
export type { NavItem, AppShellProps } from './components/layout/app-shell.js';
export { PageHeader } from './components/layout/page-header.js';

// === Shared / Domain ===
export { BalanceCard } from './components/shared/balance-card.js';
export { StatCard } from './components/shared/stat-card.js';
export { StatusBadge } from './components/shared/status-badge.js';
export { EmptyState } from './components/shared/empty-state.js';
export { LoadingSpinner, PageLoader } from './components/shared/loading-spinner.js';
export { DataTable } from './components/shared/data-table.js';
export { TransactionTable } from './components/shared/transaction-table.js';
export type { Transaction } from './components/shared/transaction-table.js';
export { LoginForm } from './components/shared/login-form.js';
export { PageTransition } from './components/shared/page-transition.js';

// === Hooks ===
export { useTheme } from './hooks/use-theme.js';
export { useIsMobile } from './hooks/use-mobile.js';

// === Providers ===
export { AuthProvider, useAuth } from './providers/auth-provider.js';
export { QueryProvider } from './providers/query-provider.js';
export { ApiProvider, useApi } from './providers/api-provider.js';

// === Lib ===
export { cn, formatCurrency, formatDate, formatRelativeTime, getInitials } from './lib/utils.js';
export { createApiClient, ApiError } from './lib/api.js';
export type { ApiClient } from './lib/api.js';
