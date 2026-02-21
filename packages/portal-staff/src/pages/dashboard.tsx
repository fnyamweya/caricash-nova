import { useNavigate } from '@tanstack/react-router';
import {
    Users,
    UserCog,
    ClipboardCheck,
    Activity,
    BookOpen,
    Scale,
    Landmark,
    Store,
} from 'lucide-react';
import {
    PageHeader,
    PageTransition,
    StatCard,
    ActionCard,
} from '@caricash/ui';

export function DashboardPage() {
    const navigate = useNavigate();

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Staff Dashboard"
                    description="System overview and management tools"
                />

                {/* Stats overview */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        title="Total Customers"
                        value="—"
                        description="Placeholder"
                        icon={<Users className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Active Agents"
                        value="—"
                        description="Placeholder"
                        icon={<UserCog className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Pending Approvals"
                        value="—"
                        description="Placeholder"
                        icon={<ClipboardCheck className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Recent Transactions"
                        value="—"
                        description="Placeholder"
                        icon={<Activity className="h-4 w-4" />}
                    />
                </div>

                {/* Quick links */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <ActionCard
                        title="Customers"
                        description="Create and manage customer accounts"
                        icon={<Users className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/customers' })}
                    />

                    <ActionCard
                        title="Agents"
                        description="Create and manage agent accounts"
                        icon={<UserCog className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/agents' })}
                    />

                    <ActionCard
                        title="Merchants"
                        description="Create and manage merchant accounts"
                        icon={<Store className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/merchants' })}
                    />

                    <ActionCard
                        title="Approvals"
                        description="Review and process pending approvals"
                        icon={<ClipboardCheck className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/approvals' })}
                    />

                    <ActionCard
                        title="Ledger"
                        description="Inspect journal entries and verify integrity"
                        icon={<BookOpen className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/ledger' })}
                    />

                    <ActionCard
                        title="Reconciliation"
                        description="Run reconciliation and review findings"
                        icon={<Scale className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/reconciliation' })}
                    />

                    <ActionCard
                        title="Overdraft"
                        description="Manage overdraft facility requests"
                        icon={<Landmark className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/overdraft' })}
                    />
                </div>
            </div>
        </PageTransition>
    );
}
