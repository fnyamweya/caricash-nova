import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '../ui/card.js';
import { Badge } from '../ui/badge.js';
import { cn } from '../../lib/utils.js';

export interface SectionBlockProps {
    title?: string;
    description?: string;
    badge?: string;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    headerClassName?: string;
    contentClassName?: string;
}

export function SectionBlock({
    title,
    description,
    badge,
    icon,
    actions,
    children,
    className,
    headerClassName,
    contentClassName,
}: SectionBlockProps) {
    const hasHeader = Boolean(title || description || badge || icon || actions);

    return (
        <Card className={cn('gap-0 overflow-hidden py-0', className)}>
            {hasHeader ? (
                <CardHeader
                    className={cn(
                        'gap-3 border-b px-6 py-4 sm:py-5',
                        headerClassName,
                    )}
                >
                    <div className="min-w-0">
                        {(badge || icon) && (
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                {badge ? <Badge variant="outline">{badge}</Badge> : null}
                                {icon ? (
                                    <span className="text-muted-foreground">{icon}</span>
                                ) : null}
                            </div>
                        )}
                        {title ? (
                            <CardTitle className="text-base">{title}</CardTitle>
                        ) : null}
                        {description ? (
                            <CardDescription className="mt-1">
                                {description}
                            </CardDescription>
                        ) : null}
                    </div>
                    {actions ? <CardAction>{actions}</CardAction> : null}
                </CardHeader>
            ) : null}
            <CardContent
                className={cn(
                    hasHeader ? 'px-6 py-4 sm:py-5' : 'px-6 py-5 sm:py-6',
                    contentClassName,
                )}
            >
                {children}
            </CardContent>
        </Card>
    );
}
