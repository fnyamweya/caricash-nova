import { motion } from 'framer-motion';
import { Badge } from '../ui/badge.js';

export interface PageHeaderProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    badge?: string;
}

export function PageHeader({ title, description, actions, badge }: PageHeaderProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
            <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    {badge ? (
                        <Badge variant="outline" className="rounded-md">
                            {badge}
                        </Badge>
                    ) : null}
                    <span className="text-muted-foreground text-xs">Dashboard</span>
                </div>
                <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">
                    {title}
                </h1>
                {description && (
                    <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
                        {description}
                    </p>
                )}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </motion.div>
    );
}
