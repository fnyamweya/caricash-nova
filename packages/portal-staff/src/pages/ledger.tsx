import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
    AlertTriangle,
    BookOpen,
    CalendarRange,
    FileSearch,
    Layers,
    Lock,
    Scale,
    ShieldCheck,
    Sigma,
} from 'lucide-react';
import {
    useApi,
    PageTransition,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardFooter,
    Input,
    Label,
    Button,
    Badge,
    DataTable,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    StatCard,
    SectionBlock,
    SectionToolbar,
    formatCurrency,
    formatDate,
} from '@caricash/ui';
import { ModulePage } from '../components/module-page.js';

interface JournalLine {
    id: string;
    journal_id: string;
    account_id: string;
    entry_type: 'DR' | 'CR';
    amount: string;
    description?: string;
    created_at?: string;
}

interface JournalRow {
    id: string;
    txn_type: string;
    state?: string;
    status?: string;
    currency?: string;
    correlation_id?: string;
    idempotency_key?: string;
    description?: string;
    created_at: string;
    [key: string]: unknown;
}

interface JournalLineRow {
    line_id: string;
    account_id: string;
    direction: 'DR' | 'CR';
    amount: string;
    currency: string;
    posted_at: string;
}

interface JournalResponse {
    journal: JournalRow;
    lines: JournalLine[];
}

interface IntegrityResult {
    ok: boolean;
    checked_from: string;
    checked_to: string;
    errors?: string[];
    [key: string]: unknown;
}

interface TrialBalanceRow {
    coa_code: string;
    account_name: string;
    account_class: string;
    currency: string;
    total_debit_minor: number;
    total_credit_minor: number;
    net_balance_minor: number;
}

interface CoaRow {
    code: string;
    name: string;
    account_class: string;
    normal_balance: string;
    parent_code?: string;
    is_header: boolean | number;
    ifrs_mapping?: string;
    active_from: string;
    active_to?: string;
}

interface AccountingPeriodRow {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    status: string;
    closed_by?: string;
    closed_at?: string;
}

const journalLineColumns = [
    { key: 'line_id' as const, header: 'Line ID' },
    {
        key: 'account_id' as const,
        header: 'Account',
        render: (value: unknown) => (
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {String(value)}
            </span>
        ),
    },
    {
        key: 'direction' as const,
        header: 'Direction',
        render: (value: unknown) => {
            const direction = value === 'CR' ? 'CR' : 'DR';
            return (
                <Badge variant={direction === 'DR' ? 'outline' : 'secondary'}>
                    {direction === 'DR' ? 'Debit' : 'Credit'}
                </Badge>
            );
        },
    },
    {
        key: 'amount' as const,
        header: 'Amount',
        className: 'whitespace-nowrap font-semibold',
        render: (value: unknown, row: JournalLineRow) =>
            formatCurrency(String(value ?? '0.00'), row.currency || 'BBD'),
    },
    {
        key: 'posted_at' as const,
        header: 'Posted',
        render: (value: unknown) => {
            const raw = String(value ?? '');
            return raw ? formatDate(raw) : '—';
        },
    },
];

const trialBalanceColumns = [
    { key: 'coa_code' as const, header: 'Code' },
    { key: 'account_name' as const, header: 'Account' },
    {
        key: 'account_class' as const,
        header: 'Class',
        render: (v: unknown) => <Badge variant="outline">{String(v)}</Badge>,
    },
    { key: 'currency' as const, header: 'Ccy' },
    {
        key: 'total_debit_minor' as const,
        header: 'Total Debit',
        className: 'whitespace-nowrap font-semibold text-right',
        render: (v: unknown, row: TrialBalanceRow) => formatCurrency(Number(v) / 100, row.currency || 'BBD'),
    },
    {
        key: 'total_credit_minor' as const,
        header: 'Total Credit',
        className: 'whitespace-nowrap font-semibold text-right',
        render: (v: unknown, row: TrialBalanceRow) => formatCurrency(Number(v) / 100, row.currency || 'BBD'),
    },
    {
        key: 'net_balance_minor' as const,
        header: 'Net Balance',
        className: 'whitespace-nowrap font-bold text-right',
        render: (v: unknown, row: TrialBalanceRow) => formatCurrency(Number(v) / 100, row.currency || 'BBD'),
    },
];

