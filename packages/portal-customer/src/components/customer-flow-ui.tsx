import { CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import {
    Badge,
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    SectionToolbar,
    cn,
} from '@caricash/ui';

export interface CustomerFlowExperienceToolbarProps {
    title: string;
    description: string;
    chips: string[];
}

export function CustomerFlowExperienceToolbar({
    title,
    description,
    chips,
}: CustomerFlowExperienceToolbarProps) {
    return (
        <SectionToolbar title={title} description={description}>
            <div className="flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
                    <Badge key={chip} variant="outline">
                        {chip}
                    </Badge>
                ))}
            </div>
        </SectionToolbar>
    );
}

export interface QuickAmountGridProps {
    amounts: readonly string[];
    onSelect: (amount: string) => void;
    currency?: string;
    label?: string;
}

export function QuickAmountGrid({
    amounts,
    onSelect,
    currency = 'BBD',
    label = 'Quick Amounts',
}: QuickAmountGridProps) {
    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {amounts.map((quick) => (
                    <motion.button
                        key={quick}
                        type="button"
                        className="rounded-xl border border-border/80 bg-background px-3 py-2 text-xs font-semibold transition-colors hover:border-primary/40 hover:bg-primary/5"
                        onClick={() => onSelect(quick)}
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        {currency} {quick}
                    </motion.button>
                ))}
            </div>
        </div>
    );
}

export interface CustomerFlowStep {
    key: string;
    label: string;
    state: 'upcoming' | 'active' | 'done';
}

export function CustomerFlowStepPills({ steps }: { steps: CustomerFlowStep[] }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            {steps.map((step, index) => (
                <motion.div
                    key={step.key}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    className={cn(
                        'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium',
                        step.state === 'active' && 'border-primary/25 bg-primary/10 text-foreground',
                        step.state === 'done' && 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300',
                        step.state === 'upcoming' && 'border-border/70 bg-background/70 text-muted-foreground',
                    )}
                >
                    <span
                        className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                            step.state === 'active' && 'bg-primary/15 text-primary',
                            step.state === 'done' && 'bg-green-500/15 text-green-700 dark:text-green-300',
                            step.state === 'upcoming' && 'bg-muted text-muted-foreground',
                        )}
                    >
                        {step.state === 'done' ? '✓' : index + 1}
                    </span>
                    {step.label}
                </motion.div>
            ))}
        </div>
    );
}

export interface CustomerStickyActionBarProps {
    title: string;
    subtitle?: string;
    actionLabel: string;
    onAction: () => void;
    disabled?: boolean;
    loading?: boolean;
    icon?: React.ReactNode;
}

export function CustomerStickyActionBar({
    title,
    subtitle,
    actionLabel,
    onAction,
    disabled,
    loading,
    icon,
}: CustomerStickyActionBarProps) {
    return (
        <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+5.75rem)] sm:px-4 lg:hidden"
        >
            <div className="mx-auto max-w-3xl rounded-2xl border border-border/70 bg-background/92 p-2 shadow-[0_18px_48px_-30px_color-mix(in_oklab,var(--foreground)_35%,transparent)] backdrop-blur-xl">
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                        <div className="truncate text-sm font-semibold">{title}</div>
                        {subtitle ? (
                            <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
                        ) : null}
                    </div>
                    <Button
                        type="button"
                        className="h-11 rounded-xl px-4"
                        onClick={onAction}
                        disabled={disabled || loading}
                    >
                        {loading ? 'Please wait…' : (
                            <>
                                {icon}
                                {actionLabel}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}

export interface VerificationSuccessNoticeProps {
    title: string;
    description: string;
}

export function VerificationSuccessNotice({
    title,
    description,
}: VerificationSuccessNoticeProps) {
    return (
        <div className="flex items-start gap-2 rounded-xl border border-green-500/25 bg-green-500/5 p-3 text-sm">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            <div>
                <p className="font-semibold text-green-700 dark:text-green-300">{title}</p>
                <p className="text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}

export interface CustomerSuccessDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    children?: React.ReactNode;
    actionLabel?: string;
}

export function CustomerSuccessDialog({
    open,
    onOpenChange,
    title,
    description,
    children,
    actionLabel = 'Done',
}: CustomerSuccessDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                        <CheckCircle className="h-6 w-6 text-green-500" />
                    </div>
                    <DialogTitle className="text-center">{title}</DialogTitle>
                    <DialogDescription className="text-center">
                        {description}
                    </DialogDescription>
                </DialogHeader>
                {children}
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline" className="w-full">
                            {actionLabel}
                        </Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
