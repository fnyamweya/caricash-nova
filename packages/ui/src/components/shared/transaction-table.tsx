import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';

import { cn, formatCurrency, formatRelativeTime } from '../../lib/utils.js';
import { DataTable } from './data-table.js';
import { StatusBadge } from './status-badge.js';
import type { DataTableColumn } from './data-table.js';

export interface Transaction {
    id: string;
    type: string;
    entry_type?: 'DR' | 'CR';
    amount: string;
    currency: string;
    description: string;
    state: string;
    created_at: string;
}

const CREDIT_TYPES = new Set([
    'DEPOSIT',
    'CREDIT',
    'INCOMING',
    'RECEIVE',
    'REFUND',
]);

function isCredit(type: string, entryType?: 'DR' | 'CR'): boolean {
    if (entryType) {
        return entryType === 'CR';
    }
    return CREDIT_TYPES.has(type.toUpperCase());
}

export interface TransactionTableProps {
    transactions: Transaction[];
    loading?: boolean;
    onRowClick?: (tx: Transaction) => void;
}

export function TransactionTable({
    transactions,
    loading = false,
    onRowClick,
}: TransactionTableProps) {
    const columns: DataTableColumn<Transaction>[] = [
        {
            key: 'type',
            header: 'Type',
            render: (_, row) => {
                const credit = isCredit(row.type, row.entry_type);
                return (
                    <div className="flex items-center gap-2">
                        {credit ? (
                            <ArrowDownLeft className="h-4 w-4 text-green-600" />
                        ) : (
                            <ArrowUpRight className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium">{row.type}</span>
                    </div>
                );
            },
        },
        {
            key: 'description',
            header: 'Description',
        },
        {
            key: 'amount',
            header: 'Amount',
            className: 'text-right',
            render: (_, row) => {
                const credit = isCredit(row.type, row.entry_type);
                return (
                    <span
                        className={cn(
                            'font-medium',
                            credit ? 'text-green-600' : 'text-red-600',
                        )}
                    >
                        {credit ? '+' : '-'}
                        {formatCurrency(row.amount, row.currency)}
                    </span>
                );
            },
        },
        {
            key: 'state',
            header: 'Status',
            render: (_, row) => <StatusBadge status={row.state} size="sm" />,
        },
        {
            key: 'created_at',
            header: 'Date',
            render: (_, row) => (
                <span className="text-sm text-muted-foreground">
                    {formatRelativeTime(row.created_at)}
                </span>
            ),
        },
    ];

    return (
        <DataTable<Transaction>
            data={transactions}
            columns={columns}
            loading={loading}
            onRowClick={onRowClick}
            emptyMessage="No transactions yet"
        />
    );
}
