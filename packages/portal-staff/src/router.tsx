import { useEffect } from 'react';
import {
    createRouter,
    createRoute,
    createRootRoute,
    Outlet,
    redirect,
    useNavigate,
} from '@tanstack/react-router';
import { NotFoundPage, useAuth } from '@caricash/ui';
import { StaffAppShell } from './components/staff-app-shell.js';
import { staffNavigation } from './navigation.js';
import { LoginPage } from './pages/login.js';
import { DashboardPage } from './pages/dashboard.js';
import { CustomersPage } from './pages/customers.js';
import { AgentsPage } from './pages/agents.js';
import { MerchantsPage } from './pages/merchants.js';
import { ApprovalsPage } from './pages/approvals.js';
import { LedgerPage } from './pages/ledger.js';
import { ReconciliationPage } from './pages/reconciliation.js';
import { OverdraftPage } from './pages/overdraft.js';

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

    useEffect(() => {
        if (!isAuthenticated) {
            navigate({ to: '/login' });
        }
    }, [isAuthenticated, navigate]);

    if (!isAuthenticated) {
        return null;
    }

    return (
        <StaffAppShell
            navigation={staffNavigation}
            appName="CariCash Control Center"
            user={actor ? { name: actor.name, role: 'Staff' } : null}
            onLogout={() => {
                localStorage.removeItem('caricash_staff_id');
                logout();
                navigate({ to: '/login' });
            }}
        >
            <Outlet />
        </StaffAppShell>
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

const customersRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/customers',
    component: CustomersPage,
});

const agentsRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/agents',
    component: AgentsPage,
});

const merchantsRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/merchants',
    component: MerchantsPage,
});

const approvalsRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/approvals',
    component: ApprovalsPage,
});

const ledgerRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/ledger',
    component: LedgerPage,
});

const reconciliationRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/reconciliation',
    component: ReconciliationPage,
});

const overdraftRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/overdraft',
    component: OverdraftPage,
});

// ── Router tree ───────────────────────────────────────
const routeTree = rootRoute.addChildren([
    loginRoute,
    authLayoutRoute.addChildren([
        indexRoute,
        dashboardRoute,
        customersRoute,
        agentsRoute,
        merchantsRoute,
        approvalsRoute,
        ledgerRoute,
        reconciliationRoute,
        overdraftRoute,
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
