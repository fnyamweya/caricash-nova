import { motion } from 'framer-motion';
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
        <motion.button
            type="button"
            onClick={onClick}
            disabled={disabled}
            whileHover={disabled ? undefined : { y: -2 }}
            whileTap={disabled ? undefined : { scale: 0.995 }}
            className={cn('w-full text-left disabled:cursor-not-allowed disabled:opacity-60', className)}
        >
            <Card className="group h-full border-border/75 transition-all duration-200 hover:border-primary/35 hover:shadow-[0_20px_45px_-34px_rgba(30,64,175,0.55)] focus-within:ring-2 focus-within:ring-ring">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                    {icon ? (
                        <span className="rounded-lg bg-primary/12 p-2 text-primary">
                            {icon}
                        </span>
                    ) : null}
                    <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{description}</p>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
                </CardContent>
            </Card>
        </motion.button>
    );
}
