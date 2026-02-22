import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';

import { cn, formatCurrency } from '../../lib/utils.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js';
import { Skeleton } from '../ui/skeleton.js';

export interface BalanceCardProps {
    balance: string;
    currency?: string;
    label?: string;
    trend?: { value: number; label: string };
    loading?: boolean;
}

export function BalanceCard({
    balance,
    currency = 'BBD',
    label,
    trend,
    loading = false,
}: BalanceCardProps) {
    if (loading) {
        return (
            <Card>
                <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-2 pb-0">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-5 rounded-full" />
                </CardHeader>
                <CardContent className="pt-4">
                    <Skeleton className="h-8 w-32" />
                    {trend !== undefined && <Skeleton className="mt-2 h-3 w-20" />}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-2 pb-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {label ?? 'Balance'}
                </CardTitle>
                <div className="flex size-8 items-center justify-center rounded-md border bg-muted/50 text-primary">
                    <Wallet className="h-4 w-4" />
                </div>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="text-2xl font-semibold tracking-tight md:text-3xl">
                    {formatCurrency(balance, currency)}
                </div>
                {trend ? (
                    <div
                        className={cn(
                            'mt-2 flex items-center gap-1 text-xs',
                            trend.value >= 0
                                ? 'text-green-700 dark:text-green-300'
                                : 'text-red-700 dark:text-red-300',
                        )}
                    >
                        {trend.value >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                        ) : (
                            <TrendingDown className="h-3 w-3" />
                        )}
                        <span>
                            {trend.value >= 0 ? '+' : ''}
                            {trend.value}% {trend.label}
                        </span>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
