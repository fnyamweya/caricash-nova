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
    SendHorizontal,
    ShoppingBag,
    Clock,
    ShieldCheck,
} from 'lucide-react';
import { NotFoundPage, useAuth, type NavItem } from '@caricash/ui';
import { CustomerAppShell } from './components/customer-app-shell.js';
import { LoginPage } from './pages/login.js';
import { RegisterPage } from './pages/register.js';
import { DashboardPage } from './pages/dashboard.js';
import { SendMoneyPage } from './pages/send-money.js';
import { PayMerchantPage } from './pages/pay-merchant.js';
import { HistoryPage } from './pages/history.js';
import { SettingsPage } from './pages/settings.js';

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

// ── Register (public) ─────────────────────────────────
const registerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/register',
    component: RegisterPage,
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
            label: 'Send Money',
            href: '/send',
            icon: <SendHorizontal className="h-4 w-4" />,
            active: location.pathname === '/send',
        },
        {
            label: 'Pay Merchant',
            href: '/pay',
            icon: <ShoppingBag className="h-4 w-4" />,
            active: location.pathname === '/pay',
        },
        {
            label: 'History',
            href: '/history',
            icon: <Clock className="h-4 w-4" />,
            active: location.pathname === '/history',
        },
        {
            label: 'Settings',
            href: '/settings',
            icon: <ShieldCheck className="h-4 w-4" />,
            active: location.pathname === '/settings' || location.pathname === '/kyc',
        },
    ];

    return (
        <CustomerAppShell
            navigation={navigation}
            appName="CariCash Customer"
            user={actor ? { name: actor.name, role: 'Customer' } : null}
            onLogout={() => {
                logout();
                navigate({ to: '/login' });
            }}
        >
            <Outlet />
        </CustomerAppShell>
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

const sendRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/send',
    component: SendMoneyPage,
});

const payRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/pay',
    component: PayMerchantPage,
});

const historyRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/history',
    component: HistoryPage,
});

const settingsRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/settings',
    component: SettingsPage,
});

const kycRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/kyc',
    beforeLoad: () => {
        throw redirect({ to: '/settings' });
    },
});

// ── Router tree ───────────────────────────────────────
const routeTree = rootRoute.addChildren([
    loginRoute,
    registerRoute,
    authLayoutRoute.addChildren([
        indexRoute,
        dashboardRoute,
        sendRoute,
        payRoute,
        historyRoute,
        settingsRoute,
        kycRoute,
    ]),
]);

export const router = createRouter({
    routeTree,
    defaultNotFoundComponent: () => <NotFoundPage homeHref="/dashboard" homeLabel="Go to dashboard" />,
});

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}
