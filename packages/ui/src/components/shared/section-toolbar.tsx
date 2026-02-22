import { Badge } from '../ui/badge.js';
import { Card, CardContent } from '../ui/card.js';
import { cn } from '../../lib/utils.js';

export interface SectionToolbarProps {
    title?: string;
    description?: string;
    badge?: string;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    bodyClassName?: string;
}

export function SectionToolbar({
    title,
    description,
    badge,
    icon,
    actions,
    children,
    className,
    bodyClassName,
}: SectionToolbarProps) {
    return (
        <Card className={cn('gap-0 py-0', className)}>
            {title || description || badge || icon || actions ? (
                <CardContent className="border-b px-6 py-4 sm:py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            {badge || icon ? (
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    {badge ? <Badge variant="outline">{badge}</Badge> : null}
                                    {icon ? (
                                        <span className="text-muted-foreground">{icon}</span>
                                    ) : null}
                                </div>
                            ) : null}
                            {title ? <p className="text-sm font-semibold">{title}</p> : null}
                            {description ? (
                                <p className="text-sm text-muted-foreground">{description}</p>
                            ) : null}
                        </div>
                        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
                    </div>
                </CardContent>
            ) : null}

            {children ? (
                <CardContent
                    className={cn('px-6 py-4 sm:py-5', bodyClassName)}
                >
                    {children}
                </CardContent>
            ) : null}
        </Card>
    );
}
