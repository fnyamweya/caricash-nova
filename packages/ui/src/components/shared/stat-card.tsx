import { motion } from 'framer-motion';

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
            <Card className="overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-5 rounded" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-7 w-24" />
                    <Skeleton className="mt-1 h-3 w-28" />
                </CardContent>
            </Card>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
        >
            <Card className="group relative overflow-hidden">
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_42%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        {title}
                    </CardTitle>
                    {icon && (
                        <span className="text-muted-foreground">{icon}</span>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold tracking-tight">{value}</div>
                    {description && (
                        <p
                            className={cn(
                                'mt-1 text-xs text-muted-foreground',
                                trend === 'up' && 'text-green-700 dark:text-green-300',
                                trend === 'down' && 'text-red-700 dark:text-red-300',
                            )}
                        >
                            {description}
                        </p>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
}
