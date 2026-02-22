import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
    AlertTriangle,
    ArrowRight,
    ArrowDownLeft,
    ArrowUpRight,
    BookOpen,
    ChartNoAxesCombined,
    ShieldCheck,
    UserCheck,
} from 'lucide-react';
import {
    ActionCard,
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    EmptyState,
    LoadingSpinner,
    PageTransition,
    StatCard,
    formatCurrency,
    formatDate,
    useApi,
} from '@caricash/ui';
import { ModulePage } from '../components/module-page.js';
import { staffNavigation, type StaffNavGroup, type StaffNavItem } from '../navigation.js';

const groupOrder: StaffNavGroup[] = ['Core', 'Operations', 'Controls'];

const groupTitles: Record<StaffNavGroup, string> = {
    Core: 'Core Modules',
    Operations: 'Operations Modules',
    Controls: 'Controls Modules',
};

const priorityQueue: Array<{
    title: string;
    detail: string;
    priority: 'High' | 'Medium';
    href: StaffNavItem['href'];
}> = [
    {
        title: 'Process pending approvals',
        detail: 'Clear decision backlog and document rejection rationale where needed.',
        priority: 'High',
        href: '/approvals',
    },
    {
        title: 'Run integrity controls',
        detail: 'Execute ledger verification for the current audit window.',
        priority: 'High',
        href: '/ledger',
    },
    {
        title: 'Review reconciliation findings',
        detail: 'Confirm open findings and assign remediation ownership.',
        priority: 'Medium',
        href: '/reconciliation',
    },
];

interface LedgerActivityRow {
    journal_id: string;
    txn_type: string;
    currency: string;
    journal_state?: string;
    posted_at: string;
    entry_type: 'DR' | 'CR';
    amount: string;
    journal_description?: string;
    line_description?: string;
}

interface LedgerActivityResponse {
    rows: LedgerActivityRow[];
    count: number;
}

export function DashboardPage() {
    const navigate = useNavigate();
    const api = useApi();

    const recentLedgerQuery = useQuery<LedgerActivityResponse>({
        queryKey: ['staff-dashboard-recent-ledger'],
        queryFn: () => api.get<LedgerActivityResponse>('/ops/accounting/reports/gl-detail?limit=40'),
        refetchInterval: 60_000,
    });

    const groupedModules = useMemo(() => {
        return groupOrder.map((group) => ({
            group,
            items: staffNavigation.filter((item) => item.group === group && item.href !== '/dashboard'),
        }));
    }, []);

    const recentTransactions = useMemo(() => {
        const rows = recentLedgerQuery.data?.rows ?? [];
        const seen = new Set<string>();
        const journals: LedgerActivityRow[] = [];

        for (const row of rows) {
            if (seen.has(row.journal_id)) {
                continue;
            }
            seen.add(row.journal_id);
            journals.push(row);
            if (journals.length >= 5) {
                break;
            }
        }

        return journals;
    }, [recentLedgerQuery.data?.rows]);

    return (
        <PageTransition>
            <ModulePage
                module="Command Center"
                title="Staff Operations Dashboard"
                description="Enterprise workspace for account lifecycle operations, approvals, and control workflows"
                playbook={[
                    'Confirm high-priority queues before opening ad-hoc requests.',
                    'Use grouped modules to keep operational and control actions separate.',
                    'Record correlation and approval references in the related incident or ticket.',
                ]}
                sidebar={
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">System Posture</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <p className="flex items-start gap-2">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                Staff modules are available and responsive.
                            </p>
                            <p className="flex items-start gap-2">
                                <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                Identity, actor, and approval workflows are ready for review.
                            </p>
                        </CardContent>
                    </Card>
                }
            >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        title="Operational Readiness"
                        value="Healthy"
                        description="Core module pathways are active"
                        trend="up"
                        icon={<ShieldCheck className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Priority Queue"
                        value="3 Items"
                        description="2 high-priority actions pending"
                        trend="neutral"
                        icon={<AlertTriangle className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Control Coverage"
                        value="2 Modules"
                        description="Ledger and reconciliation available"
                        trend="up"
                        icon={<ChartNoAxesCombined className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Approval Throughput"
                        value="Manual"
                        description="Operator-reviewed decisions"
                        trend="neutral"
                        icon={<UserCheck className="h-4 w-4" />}
                    />
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                    {groupedModules.map(({ group, items }) => (
                        <Card key={group}>
                            <CardHeader>
                                <CardTitle className="text-base">{groupTitles[group]}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {items.map((item) => (
                                    <ActionCard
                                        key={item.href}
                                        title={item.label}
                                        description={item.description}
                                        icon={item.icon}
                                        onClick={() => navigate({ to: item.href })}
                                    />
                                ))}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Priority Work Queue</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {priorityQueue.map((item) => (
                            <div
                                key={item.title}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/35 p-3"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold">{item.title}</p>
                                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant={item.priority === 'High' ? 'default' : 'outline'}>
                                        {item.priority}
                                    </Badge>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => navigate({ to: item.href })}
                                    >
                                        Open
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-3">
                        <CardTitle className="text-base">Recent Transactions</CardTitle>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => navigate({ to: '/ledger' })}
                        >
                            Open Ledger
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {recentLedgerQuery.isLoading ? (
                            <div className="flex justify-center py-8">
                                <LoadingSpinner />
                            </div>
                        ) : recentLedgerQuery.isError ? (
                            <EmptyState
                                icon={<BookOpen className="h-5 w-5" />}
                                title="Unable to load recent transactions"
                                description={(recentLedgerQuery.error as Error)?.message ?? 'Ledger activity is temporarily unavailable.'}
                            />
                        ) : recentTransactions.length > 0 ? (
                            <div className="space-y-2">
                                {recentTransactions.map((row) => {
                                    const isCredit = row.entry_type === 'CR';
                                    const description = row.line_description
                                        || row.journal_description
                                        || `Journal ${row.journal_id.slice(0, 12)}…`;

                                    return (
                                        <div
                                            key={row.journal_id}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3"
                                        >
                                            <div className="min-w-0 flex items-center gap-3">
                                                <div className="rounded-full bg-muted p-2">
                                                    {isCredit ? (
                                                        <ArrowDownLeft className="h-4 w-4 text-green-600" />
                                                    ) : (
                                                        <ArrowUpRight className="h-4 w-4 text-red-600" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="truncate text-sm font-medium">
                                                            {row.txn_type}
                                                        </p>
                                                        <Badge variant="outline">
                                                            {row.journal_state ?? 'POSTED'}
                                                        </Badge>
                                                    </div>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {description}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className={`text-sm font-semibold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                                                    {isCredit ? '+' : '-'}
                                                    {formatCurrency(row.amount, row.currency || 'BBD')}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {formatDate(row.posted_at)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyState
                                icon={<BookOpen className="h-5 w-5" />}
                                title="No ledger activity yet"
                                description="Recent transactions will appear after journals are posted."
                            />
                        )}
                    </CardContent>
                </Card>
            </ModulePage>
        </PageTransition>
    );
}
