import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
    DataTable,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from '@caricash/ui';
import { ModulePage } from '../components/module-page.js';

interface JournalLine {
    id: string;
    account_id: string;
    entry_type: 'DR' | 'CR';
    amount: string;
}

interface JournalLineRow {
    line_id: string;
    account_label: string;
    account_id: string;
    direction: 'DR' | 'CR';
    amount: string;
    currency: string;
}

interface JournalResponse {
    journal: {
        id: string;
        txn_type: string;
        status: string;
        created_at: string;
        [key: string]: unknown;
    };
    lines: JournalLine[];
}

interface IntegrityResult {
    ok: boolean;
    checked_from: string;
    checked_to: string;
    errors: string[];
    [key: string]: unknown;
}

const journalLineColumns = [
    { key: 'line_id' as const, header: 'Line ID' },
    {
        key: 'account_label' as const,
        header: 'Account',
        render: (_value: unknown, row: JournalLineRow) => (
            <div className="flex flex-col">
                <span className="font-medium">Ledger Account</span>
                <span className="text-xs text-muted-foreground">{row.account_id.toLowerCase()}</span>
            </div>
        ),
    },
    { key: 'direction' as const, header: 'Direction' },
    { key: 'amount' as const, header: 'Amount' },
    { key: 'currency' as const, header: 'Currency' },
];

export function LedgerPage() {
    const api = useApi();

    // Journal lookup state
    const [journalId, setJournalId] = useState('');
    const [journalResult, setJournalResult] = useState<JournalResponse | null>(null);

    // Integrity check state
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
            const params = new URLSearchParams({ from: fromDate, to: toDate });
            return api.get<IntegrityResult>(`/ops/ledger/verify?${params.toString()}`);
        },
        onSuccess: (res) => {
            setIntegrityResult(res);
        },
    });

    const journalLineRows: JournalLineRow[] =
        journalResult?.lines.map((line) => ({
            line_id: line.id,
            account_label: 'Ledger Account',
            account_id: line.account_id,
            direction: line.entry_type,
            amount: line.amount,
            currency: String(journalResult.journal.currency ?? ''),
        })) ?? [];

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
                    <TabsList className="h-auto flex-wrap justify-start">
                        <TabsTrigger value="journal">Journal Lookup</TabsTrigger>
                        <TabsTrigger value="integrity">Integrity Check</TabsTrigger>
                    </TabsList>

                    {/* Journal Lookup */}
                    <TabsContent value="journal">
                        <div className="flex flex-col gap-4">
                            <Card className="max-w-lg">
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        journalMutation.mutate();
                                    }}
                                >
                                    <CardHeader>
                                        <CardTitle className="text-base">Look Up Journal</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex flex-col gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <Label htmlFor="journal-id">Journal ID</Label>
                                            <Input
                                                id="journal-id"
                                                type="text"
                                                placeholder="Enter journal ID"
                                                value={journalId}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJournalId(e.target.value)}
                                                required
                                            />
                                        </div>
                                        {journalMutation.isError && (
                                            <p className="text-sm text-destructive">
                                                {journalMutation.error?.message ?? 'Failed to fetch journal.'}
                                            </p>
                                        )}
                                    </CardContent>
                                    <CardFooter>
                                        <Button
                                            type="submit"
                                            className="w-full"
                                            disabled={journalMutation.isPending || !journalId}
                                        >
                                            {journalMutation.isPending ? 'Fetching…' : 'Look Up'}
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Card>

                            {journalResult && (
                                <div className="flex flex-col gap-4">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Journal Details</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                                                <p>
                                                    <span className="font-medium">ID:</span>{' '}
                                                    {journalResult.journal.id}
                                                </p>
                                                <p>
                                                    <span className="font-medium">Type:</span>{' '}
                                                    {journalResult.journal.txn_type}
                                                </p>
                                                <p>
                                                    <span className="font-medium">Status:</span>{' '}
                                                    {journalResult.journal.status}
                                                </p>
                                                <p>
                                                    <span className="font-medium">Created:</span>{' '}
                                                    {journalResult.journal.created_at}
                                                </p>
                                            </div>
                                        </CardContent>
                                    </Card>

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
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    {/* Integrity Check */}
                    <TabsContent value="integrity">
                        <div className="flex flex-col gap-4">
                            <Card className="max-w-lg">
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        integrityMutation.mutate();
                                    }}
                                >
                                    <CardHeader>
                                        <CardTitle className="text-base">Verify Ledger Integrity</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex flex-col gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <Label htmlFor="integrity-from">From</Label>
                                            <Input
                                                id="integrity-from"
                                                type="datetime-local"
                                                value={fromDate}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromDate(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <Label htmlFor="integrity-to">To</Label>
                                            <Input
                                                id="integrity-to"
                                                type="datetime-local"
                                                value={toDate}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToDate(e.target.value)}
                                                required
                                            />
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
                                            className="w-full"
                                            disabled={integrityMutation.isPending || !fromDate || !toDate}
                                        >
                                            {integrityMutation.isPending ? 'Verifying…' : 'Run Integrity Check'}
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Card>

                            {integrityResult && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Integrity Result</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="rounded-md bg-muted p-4 text-sm flex flex-col gap-2">
                                            <p>
                                                <span className="font-medium">Status:</span>{' '}
                                                <span
                                                    className={
                                                        integrityResult.ok ? 'text-green-500' : 'text-red-500'
                                                    }
                                                >
                                                    {integrityResult.ok ? 'OK ✓' : 'ERRORS FOUND ✗'}
                                                </span>
                                            </p>
                                            <p>
                                                <span className="font-medium">Range:</span>{' '}
                                                {integrityResult.checked_from} → {integrityResult.checked_to}
                                            </p>
                                            {integrityResult.errors.length > 0 && (
                                                <div className="mt-2">
                                                    <p className="font-medium text-red-500 mb-1">Errors:</p>
                                                    <ul className="list-disc list-inside space-y-1">
                                                        {integrityResult.errors.map((err, i) => (
                                                            <li key={i}>{err}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </ModulePage>
        </PageTransition>
    );
}
