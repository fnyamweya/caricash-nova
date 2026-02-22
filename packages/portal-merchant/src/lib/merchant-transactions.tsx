import type { ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export interface StatementEntry {
    journal_id: string;
    txn_type: string;
    posted_at: string;
    entry_type: 'DR' | 'CR';
    amount: string;
    line_description?: string;
    correlation_id?: string;
    currency?: string;
    debit_amount_minor?: number;
    credit_amount_minor?: number;
}

export interface StatementResponse {
    entries: StatementEntry[];
    count: number;
    account_id?: string;
}

export function isToday(dateStr: string): boolean {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth()
        && d.getDate() === now.getDate();
}

export function entryAmount(entry: StatementEntry): number {
    const parsed = Number.parseFloat(entry.amount);
    if (Number.isFinite(parsed)) return parsed;
    const minor = entry.entry_type === 'CR' ? entry.credit_amount_minor : entry.debit_amount_minor;
    return ((minor ?? 0) / 100);
}

export function entryDisplayAmount(entry: StatementEntry): string {
    return entry.amount || entryAmount(entry).toFixed(2);
}

export function maskMsisdn(msisdn: string): string {
    if (msisdn.length <= 7) return msisdn;
    return `${msisdn.slice(0, 3)}****${msisdn.slice(-4)}`;
}

export function parseMerchantDescription(desc?: string): { label: string; detail: string } {
    if (!desc) return { label: 'Payment', detail: '' };
    const msisdnMatch = desc.match(/\d{10,15}/);
    if (msisdnMatch) {
        const masked = maskMsisdn(msisdnMatch[0]);
        return { label: desc.replace(msisdnMatch[0], masked), detail: masked };
    }
    return { label: desc, detail: '' };
}

export function txnTypeBadge(txnType: string) {
    const normalized = txnType.toUpperCase();
    if (normalized.includes('PAYMENT')) return { label: 'Payment', tone: 'emerald' as const };
    if (normalized.includes('B2B')) return { label: 'Merchant Transfer', tone: 'blue' as const };
    if (normalized.includes('REVERSAL')) return { label: 'Reversal', tone: 'rose' as const };
    if (normalized.includes('WITHDRAWAL')) return { label: 'Withdrawal', tone: 'amber' as const };
    if (normalized.includes('DEPOSIT')) return { label: 'Deposit', tone: 'blue' as const };
    if (normalized.includes('COMMISSION')) return { label: 'Commission', tone: 'slate' as const };
    return { label: txnType, tone: 'slate' as const };
}

export function entryDirectionIcon(entry: StatementEntry): ReactNode {
    if (entry.entry_type === 'CR') return <ArrowDownLeft className="h-4 w-4" />;
    return <ArrowUpRight className="h-4 w-4" />;
}

export function directionTone(entry: StatementEntry): 'emerald' | 'rose' {
    return entry.entry_type === 'CR' ? 'emerald' : 'rose';
}
