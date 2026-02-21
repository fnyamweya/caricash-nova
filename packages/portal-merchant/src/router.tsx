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
    CreditCard,
    ArrowLeftRight,
    Clock,
    QrCode,
    Users,
} from 'lucide-react';
import { AppShell, NotFoundPage, useAuth, type NavItem } from '@caricash/ui';
import { LoginPage } from './pages/login.js';
import { RegisterPage } from './pages/register.js';
import { DashboardPage } from './pages/dashboard.js';
import { PaymentsPage } from './pages/payments.js';
import { TransferPage } from './pages/transfer.js';
import { HistoryPage } from './pages/history.js';
import { QrCodePage } from './pages/qr-code.js';
import { TeamPage } from './pages/team.js';

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
            label: 'My QR Code',
            href: '/qr-code',
            icon: <QrCode className="h-4 w-4" />,
            active: location.pathname === '/qr-code',
        },
        {
            label: 'Payments',
            href: '/payments',
            icon: <CreditCard className="h-4 w-4" />,
            active: location.pathname === '/payments',
        },
        {
            label: 'Transfer',
            href: '/transfer',
            icon: <ArrowLeftRight className="h-4 w-4" />,
            active: location.pathname === '/transfer',
        },
        {
            label: 'History',
            href: '/history',
            icon: <Clock className="h-4 w-4" />,
            active: location.pathname === '/history',
        },
        {
            label: 'Team',
            href: '/team',
            icon: <Users className="h-4 w-4" />,
            active: location.pathname === '/team',
        },
    ];

    return (
        <AppShell
            navigation={navigation}
            appName="CariCash Merchant Console"
            user={actor ? { name: actor.name, role: 'Merchant' } : null}
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

const paymentsRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/payments',
    component: PaymentsPage,
});

const transferRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/transfer',
    component: TransferPage,
});

const historyRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/history',
    component: HistoryPage,
});

const qrCodeRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/qr-code',
    component: QrCodePage,
});

const teamRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/team',
    component: TeamPage,
});

// ── Router tree ───────────────────────────────────────
const routeTree = rootRoute.addChildren([
    loginRoute,
    registerRoute,
    authLayoutRoute.addChildren([
        indexRoute,
        dashboardRoute,
        paymentsRoute,
        transferRoute,
        historyRoute,
        qrCodeRoute,
        teamRoute,
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
