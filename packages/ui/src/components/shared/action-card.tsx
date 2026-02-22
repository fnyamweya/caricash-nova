import { ArrowRight } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js';
import { cn } from '../../lib/utils.js';

export interface ActionCardProps {
    title: string;
    description: string;
    icon?: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
}

export function ActionCard({
    title,
    description,
    icon,
    onClick,
    disabled = false,
    className,
}: ActionCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'group w-full text-left disabled:cursor-not-allowed disabled:opacity-60',
                className,
            )}
        >
            <Card className="h-full transition-colors group-hover:border-primary/30">
                <CardHeader className="grid grid-cols-[auto_1fr] items-center gap-3 pb-0">
                    {icon ? (
                        <span className="flex size-9 items-center justify-center rounded-md border bg-muted/50 text-primary">
                            {icon}
                        </span>
                    ) : null}
                    <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-3 pt-4">
                    <p className="text-muted-foreground text-sm">{description}</p>
                    <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
                </CardContent>
            </Card>
        </button>
    );
}
