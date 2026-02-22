import { type ReactNode, useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Input, Label, cn } from '@caricash/ui';
import { Building2, Eye, EyeOff, KeyRound, Phone, ShieldCheck, Store } from 'lucide-react';

export function MerchantAuthShell({
    title,
    subtitle,
    sideTitle,
    sideText,
    children,
    footer,
}: {
    title: string;
    subtitle: string;
    sideTitle: string;
    sideText: string;
    children: ReactNode;
    footer?: ReactNode;
}) {
    return (
        <div className="relative min-h-svh overflow-x-clip bg-[radial-gradient(circle_at_10%_10%,rgba(16,185,129,0.14),transparent_36%),radial-gradient(circle_at_90%_10%,rgba(6,182,212,0.12),transparent_38%),radial-gradient(circle_at_50%_80%,rgba(59,130,246,0.08),transparent_40%),hsl(var(--background))] px-4 py-6 sm:px-6">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-8 top-14 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />
                <div className="absolute right-10 top-10 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
                <div className="absolute bottom-10 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-blue-300/10 blur-3xl" />
            </div>

            <div className="relative mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="hidden rounded-[28px] border border-white/25 bg-gradient-to-b from-emerald-900 via-emerald-950 to-teal-950 p-6 text-white shadow-[0_28px_65px_-36px_rgba(1,22,16,0.88)] lg:flex lg:flex-col lg:justify-between">
                    <div>
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                            <Building2 className="h-5 w-5" />
                        </div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">CariCash Merchant</p>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{sideTitle}</h1>
                        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75">{sideText}</p>
                    </div>

                    <div className="grid gap-2">
                        <InfoPill icon={<Store className="h-4 w-4" />} title="Store-auth ready" text="Branch staff can sign in using store code, MSISDN, and PIN." />
                        <InfoPill icon={<ShieldCheck className="h-4 w-4" />} title="Secure merchant sessions" text="Designed for cashier, manager, and owner workflows." />
                        <InfoPill icon={<KeyRound className="h-4 w-4" />} title="Fast PIN flow" text="Optimized for quick operational sign-in on mobile and tablet." />
                    </div>
                </div>

                <div className="rounded-[28px] border border-white/45 bg-background/85 p-4 shadow-[0_24px_55px_-38px_rgba(0,20,14,0.58)] backdrop-blur-xl sm:p-5 lg:p-6">
                    <div className="mb-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Merchant Client Portal</p>
                        <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
                    </div>
                    <div className="space-y-4">{children}</div>
                    {footer ? <div className="mt-5">{footer}</div> : null}
                </div>
            </div>
        </div>
    );
}

export function MerchantAuthModeToggle<T extends string>({
    value,
    onChange,
    options,
}: {
    value: T;
    onChange: (value: T) => void;
    options: Array<{ value: T; label: string; helper: string; icon: ReactNode }>;
}) {
    return (
        <div className="grid gap-2 sm:grid-cols-2">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <motion.button
                        key={option.value}
                        type="button"
                        whileTap={{ scale: 0.99 }}
                        whileHover={{ y: -1 }}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            'rounded-2xl border p-3 text-left transition-colors',
                            active ? 'border-emerald-300 bg-emerald-500/10' : 'border-border/70 bg-background/70 hover:bg-accent/30',
                        )}
                    >
                        <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-background/80">{option.icon}</div>
                        <p className={cn('text-sm font-semibold', active && 'text-emerald-700')}>{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.helper}</p>
                    </motion.button>
                );
            })}
        </div>
    );
}

export function MerchantAuthField({
    label,
    icon,
    id,
    hint,
    ...props
}: {
    label: string;
    icon?: ReactNode;
    id: string;
    hint?: string;
} & React.ComponentProps<typeof Input>) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <div className="relative">
                {icon ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span> : null}
                <Input id={id} className={cn('h-11 rounded-xl', icon && 'pl-10')} {...props} />
            </div>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

export function MerchantPinField({
    id,
    label = 'PIN',
    value,
    onChange,
    placeholder = 'Enter PIN',
}: {
    id: string;
    label?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    const [show, setShow] = useState(false);

    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <KeyRound className="h-4 w-4" />
                </span>
                <Input
                    id={id}
                    type={show ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="h-11 rounded-xl pl-10 pr-10"
                />
                <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:bg-accent/40"
                    aria-label={show ? 'Hide PIN' : 'Show PIN'}
                >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
}

export function MerchantAuthSubmit({
    loading,
    children,
}: {
    loading?: boolean;
    children: ReactNode;
}) {
    return (
        <Button type="submit" className="h-11 w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90" disabled={loading}>
            {loading ? 'Signing in…' : children}
        </Button>
    );
}

function InfoPill({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="inline-flex items-center gap-2 text-sm font-semibold">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">{icon}</span>
                {title}
            </div>
            <p className="mt-1 text-xs text-white/70">{text}</p>
        </div>
    );
}

export const merchantAuthIcons = {
    phone: <Phone className="h-4 w-4" />,
    store: <Store className="h-4 w-4" />,
};