const coaColumns = [
    { key: 'code' as const, header: 'Code' },
    { key: 'name' as const, header: 'Account Name' },
    {
        key: 'account_class' as const,
        header: 'Class',
        render: (v: unknown) => <Badge variant="outline">{String(v)}</Badge>,
    },
    {
        key: 'normal_balance' as const,
        header: 'Normal',
        render: (v: unknown) => <Badge variant={v === 'DEBIT' ? 'default' : 'secondary'}>{String(v)}</Badge>,
    },
    { key: 'parent_code' as const, header: 'Parent', render: (v: unknown) => String(v || '—') },
    {
        key: 'is_header' as const,
        header: 'Header',
        render: (v: unknown) => (v ? 'Yes' : '—'),
    },
    { key: 'ifrs_mapping' as const, header: 'IFRS', render: (v: unknown) => String(v || '—') },
];

const periodColumns = [
    { key: 'name' as const, header: 'Period' },
    { key: 'start_date' as const, header: 'Start', render: (v: unknown) => formatDate(String(v ?? '')) },
    { key: 'end_date' as const, header: 'End', render: (v: unknown) => formatDate(String(v ?? '')) },
    {
        key: 'status' as const,
        header: 'Status',
        render: (v: unknown) => {
            const s = String(v);
            const variant = s === 'OPEN' ? 'default' : s === 'LOCKED' ? 'destructive' : 'secondary';
            return <Badge variant={variant}>{s}</Badge>;
        },
    },
    {
        key: 'closed_at' as const,
        header: 'Closed',
        render: (v: unknown) => (v ? formatDate(String(v)) : '—'),
    },
];

