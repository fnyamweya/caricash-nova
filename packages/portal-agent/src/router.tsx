import { useEffect } from 'react';
import {
    createRouter,
    createRoute,
    createRootRoute,
    Outlet,
    redirect,
    useNavigate,
    useLocation,
} from '@tanstack/react-router';
import {
    LayoutDashboard,
    ArrowDownToLine,
    ArrowUpFromLine,
    UserPlus,
    Clock,
} from 'lucide-react';
import { AppShell, useAuth, type NavItem } from '@caricash/ui';
import { LoginPage } from './pages/login.js';
import { DashboardPage } from './pages/dashboard.js';
import { DepositPage } from './pages/deposit.js';
import { WithdrawalPage } from './pages/withdrawal.js';
import { RegisterCustomerPage } from './pages/register.js';
import { HistoryPage } from './pages/history.js';

// ── Root ──────────────────────────────────────────────
const rootRoute = createRootRoute({
    component: () => <Outlet />,
});

// ── Login (public) ────────────────────────────────────
const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: LoginPage,
});

// ── Auth layout ───────────────────────────────────────
function AuthLayout() {
    const { isAuthenticated, actor, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (!isAuthenticated) {
            navigate({ to: '/login' });
        }
    }, [isAuthenticated, navigate]);

    if (!isAuthenticated) {
        return null;
    }

    const navigation: NavItem[] = [
        {
            label: 'Dashboard',
            href: '/dashboard',
            icon: <LayoutDashboard className="h-4 w-4" />,
            active: location.pathname === '/dashboard',
        },
        {
            label: 'Cash-In / Deposit',
            href: '/deposit',
            icon: <ArrowDownToLine className="h-4 w-4" />,
            active: location.pathname === '/deposit',
        },
        {
            label: 'Cash-Out / Withdrawal',
            href: '/withdrawal',
            icon: <ArrowUpFromLine className="h-4 w-4" />,
            active: location.pathname === '/withdrawal',
        },
        {
            label: 'Register Customer',
            href: '/register',
            icon: <UserPlus className="h-4 w-4" />,
            active: location.pathname === '/register',
        },
        {
            label: 'History',
            href: '/history',
            icon: <Clock className="h-4 w-4" />,
            active: location.pathname === '/history',
        },
    ];

    return (
        <AppShell
            navigation={navigation}
            appName="CariCash"
            user={actor ? { name: actor.name, role: 'Agent' } : null}
            onLogout={() => {
                logout();
                navigate({ to: '/login' });
            }}
        >
            <Outlet />
        </AppShell>
    );
}

const authLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'auth',
    component: AuthLayout,
});

// ── Index redirect ────────────────────────────────────
const indexRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/',
    beforeLoad: () => {
        throw redirect({ to: '/dashboard' });
    },
});

// ── Authenticated pages ───────────────────────────────
const dashboardRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/dashboard',
    component: DashboardPage,
});

const depositRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/deposit',
    component: DepositPage,
});

const withdrawalRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/withdrawal',
    component: WithdrawalPage,
});

const registerRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/register',
    component: RegisterCustomerPage,
});

const historyRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/history',
    component: HistoryPage,
});

// ── Router tree ───────────────────────────────────────
const routeTree = rootRoute.addChildren([
    loginRoute,
    authLayoutRoute.addChildren([
        indexRoute,
        dashboardRoute,
        depositRoute,
        withdrawalRoute,
        registerRoute,
        historyRoute,
    ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}
