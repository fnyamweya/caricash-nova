import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import {
  useApi,
  PageHeader,
  PageTransition,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  DataTable,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@caricash/ui';

interface ReconciliationRunResponse {
  run_id: string;
  status: string;
  started_at: string;
  [key: string]: unknown;
}

interface Finding {
  id: string;
  run_id: string;
  type: string;
  status: string;
  description: string;
  [key: string]: unknown;
}

interface FindingsResponse {
  findings: Finding[];
  count: number;
}

interface RunRecord {
  run_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  [key: string]: unknown;
}

interface RunsResponse {
  runs: RunRecord[];
  count: number;
}

const findingColumns = [
  { key: 'id' as const, header: 'Finding ID' },
  { key: 'type' as const, header: 'Type' },
  { key: 'status' as const, header: 'Status' },
  { key: 'description' as const, header: 'Description' },
];

const runColumns = [
  { key: 'run_id' as const, header: 'Run ID' },
  { key: 'status' as const, header: 'Status' },
  { key: 'started_at' as const, header: 'Started' },
  {
    key: 'finished_at' as const,
    header: 'Finished',
    render: (v: unknown) => (v as string) ?? '—',
  },
];

export function ReconciliationPage() {
  const api = useApi();
  const [runResult, setRunResult] = useState<ReconciliationRunResponse | null>(null);
  const [findingStatus, setFindingStatus] = useState<string>('');

  const runMutation = useMutation({
    mutationFn: () => api.post<ReconciliationRunResponse>('/ops/reconciliation/run'),
    onSuccess: (res: ReconciliationRunResponse) => setRunResult(res),
  });

  const findingsQuery = useQuery({
    queryKey: ['reconciliation-findings', findingStatus],
    queryFn: () => {
      const params = findingStatus
        ? `?status=${encodeURIComponent(findingStatus)}`
        : '';
      return api.get<FindingsResponse>(`/ops/reconciliation/findings${params}`);
    },
    enabled: false,
  });

  const runsQuery = useQuery({
    queryKey: ['reconciliation-runs'],
    queryFn: () => api.get<RunsResponse>('/ops/reconciliation/runs'),
    enabled: false,
  });

  return (
    <PageTransition>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Reconciliation"
          description="Run reconciliation, review findings, and inspect run history"
        />

        <Tabs defaultValue="run">
          <TabsList>
            <TabsTrigger value="run">Run Reconciliation</TabsTrigger>
            <TabsTrigger value="findings">Findings</TabsTrigger>
            <TabsTrigger value="history">Run History</TabsTrigger>
          </TabsList>

          {/* Run tab */}
          <TabsContent value="run">
            <Card className="max-w-lg">
              <CardHeader>
                <CardTitle className="text-base">Trigger Reconciliation Run</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Button
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending}
                  className="w-full"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {runMutation.isPending ? 'Running…' : 'Start Reconciliation'}
                </Button>

                {runMutation.isError && (
                  <p className="text-sm text-destructive">
                    {runMutation.error?.message ?? 'Reconciliation failed.'}
                  </p>
                )}

                {runResult && (
                  <div className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                    <p>
                      <span className="font-medium">Run ID:</span> {runResult.run_id}
                    </p>
                    <p>
                      <span className="font-medium">Status:</span>{' '}
                      <Badge variant="outline">{runResult.status}</Badge>
                    </p>
                    <p>
                      <span className="font-medium">Started:</span>{' '}
                      {runResult.started_at}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Findings tab */}
          <TabsContent value="findings">
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Filter Findings</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {['', 'open', 'resolved', 'ignored'].map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={findingStatus === status ? 'default' : 'outline'}
                      onClick={() => {
                        setFindingStatus(status);
                        findingsQuery.refetch();
                      }}
                    >
                      {status || 'All'}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Findings</CardTitle>
                </CardHeader>
                <CardContent>
                  {findingsQuery.isError && (
                    <p className="text-sm text-destructive mb-2">
                      {findingsQuery.error?.message ?? 'Failed to load findings.'}
                    </p>
                  )}
                  <DataTable
                    data={findingsQuery.data?.findings ?? []}
                    columns={findingColumns}
                    loading={findingsQuery.isFetching}
                    emptyMessage="No findings — click a filter above to load"
                  />
                  {findingsQuery.data && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {findingsQuery.data.count} finding(s)
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Run History tab */}
          <TabsContent value="history">
            <div className="flex flex-col gap-4">
              <Button
                variant="outline"
                onClick={() => runsQuery.refetch()}
                disabled={runsQuery.isFetching}
              >
                {runsQuery.isFetching ? 'Loading…' : 'Load Run History'}
              </Button>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Run History</CardTitle>
                </CardHeader>
                <CardContent>
                  {runsQuery.isError && (
                    <p className="text-sm text-destructive mb-2">
                      {runsQuery.error?.message ?? 'Failed to load runs.'}
                    </p>
                  )}
                  <DataTable
                    data={runsQuery.data?.runs ?? []}
                    columns={runColumns}
                    loading={runsQuery.isFetching}
                    emptyMessage="No runs — click above to load"
                  />
                  {runsQuery.data && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {runsQuery.data.count} run(s)
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}
