import { cn } from '../../lib/utils.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js';
import { Skeleton } from '../ui/skeleton.js';

export interface StatCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon?: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
    loading?: boolean;
}

export function StatCard({
    title,
    value,
    description,
    icon,
    trend,
    loading = false,
}: StatCardProps) {
    if (loading) {
        return (
            <Card>
                <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-2 pb-0">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-5 rounded" />
                </CardHeader>
                <CardContent className="pt-4">
                    <Skeleton className="h-7 w-24" />
                    <Skeleton className="mt-1 h-3 w-28" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-2 pb-0">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                    {title}
                </CardTitle>
                {icon ? <span className="text-muted-foreground">{icon}</span> : null}
            </CardHeader>
            <CardContent className="pt-4">
                <div className="text-2xl font-semibold tracking-tight">{value}</div>
                {description ? (
                    <p
                        className={cn(
                            'mt-1 text-xs text-muted-foreground',
                            trend === 'up' && 'text-green-700 dark:text-green-300',
                            trend === 'down' && 'text-red-700 dark:text-red-300',
                        )}
                    >
                        {description}
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );
}