function toNumber(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function toDateTimeLocalInput(date: Date): string {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

function toIsoLocal(value: string): string {
    if (!value) {
        return '';
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function LedgerPage() {
    const api = useApi();

    const [journalId, setJournalId] = useState('');
    const [journalResult, setJournalResult] = useState<JournalResponse | null>(null);

    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [integrityResult, setIntegrityResult] = useState<IntegrityResult | null>(null);

    const journalMutation = useMutation({
        mutationFn: async () => {
            return api.get<JournalResponse>(`/ops/ledger/journal/${journalId}`);
        },
        onSuccess: (res) => {
            setJournalResult(res);
        },
    });

    const integrityMutation = useMutation({
        mutationFn: async () => {
            const params = new URLSearchParams({
                from: toIsoLocal(fromDate),
                to: toIsoLocal(toDate),
            });
            return api.get<IntegrityResult>(`/ops/ledger/verify?${params.toString()}`);
        },
        onSuccess: (res) => {
            setIntegrityResult(res);
        },
    });

    const journalLineRows: JournalLineRow[] =
        journalResult?.lines.map((line) => ({
            line_id: line.id,
            account_id: line.account_id,
            direction: line.entry_type,
            amount: line.amount,
            currency: String(journalResult.journal.currency ?? 'BBD'),
            posted_at: String(line.created_at ?? journalResult.journal.created_at),
        })) ?? [];

    const journalState = String(
        journalResult?.journal.state ?? journalResult?.journal.status ?? 'UNKNOWN',
    ).toUpperCase();

    const journalMetrics = useMemo(() => {
        const debitTotal = journalLineRows
            .filter((line) => line.direction === 'DR')
            .reduce((sum, line) => sum + toNumber(line.amount), 0);
        const creditTotal = journalLineRows
            .filter((line) => line.direction === 'CR')
            .reduce((sum, line) => sum + toNumber(line.amount), 0);

        const delta = Math.abs(debitTotal - creditTotal);

        return {
            lineCount: journalLineRows.length,
            debitCount: journalLineRows.filter((line) => line.direction === 'DR').length,
            creditCount: journalLineRows.filter((line) => line.direction === 'CR').length,
            debitTotal,
            creditTotal,
            delta,
            balanced: delta < 0.0001,
        };
    }, [journalLineRows]);

    const integrityErrors = useMemo(() => {
        if (!Array.isArray(integrityResult?.errors)) {
            return [] as string[];
        }

        return integrityResult.errors.map((error) => String(error));
    }, [integrityResult]);

    const checkedFromLabel = useMemo(() => {
        const raw = String(integrityResult?.checked_from ?? '').trim();
        return raw ? formatDate(raw) : '—';
    }, [integrityResult]);

    const checkedToLabel = useMemo(() => {
        const raw = String(integrityResult?.checked_to ?? '').trim();
        return raw ? formatDate(raw) : '—';
    }, [integrityResult]);

    function applyIntegrityPreset(hoursBack: number): void {
        const now = new Date();
        const from = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

        setFromDate(toDateTimeLocalInput(from));
        setToDate(toDateTimeLocalInput(now));
    }

    return (
        <PageTransition>
            <ModulePage
                module="Controls"
                title="Ledger Inspection"
                description="Inspect journal activity and verify double-entry ledger integrity"
                playbook={[
                    'Validate journal ID and source context before investigation.',
                    'Run integrity checks over explicit time windows.',
                    'Escalate and track each ledger error as a control incident.',
                ]}
            >
                <Tabs defaultValue="journal">
                    <SectionToolbar
                        title="Ledger Workbench"
                        description="Switch between journal lookup, integrity verification, and accounting reporting tabs."
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <TabsList className="h-auto flex-wrap justify-start">
                                <TabsTrigger value="journal">Journal Lookup</TabsTrigger>
                                <TabsTrigger value="integrity">Integrity Check</TabsTrigger>
                                <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
                                <TabsTrigger value="coa">Chart of Accounts</TabsTrigger>
                                <TabsTrigger value="periods">Accounting Periods</TabsTrigger>
                            </TabsList>
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">Controls</Badge>
                                <Badge variant="outline">Accounting</Badge>
                            </div>
                        </div>
                    </SectionToolbar>

                    <TabsContent value="journal">
                        <div className="space-y-4">
                            <SectionToolbar
                                title="Journal Lookup Controls"
                                description="Search for a journal ID, inspect posting lines, and validate debit-credit balance."
                            />
                            <Card>
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        journalMutation.mutate();
                                    }}
                                >
                                    <CardHeader>
                                        <CardTitle className="text-base">Look Up Journal</CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="journal-id">Journal ID</Label>
                                            <Input
                                                id="journal-id"
                                                type="text"
                                                placeholder="Enter journal ID"
                                                value={journalId}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                    setJournalId(e.target.value)
                                                }
                                                required
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Journal lookup loads metadata, posting lines, and debit-credit validation.
                                            </p>
                                        </div>
                                        <Button
                                            type="submit"
                                            className="w-full min-w-[180px] lg:w-auto"
                                            disabled={journalMutation.isPending || !journalId}
                                        >
                                            {journalMutation.isPending ? 'Fetching…' : 'Look Up Journal'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full lg:w-auto"
                                            onClick={() => {
                                                setJournalId('');
                                                setJournalResult(null);
                                            }}
                                        >
                                            Clear
                                        </Button>

                                        {journalMutation.isError && (
                                            <p className="text-sm text-destructive lg:col-span-3">
                                                {journalMutation.error?.message ?? 'Failed to fetch journal.'}
                                            </p>
                                        )}
                                    </CardContent>
                                </form>
                            </Card>

                            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                                <StatCard
                                    title="Journal State"
                                    value={journalResult ? journalState : '—'}
                                    description="Posting status"
                                    icon={<ShieldCheck className="h-4 w-4" />}
                                    loading={journalMutation.isPending}
                                />
                                <StatCard
                                    title="Line Count"
                                    value={journalResult ? journalMetrics.lineCount : '—'}
                                    description="Total ledger lines"
                                    icon={<FileSearch className="h-4 w-4" />}
                                    loading={journalMutation.isPending}
                                />
                                <StatCard
                                    title="Debit Total"
                                    value={
                                        journalResult
                                            ? formatCurrency(journalMetrics.debitTotal, String(journalResult.journal.currency ?? 'BBD'))
                                            : '—'
                                    }
                                    description={`${journalMetrics.debitCount} debit line(s)`}
                                    icon={<Sigma className="h-4 w-4" />}
                                    loading={journalMutation.isPending}
                                />
                                <StatCard
                                    title="Credit Total"
                                    value={
                                        journalResult
                                            ? formatCurrency(journalMetrics.creditTotal, String(journalResult.journal.currency ?? 'BBD'))
                                            : '—'
                                    }
                                    description={`${journalMetrics.creditCount} credit line(s)`}
                                    icon={<Scale className="h-4 w-4" />}
                                    loading={journalMutation.isPending}
                                />
                            </div>

                            {journalResult ? (
                                <>
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <Card className="h-full">
                                            <CardHeader>
                                                <CardTitle className="text-base">Journal Snapshot</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3 text-sm">
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <div>
                                                        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Journal ID</p>
                                                        <p className="font-medium break-all">{journalResult.journal.id}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Transaction Type</p>
                                                        <p className="font-medium">{journalResult.journal.txn_type}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Currency</p>
                                                        <p className="font-medium">{String(journalResult.journal.currency ?? 'BBD')}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Created</p>
                                                        <p className="font-medium">{formatDate(journalResult.journal.created_at)}</p>
                                                    </div>
                                                    <div className="sm:col-span-2">
                                                        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Correlation ID</p>
                                                        <p className="font-medium break-all">
                                                            {String(journalResult.journal.correlation_id ?? '—')}
                                                        </p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card className="h-full">
                                            <CardHeader>
                                                <CardTitle className="text-base">Balance Validation</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3 text-sm">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-medium">Double-entry check:</span>
                                                    <Badge variant={journalMetrics.balanced ? 'secondary' : 'default'}>
                                                        {journalMetrics.balanced ? 'Balanced' : 'Out of Balance'}
                                                    </Badge>
                                                </div>
                                                <div className="grid gap-2 sm:grid-cols-3">
                                                    <p>
                                                        Debit total: <span className="font-medium">{formatCurrency(journalMetrics.debitTotal, String(journalResult.journal.currency ?? 'BBD'))}</span>
                                                    </p>
                                                    <p>
                                                        Credit total: <span className="font-medium">{formatCurrency(journalMetrics.creditTotal, String(journalResult.journal.currency ?? 'BBD'))}</span>
                                                    </p>
                                                    <p>
                                                        Difference: <span className="font-medium">{formatCurrency(journalMetrics.delta, String(journalResult.journal.currency ?? 'BBD'))}</span>
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Journal Lines</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <DataTable
                                                data={journalLineRows}
                                                columns={journalLineColumns}
                                                emptyMessage="No journal lines"
                                            />
                                        </CardContent>
                                    </Card>
                                </>
                            ) : (
                                <Card className="min-h-[240px]">
                                    <CardHeader>
                                        <CardTitle className="text-base">Journal Results</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                        Search for a journal ID to load metadata, line breakdown, and balance validation.
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="integrity">
                        <div className="space-y-4">
                            <SectionToolbar
                                title="Integrity Check Controls"
                                description="Run double-entry integrity verification over an explicit date-time window."
                            />
                            <Card>
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        integrityMutation.mutate();
                                    }}
                                >
                                    <CardHeader>
                                        <CardTitle className="text-base">Verify Ledger Integrity</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid gap-4 lg:grid-cols-2">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="integrity-from">From</Label>
                                                <Input
                                                    id="integrity-from"
                                                    type="datetime-local"
                                                    value={fromDate}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                        setFromDate(e.target.value)
                                                    }
                                                    required
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="integrity-to">To</Label>
                                                <Input
                                                    id="integrity-to"
                                                    type="datetime-local"
                                                    value={toDate}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                        setToDate(e.target.value)
                                                    }
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <Button type="button" size="sm" variant="outline" onClick={() => applyIntegrityPreset(24)}>
                                                <CalendarRange className="h-4 w-4" />
                                                Last 24h
                                            </Button>
                                            <Button type="button" size="sm" variant="outline" onClick={() => applyIntegrityPreset(24 * 7)}>
                                                <CalendarRange className="h-4 w-4" />
                                                Last 7d
                                            </Button>
                                            <Button type="button" size="sm" variant="outline" onClick={() => applyIntegrityPreset(24 * 30)}>
                                                <CalendarRange className="h-4 w-4" />
                                                Last 30d
                                            </Button>
                                        </div>

                                        {integrityMutation.isError && (
                                            <p className="text-sm text-destructive">
                                                {integrityMutation.error?.message ?? 'Integrity check failed.'}
                                            </p>
                                        )}
                                    </CardContent>
                                    <CardFooter>
                                        <Button
                                            type="submit"
                                            className="w-full sm:w-auto"
                                            disabled={integrityMutation.isPending || !fromDate || !toDate}
                                        >
                                            {integrityMutation.isPending ? 'Verifying…' : 'Run Integrity Check'}
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Card>

                            {integrityResult ? (
                                <>
                                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                        <StatCard
                                            title="Result"
                                            value={integrityResult.ok ? 'Passed' : 'Failed'}
                                            description={integrityResult.ok ? 'No integrity violations' : 'Issues detected'}
                                            icon={
                                                integrityResult.ok ? (
                                                    <ShieldCheck className="h-4 w-4" />
                                                ) : (
                                                    <AlertTriangle className="h-4 w-4" />
                                                )
                                            }
                                        />
                                        <StatCard
                                            title="Error Count"
                                            value={integrityErrors.length}
                                            description="Returned validation issues"
                                            icon={<AlertTriangle className="h-4 w-4" />}
                                        />
                                        <StatCard
                                            title="Checked From"
                                            value={checkedFromLabel}
                                            description="Start boundary"
                                            icon={<CalendarRange className="h-4 w-4" />}
                                        />
                                        <StatCard
                                            title="Checked To"
                                            value={checkedToLabel}
                                            description="End boundary"
                                            icon={<CalendarRange className="h-4 w-4" />}
                                        />
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <Card className="h-full">
                                            <CardHeader>
                                                <CardTitle className="text-base">Integrity Findings</CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                {integrityErrors.length > 0 ? (
                                                    <ul className="space-y-2">
                                                        {integrityErrors.map((error, index) => (
                                                            <li
                                                                key={`${index}-${error}`}
                                                                className="rounded-xl border border-red-400/30 bg-red-500/5 px-3 py-2 text-sm"
                                                            >
                                                                <span className="font-semibold">#{index + 1}</span>{' '}
                                                                {error}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">
                                                        No errors were reported for this range.
                                                    </p>
                                                )}
                                            </CardContent>
                                        </Card>

                                        <Card className="h-full">
                                            <CardHeader>
                                                <CardTitle className="text-base">Control Actions</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-2 text-sm text-muted-foreground">
                                                <p>1. Save the check range and result in the control log.</p>
                                                <p>2. Open investigation tickets for each finding and assign owners.</p>
                                                <p>3. Re-run integrity verification after remediation deployment.</p>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </TabsContent>

                    <TrialBalanceTab />
                    <ChartOfAccountsTab />
                    <AccountingPeriodsTab />
                </Tabs>
            </ModulePage>
        </PageTransition>
    );
}

// ===========================================================================
// V2 Accounting Tabs
// ===========================================================================

function TrialBalanceTab() {
    const api = useApi();
    const [currency, setCurrency] = useState('BBD');

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['trial-balance', currency],
        queryFn: () => api.get<{ rows: TrialBalanceRow[]; count: number }>(`/ops/accounting/reports/trial-balance?currency=${currency}`),
        enabled: false,
    });

    const rows = data?.rows ?? [];
    const totalDebit = rows.reduce((s, r) => s + Number(r.total_debit_minor), 0);
    const totalCredit = rows.reduce((s, r) => s + Number(r.total_credit_minor), 0);

    return (
        <TabsContent value="trial-balance">
            <div className="space-y-4">
                <SectionToolbar
                    title="Trial Balance Controls"
                    description="Select a currency and load a trial balance snapshot for review."
                >
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="space-y-1.5">
                            <Label>Currency</Label>
                            <Input value={currency} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrency(e.target.value)} className="w-28" />
                        </div>
                        <Button onClick={() => refetch()} disabled={isLoading}>
                            {isLoading ? 'Loading…' : 'Load Trial Balance'}
                        </Button>
                    </div>
                </SectionToolbar>

                <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard title="Total Debits" value={formatCurrency(totalDebit / 100, currency)} icon={<Sigma className="h-4 w-4" />} loading={isLoading} />
                    <StatCard title="Total Credits" value={formatCurrency(totalCredit / 100, currency)} icon={<Sigma className="h-4 w-4" />} loading={isLoading} />
                    <StatCard
                        title="Balance Check"
                        value={Math.abs(totalDebit - totalCredit) < 1 ? 'Balanced' : 'Out of Balance'}
                        icon={<Scale className="h-4 w-4" />}
                        loading={isLoading}
                    />
                </div>

                <SectionBlock
                    title="Trial Balance Table"
                    description="General ledger balances by chart of accounts code."
                >
                    <DataTable data={rows} columns={trialBalanceColumns} emptyMessage="Load a trial balance to view data" />
                </SectionBlock>
            </div>
        </TabsContent>
    );
}

function ChartOfAccountsTab() {
    const api = useApi();

    const { data, isLoading } = useQuery({
        queryKey: ['coa'],
        queryFn: () => api.get<{ accounts: CoaRow[]; count: number }>('/ops/accounting/coa'),
    });

    const accounts = data?.accounts ?? [];
    const headers = accounts.filter((a) => a.is_header);
    const leaves = accounts.filter((a) => !a.is_header);

    return (
        <TabsContent value="coa">
            <div className="space-y-4">
                <SectionToolbar
                    title="Chart of Accounts Overview"
                    description="Review the active chart structure and account metadata."
                />

                <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard title="Total Accounts" value={accounts.length} icon={<BookOpen className="h-4 w-4" />} loading={isLoading} />
                    <StatCard title="Header Accounts" value={headers.length} icon={<Layers className="h-4 w-4" />} loading={isLoading} />
                    <StatCard title="Leaf Accounts" value={leaves.length} icon={<FileSearch className="h-4 w-4" />} loading={isLoading} />
                </div>

                <SectionBlock
                    title="Chart of Accounts"
                    description="Ledger account hierarchy and reporting classifications."
                >
                    <DataTable data={accounts} columns={coaColumns} emptyMessage="No chart of accounts found" />
                </SectionBlock>
            </div>
        </TabsContent>
    );
}

function AccountingPeriodsTab() {
    const api = useApi();

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['accounting-periods'],
        queryFn: () => api.get<{ periods: AccountingPeriodRow[]; count: number }>('/ops/accounting/periods'),
    });

    const closePeriodMutation = useMutation({
        mutationFn: (periodId: string) => api.post(`/ops/accounting/periods/${periodId}/close`, {}),
        onSuccess: () => { refetch(); },
    });

    const lockPeriodMutation = useMutation({
        mutationFn: (periodId: string) => api.post(`/ops/accounting/periods/${periodId}/lock`, {}),
        onSuccess: () => { refetch(); },
    });

    const periods = data?.periods ?? [];
    const openCount = periods.filter((p) => p.status === 'OPEN').length;
    const closedCount = periods.filter((p) => p.status === 'CLOSED').length;
    const lockedCount = periods.filter((p) => p.status === 'LOCKED').length;

    const periodActionColumns = [
        ...periodColumns,
        {
            key: 'id' as const,
            header: 'Actions',
            render: (_v: unknown, row: AccountingPeriodRow) => {
                if (row.status === 'OPEN') {
                    return (
                        <Button size="sm" variant="outline" onClick={() => closePeriodMutation.mutate(row.id)} disabled={closePeriodMutation.isPending}>
                            Close
                        </Button>
                    );
                }
                if (row.status === 'CLOSED') {
                    return (
                        <Button size="sm" variant="destructive" onClick={() => lockPeriodMutation.mutate(row.id)} disabled={lockPeriodMutation.isPending}>
                            <Lock className="mr-1 h-3 w-3" /> Lock
                        </Button>
                    );
                }
                return <Badge variant="secondary">Locked</Badge>;
            },
        },
    ];

    return (
        <TabsContent value="periods">
            <div className="space-y-4">
                <SectionToolbar
                    title="Accounting Period Controls"
                    description="Monitor period lifecycle state and execute close/lock transitions."
                />

                <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard title="Open Periods" value={openCount} icon={<BookOpen className="h-4 w-4" />} loading={isLoading} />
                    <StatCard title="Closed Periods" value={closedCount} icon={<ShieldCheck className="h-4 w-4" />} loading={isLoading} />
                    <StatCard title="Locked Periods" value={lockedCount} icon={<Lock className="h-4 w-4" />} loading={isLoading} />
                </div>

                <SectionBlock
                    title="Accounting Periods"
                    description="Current period status, closure progress, and locking actions."
                >
                    <DataTable data={periods} columns={periodActionColumns} emptyMessage="No accounting periods found" />
                </SectionBlock>
            </div>
        </TabsContent>
    );
}
