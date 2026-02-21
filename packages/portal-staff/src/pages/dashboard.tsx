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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
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
          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => navigate({ to: '/customers' })}
          >
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create and manage customer accounts
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => navigate({ to: '/agents' })}
          >
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <UserCog className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Agents</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create and manage agent accounts
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => navigate({ to: '/merchants' })}
          >
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Store className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Merchants</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create and manage merchant accounts
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => navigate({ to: '/approvals' })}
          >
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Approvals</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Review and process pending approvals
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => navigate({ to: '/ledger' })}
          >
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Ledger</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Inspect journal entries and verify integrity
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => navigate({ to: '/reconciliation' })}
          >
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Scale className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Reconciliation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Run reconciliation and review findings
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => navigate({ to: '/overdraft' })}
          >
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Landmark className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Overdraft</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Manage overdraft facility requests
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
