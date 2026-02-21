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
            className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
            <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                    {badge ? <Badge variant="outline">{badge}</Badge> : null}
                </div>
                <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">
                    {title}
                </h1>
                {description && (
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </motion.div>
    );
}
