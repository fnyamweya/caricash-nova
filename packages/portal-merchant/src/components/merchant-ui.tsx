import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    cn,
} from '@caricash/ui';

export function MerchantHero({
    title,
    description,
    badge,
    actions,
    children,
    className,
}: {
    title: string;
    description?: string;
    badge?: string;
    actions?: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    return (
        <Card className={cn(
            'overflow-hidden border-white/40 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,255,252,0.9))] shadow-[0_22px_55px_-38px_rgba(1,32,23,0.45)] backdrop-blur-md',
            className,
        )}
        >
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -left-12 top-2 h-32 w-32 rounded-full bg-emerald-500/12 blur-2xl" />
                <div className="absolute right-4 top-4 h-24 w-24 rounded-full bg-cyan-400/10 blur-2xl" />
            </div>
            <CardHeader className="relative gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        {badge ? <Badge className="rounded-full bg-emerald-500/12 px-3 py-1 text-emerald-700 hover:bg-emerald-500/12">{badge}</Badge> : null}
                        <Badge variant="outline" className="rounded-full border-border/70 bg-background/70 px-3 py-1 text-xs">
                            Merchant Workspace
                        </Badge>
                    </div>
                    <div>
                        <CardTitle className="text-xl tracking-tight sm:text-2xl">{title}</CardTitle>
                        {description ? (
                            <CardDescription className="mt-1 max-w-2xl text-sm text-muted-foreground">
                                {description}
                            </CardDescription>
                        ) : null}
                    </div>
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            </CardHeader>
            {children ? <CardContent className="relative pt-0">{children}</CardContent> : null}
        </Card>
    );
}

export function MerchantSection({
    title,
    description,
    actions,
    children,
    className,
    contentClassName,
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
    contentClassName?: string;
}) {
    return (
        <Card className={cn('border-white/50 bg-background/85 shadow-[0_20px_45px_-40px_rgba(2,24,18,0.8)] backdrop-blur-md', className)}>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            </CardHeader>
            <CardContent className={cn('space-y-4', contentClassName)}>{children}</CardContent>
        </Card>
    );
}

export function MerchantMetricCard({
    label,
    value,
    helper,
    icon,
    tone = 'emerald',
}: {
    label: string;
    value: ReactNode;
    helper?: ReactNode;
    icon?: ReactNode;
    tone?: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';
}) {
    const toneMap: Record<typeof tone, string> = {
        emerald: 'from-emerald-500/12 to-green-500/5 border-emerald-200/60',
        blue: 'from-blue-500/12 to-cyan-500/5 border-blue-200/60',
        amber: 'from-amber-500/12 to-yellow-500/5 border-amber-200/60',
        rose: 'from-rose-500/12 to-pink-500/5 border-rose-200/60',
        slate: 'from-slate-500/8 to-slate-400/4 border-border/60',
    };

    return (
        <motion.div
            whileHover={{ y: -2 }}
            transition={{ duration: 0.18 }}
            className={cn(
                'rounded-2xl border bg-gradient-to-br p-4 shadow-sm',
                toneMap[tone],
            )}
        >
            <div className="mb-3 flex items-center justify-between gap-2 text-muted-foreground">
                <p className="text-xs font-medium uppercase tracking-[0.12em]">{label}</p>
                {icon ? <span className="text-foreground/80">{icon}</span> : null}
            </div>
            <div className="text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
            {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
        </motion.div>
    );
}

export function MerchantActionTile({
    title,
    description,
    icon,
    onClick,
    cta = 'Open',
    tone = 'emerald',
}: {
    title: string;
    description: string;
    icon: ReactNode;
    onClick?: () => void;
    cta?: string;
    tone?: 'emerald' | 'blue' | 'orange' | 'violet';
}) {
    const toneClasses: Record<typeof tone, string> = {
        emerald: 'from-emerald-500/12 to-green-400/8 border-emerald-200/60',
        blue: 'from-blue-500/12 to-cyan-400/8 border-blue-200/60',
        orange: 'from-orange-500/12 to-amber-400/8 border-orange-200/60',
        violet: 'from-violet-500/12 to-purple-400/8 border-violet-200/60',
    };

    return (
        <motion.button
            type="button"
            whileTap={{ scale: 0.99 }}
            whileHover={{ y: -3 }}
            transition={{ duration: 0.18 }}
            onClick={onClick}
            className={cn(
                'group flex w-full flex-col gap-3 rounded-2xl border bg-gradient-to-br p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-background',
                toneClasses[tone],
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background/85 shadow-sm">
                    {icon}
                </div>
                <Badge variant="outline" className="rounded-full bg-background/80 text-[11px]">
                    {cta}
                </Badge>
            </div>
            <div>
                <p className="text-sm font-semibold tracking-tight">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            </div>
        </motion.button>
    );
}

export function MerchantStepChips({
    steps,
    active,
    onChange,
}: {
    steps: Array<{ id: string; label: string; helper?: string }>;
    active: string;
    onChange?: (id: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {steps.map((step, index) => {
                const isActive = step.id === active;
                return (
                    <motion.button
                        key={step.id}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onChange?.(step.id)}
                        className={cn(
                            'relative overflow-hidden rounded-2xl border px-3 py-2 text-left transition-colors',
                            isActive
                                ? 'border-emerald-300 bg-emerald-500/10 text-emerald-800'
                                : 'border-border/70 bg-background/70 hover:bg-accent/40',
                        )}
                    >
                        {isActive ? (
                            <motion.span
                                layoutId="merchant-active-step-chip"
                                className="absolute inset-0 rounded-2xl border border-emerald-300/70"
                            />
                        ) : null}
                        <span className="relative block text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">
                            {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="relative block text-sm font-medium">{step.label}</span>
                        {step.helper ? (
                            <span className="relative block text-xs text-muted-foreground">{step.helper}</span>
                        ) : null}
                    </motion.button>
                );
            })}
        </div>
    );
}

export function MerchantQuickAmountGrid({
    values,
    selected,
    onPick,
    currency = 'BBD',
}: {
    values: string[];
    selected?: string;
    onPick: (value: string) => void;
    currency?: string;
}) {
    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {values.map((value) => {
                const isActive = selected === value;
                return (
                    <motion.button
                        key={value}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        whileHover={{ y: -1 }}
                        onClick={() => onPick(value)}
                        className={cn(
                            'rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                            isActive
                                ? 'border-emerald-300 bg-emerald-500/10 text-emerald-700'
                                : 'border-border/70 bg-background/80 hover:bg-accent/40',
                        )}
                    >
                        <span className="block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{currency}</span>
                        <span className="block font-semibold">{value}</span>
                    </motion.button>
                );
            })}
        </div>
    );
}

export function MerchantStickyActionBar({
    title,
    subtitle,
    primary,
    secondary,
}: {
    title: ReactNode;
    subtitle?: ReactNode;
    primary: ReactNode;
    secondary?: ReactNode;
}) {
    return (
        <div className="sticky bottom-20 z-20 rounded-2xl border border-white/50 bg-background/92 p-3 shadow-[0_18px_40px_-30px_rgba(3,18,14,0.85)] backdrop-blur md:bottom-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{title}</p>
                    {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    {secondary}
                    {primary}
                </div>
            </div>
        </div>
    );
}

export function MerchantSegmentedFilters<T extends string>({
    value,
    onChange,
    options,
}: {
    value: T;
    onChange: (value: T) => void;
    options: Array<{ value: T; label: string; count?: number }>;
}) {
    return (
        <div className="inline-flex max-w-full flex-wrap gap-2 rounded-2xl border border-border/70 bg-background/70 p-1">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <Button
                        key={option.value}
                        type="button"
                        variant={active ? 'default' : 'ghost'}
                        size="sm"
                        className={cn(
                            'rounded-xl px-3',
                            active ? 'bg-emerald-600 text-white hover:bg-emerald-600' : 'text-muted-foreground',
                        )}
                        onClick={() => onChange(option.value)}
                    >
                        {option.label}
                        {typeof option.count === 'number' ? (
                            <span className={cn('ml-1.5 text-[11px]', active ? 'text-white/90' : 'text-muted-foreground')}>
                                {option.count}
                            </span>
                        ) : null}
                    </Button>
                );
            })}
        </div>
    );
}
