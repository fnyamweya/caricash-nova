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
import { AppShell, useAuth, type NavItem } from '@caricash/ui';
import { LoginPage } from './pages/login.js';
import { DashboardPage } from './pages/dashboard.js';
import { SendMoneyPage } from './pages/send-money.js';
import { PayMerchantPage } from './pages/pay-merchant.js';
import { HistoryPage } from './pages/history.js';
import { KycPage } from './pages/kyc.js';

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

    if (!isAuthenticated) {
        navigate({ to: '/login' });
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
            label: 'KYC',
            href: '/kyc',
            icon: <ShieldCheck className="h-4 w-4" />,
            active: location.pathname === '/kyc',
        },
    ];

    return (
        <AppShell
            navigation={navigation}
            appName="CariCash"
            user={actor ? { name: actor.name, role: 'Customer' } : null}
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

const kycRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/kyc',
    component: KycPage,
});

// ── Router tree ───────────────────────────────────────
const routeTree = rootRoute.addChildren([
    loginRoute,
    authLayoutRoute.addChildren([
        indexRoute,
        dashboardRoute,
        sendRoute,
        payRoute,
        historyRoute,
        kycRoute,
    ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}
