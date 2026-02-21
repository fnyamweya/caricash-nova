import { motion } from 'framer-motion';

export interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/20 px-4 py-12 text-center"
        >
            {icon && (
                <div className="rounded-xl bg-background/70 p-2 text-muted-foreground [&_svg]:h-9 [&_svg]:w-9">
                    {icon}
                </div>
            )}
            <h3 className="text-lg font-semibold">{title}</h3>
            {description && (
                <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
            )}
            {action && <div className="mt-2">{action}</div>}
        </motion.div>
    );
}
