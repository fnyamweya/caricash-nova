import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowRight, ChartNoAxesCombined, ShieldCheck, UserCheck } from 'lucide-react';
import {
    ActionCard,
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    PageTransition,
    StatCard,
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

export function DashboardPage() {
    const navigate = useNavigate();

    const groupedModules = useMemo(() => {
        return groupOrder.map((group) => ({
            group,
            items: staffNavigation.filter((item) => item.group === group && item.href !== '/dashboard'),
        }));
    }, []);

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
            </ModulePage>
        </PageTransition>
    );
}
