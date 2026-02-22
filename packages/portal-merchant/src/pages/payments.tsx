import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Search, Download } from 'lucide-react';
import {
    PageHeader,
    PageTransition,
    EmptyState,
    Card,
    CardContent,
    Badge,
    Button,
    Input,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    LoadingSpinner,
    useAuth,
    useApi,
    SectionBlock,
    SectionToolbar,
    formatCurrency,
    formatDate,
} from '@caricash/ui';

interface StatementEntry {
    journal_id: string;
    txn_type: string;
    posted_at: string;
    entry_type: 'DR' | 'CR';
    amount: string;
    line_description?: string;
    correlation_id: string;
    currency: string;
    debit_amount_minor?: number;
    credit_amount_minor?: number;
}

interface StatementResponse {
    entries: StatementEntry[];
    count: number;
    account_id: string;
}

/** Mask a msisdn: show first 3 + last 4, asterisks in between */
function maskMsisdn(msisdn: string): string {
    if (msisdn.length <= 7) return msisdn;
    return msisdn.slice(0, 3) + '****' + msisdn.slice(-4);
}

/** Extract counterparty info from description, masking PII */
function parseDescription(desc?: string): { label: string; detail: string } {
    if (!desc) return { label: 'Payment', detail: '' };
    // Descriptions often contain reference like "Payment from 246XXXXXXX" or "Customer <name>"
    const msisdnMatch = desc.match(/\d{10,15}/);
    if (msisdnMatch) {
        const masked = maskMsisdn(msisdnMatch[0]);
        return { label: desc.replace(msisdnMatch[0], masked), detail: masked };
    }
    return { label: desc, detail: '' };
}

function getTxnTypeBadge(txnType: string) {
    const normalized = txnType.toUpperCase();
    if (normalized.includes('PAYMENT')) return { label: 'Payment', variant: 'default' as const };
    if (normalized.includes('B2B')) return { label: 'B2B Transfer', variant: 'secondary' as const };
    if (normalized.includes('REVERSAL')) return { label: 'Reversal', variant: 'destructive' as const };
    if (normalized.includes('WITHDRAWAL')) return { label: 'Withdrawal', variant: 'outline' as const };
    if (normalized.includes('DEPOSIT')) return { label: 'Deposit', variant: 'default' as const };
    return { label: txnType, variant: 'secondary' as const };
}

export function PaymentsPage() {
    const { actor } = useAuth();
    const api = useApi();
    const [searchTerm, setSearchTerm] = useState('');

    const statementQuery = useQuery<StatementResponse>({
        queryKey: ['merchant-statement', actor?.id],
        queryFn: () =>
            api.get<StatementResponse>(
                `/wallets/MERCHANT/${actor!.id}/BBD/statement?limit=100`,
            ),
        enabled: !!actor?.id,
        refetchInterval: 30_000,
    });

    const entries = statementQuery.data?.entries ?? [];

    // Only show credit entries (incoming payments) by default
    const incomingPayments = entries.filter((e) => e.entry_type === 'CR');

    // Apply search filter
    const filtered = searchTerm
        ? incomingPayments.filter((e) => {
            const desc = parseDescription(e.line_description).label.toLowerCase();
            const type = e.txn_type.toLowerCase();
            const term = searchTerm.toLowerCase();
            return desc.includes(term) || type.includes(term) || e.journal_id.includes(term);
        })
        : incomingPayments;

    // Calculate totals
    const totalAmount = incomingPayments.reduce((sum, e) => {
        const amt = parseFloat(e.amount) || (e.credit_amount_minor ? e.credit_amount_minor / 100 : 0);
        return sum + amt;
    }, 0);

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Incoming Payments"
                    description="Track payments received from customers"
                />

                <SectionBlock
                    title="Payment Summary"
                    description="High-level totals for incoming customer payments."
                    contentClassName="space-y-0"
                >
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Card className="shadow-none">
                            <CardContent className="pt-6">
                                <div className="text-sm text-muted-foreground">Total Payments</div>
                                <div className="text-2xl font-bold">{incomingPayments.length}</div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-none">
                            <CardContent className="pt-6">
                                <div className="text-sm text-muted-foreground">Total Received</div>
                                <div className="text-2xl font-bold text-green-600">
                                    {formatCurrency(totalAmount.toFixed(2), 'BBD')}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-none">
                            <CardContent className="pt-6">
                                <div className="text-sm text-muted-foreground">Account</div>
                                <div className="text-sm font-mono truncate">
                                    {statementQuery.data?.account_id ?? '—'}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </SectionBlock>

                {/* Filters */}
                <SectionToolbar
                    title="Payment Controls"
                    description="Search incoming payments and prepare exports."
                    actions={(
                        <Button variant="outline" size="sm" disabled>
                            <Download className="mr-1 h-4 w-4" />
                            Export
                        </Button>
                    )}
                >
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search transactions..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Badge variant="outline">
                            {filtered.length} result{filtered.length === 1 ? '' : 's'}
                        </Badge>
                    </div>
                </SectionToolbar>

                {/* Table */}
                {statementQuery.isLoading ? (
                    <div className="flex justify-center py-12">
                        <LoadingSpinner />
                    </div>
                ) : filtered.length > 0 ? (
                    <SectionBlock
                        title="Incoming Payment Feed"
                        description="Credits posted to the merchant wallet."
                        contentClassName="p-0"
                    >
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Reference</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.map((entry) => {
                                        const { label } = parseDescription(entry.line_description);
                                        const badge = getTxnTypeBadge(entry.txn_type);
                                        const amount = entry.amount || ((entry.credit_amount_minor ?? 0) / 100).toFixed(2);
                                        return (
                                            <TableRow key={`${entry.journal_id}-${entry.entry_type}`}>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                    {formatDate(entry.posted_at)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={badge.variant}>{badge.label}</Badge>
                                                </TableCell>
                                                <TableCell className="max-w-[300px] truncate text-sm">
                                                    {label}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                    {entry.journal_id.slice(0, 12)}…
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-green-600">
                                                    +{formatCurrency(amount, entry.currency || 'BBD')}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                    </SectionBlock>
                ) : (
                    <SectionBlock
                        title="Incoming Payment Feed"
                        description="Payment history will populate when customer payments are posted."
                    >
                            <EmptyState
                                icon={<CreditCard />}
                                title="No payments yet"
                                description="Payment history will appear here once customers start paying at your store."
                            />
                    </SectionBlock>
                )}
            </div>
        </PageTransition>
    );
}
