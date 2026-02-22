import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, ArrowUpRight, ArrowDownLeft, Search } from 'lucide-react';
import {
    useAuth,
    useApi,
    PageHeader,
    PageTransition,
    Button,
    EmptyState,
    Badge,
    Input,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    LoadingSpinner,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
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

function getTxnTypeBadge(txnType: string) {
    const n = txnType.toUpperCase();
    if (n.includes('PAYMENT')) return { label: 'Payment', variant: 'default' as const };
    if (n.includes('B2B')) return { label: 'B2B Transfer', variant: 'secondary' as const };
    if (n.includes('REVERSAL')) return { label: 'Reversal', variant: 'destructive' as const };
    if (n.includes('WITHDRAWAL')) return { label: 'Withdrawal', variant: 'outline' as const };
    if (n.includes('DEPOSIT')) return { label: 'Deposit', variant: 'default' as const };
    if (n.includes('COMMISSION')) return { label: 'Commission', variant: 'secondary' as const };
    return { label: txnType, variant: 'secondary' as const };
}

export function HistoryPage() {
    const { actor } = useAuth();
    const api = useApi();
    const [tab, setTab] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const statementQuery = useQuery<StatementResponse>({
        queryKey: ['merchant-statement-history', actor?.id],
        queryFn: () =>
            api.get<StatementResponse>(
                `/wallets/MERCHANT/${actor!.id}/BBD/statement?limit=200`,
            ),
        enabled: !!actor?.id,
    });

    const entries = statementQuery.data?.entries ?? [];

    // Filter by tab
    const tabFiltered = tab === 'all'
        ? entries
        : tab === 'incoming'
            ? entries.filter((e) => e.entry_type === 'CR')
            : entries.filter((e) => e.entry_type === 'DR');

    // Search filter
    const filtered = searchTerm
        ? tabFiltered.filter((e) => {
            const term = searchTerm.toLowerCase();
            return (e.line_description ?? '').toLowerCase().includes(term)
                || e.txn_type.toLowerCase().includes(term)
                || e.journal_id.includes(term);
        })
        : tabFiltered;

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Transaction History"
                    description="View your past transactions"
                />

                <Tabs value={tab} onValueChange={setTab}>
                    <SectionToolbar
                        title="History Controls"
                        description="Filter and search merchant activity across incoming and outgoing postings."
                        actions={(
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void statementQuery.refetch()}
                                disabled={statementQuery.isFetching}
                            >
                                {statementQuery.isFetching ? 'Refreshing…' : 'Refresh'}
                            </Button>
                        )}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <TabsList className="h-auto flex-wrap justify-start">
                                <TabsTrigger value="all">All ({entries.length})</TabsTrigger>
                                <TabsTrigger value="incoming">
                                    Incoming ({entries.filter((e) => e.entry_type === 'CR').length})
                                </TabsTrigger>
                                <TabsTrigger value="outgoing">
                                    Outgoing ({entries.filter((e) => e.entry_type === 'DR').length})
                                </TabsTrigger>
                            </TabsList>
                            <div className="relative max-w-sm min-w-[220px] flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                    </SectionToolbar>

                    {/* Shared content across all tabs */}
                    {['all', 'incoming', 'outgoing'].map((t) => (
                        <TabsContent key={t} value={t}>
                            {statementQuery.isLoading ? (
                                <div className="flex justify-center py-12">
                                    <LoadingSpinner />
                                </div>
                            ) : filtered.length > 0 ? (
                                <SectionBlock
                                    title="Transaction Table"
                                    description="Merchant wallet statement entries for the selected filters."
                                    contentClassName="p-0"
                                >
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-8"></TableHead>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead>Type</TableHead>
                                                    <TableHead>Description</TableHead>
                                                    <TableHead>Reference</TableHead>
                                                    <TableHead className="text-right">Amount</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filtered.map((entry) => {
                                                    const isCredit = entry.entry_type === 'CR';
                                                    const badge = getTxnTypeBadge(entry.txn_type);
                                                    const amount = entry.amount
                                                        || ((isCredit ? entry.credit_amount_minor : entry.debit_amount_minor) ?? 0 / 100).toFixed(2);
                                                    return (
                                                        <TableRow key={`${entry.journal_id}-${entry.entry_type}`}>
                                                            <TableCell>
                                                                {isCredit ? (
                                                                    <ArrowDownLeft className="h-4 w-4 text-green-500" />
                                                                ) : (
                                                                    <ArrowUpRight className="h-4 w-4 text-red-500" />
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                                {formatDate(entry.posted_at)}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant={badge.variant}>{badge.label}</Badge>
                                                            </TableCell>
                                                            <TableCell className="max-w-[300px] truncate text-sm">
                                                                {entry.line_description ?? '—'}
                                                            </TableCell>
                                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                                {entry.journal_id.slice(0, 12)}…
                                                            </TableCell>
                                                            <TableCell className={`text-right font-medium ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                                                                {isCredit ? '+' : '-'}{formatCurrency(amount, entry.currency || 'BBD')}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                </SectionBlock>
                            ) : (
                                <SectionBlock
                                    title="Transaction Table"
                                    description="No entries matched the current tab and search filters."
                                >
                                        <EmptyState
                                            icon={<Clock />}
                                            title="No transactions yet"
                                            description="Transaction history will appear here once you start receiving or sending payments."
                                        />
                                </SectionBlock>
                            )}
                        </TabsContent>
                    ))}
                </Tabs>
            </div>
        </PageTransition>
    );
}
