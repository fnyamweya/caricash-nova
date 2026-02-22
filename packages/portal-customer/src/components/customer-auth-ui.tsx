import { useId } from 'react';
import type { ReactNode } from 'react';
import {
    AppearanceMenu,
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Input,
    Label,
    LoadingSpinner,
    cn,
} from '@caricash/ui';
import {
    Clock3,
    Eye,
    EyeOff,
    Lock,
    ShieldCheck,
    ShoppingBag,
    Sparkles,
    Wallet,
    SendHorizontal,
} from 'lucide-react';

type AuthMode = 'login' | 'register';

interface CustomerAuthShellProps {
    mode: AuthMode;
    formBadge: string;
    formTitle: string;
    formDescription: string;
    children: ReactNode;
    footer?: ReactNode;
}

const modeContent: Record<
    AuthMode,
    {
        heroEyebrow: string;
        heroTitle: string;
        heroDescription: string;
        featureLines: Array<{ icon: ReactNode; text: string }>;
        highlightCards: Array<{ title: string; caption: string }>;
    }
> = {
    login: {
        heroEyebrow: 'Personal Wallet',
        heroTitle: 'Move money without friction',
        heroDescription:
            'Sign in to send money, pay merchants, and keep track of your wallet activity from one smooth interface.',
        featureLines: [
            { icon: <ShieldCheck className="h-4 w-4 text-primary" />, text: 'PIN-protected wallet actions' },
            { icon: <SendHorizontal className="h-4 w-4 text-primary" />, text: 'Instant transfers to other customers' },
            { icon: <ShoppingBag className="h-4 w-4 text-primary" />, text: 'Merchant checkout by code or QR' },
        ],
        highlightCards: [
            { title: 'Fast send', caption: 'Send in seconds' },
            { title: 'Wallet activity', caption: 'Clear transaction feed' },
        ],
    },
    register: {
        heroEyebrow: 'New Wallet',
        heroTitle: 'Open your CariCash wallet',
        heroDescription:
            'Create your account in a few steps, choose how your name appears, and start paying or transferring from your phone.',
        featureLines: [
            { icon: <Wallet className="h-4 w-4 text-primary" />, text: 'Consumer-friendly wallet experience' },
            { icon: <Clock3 className="h-4 w-4 text-primary" />, text: 'Quick setup with clear steps' },
            { icon: <Sparkles className="h-4 w-4 text-primary" />, text: 'Responsive UI built for mobile first' },
        ],
        highlightCards: [
            { title: 'Secure setup', caption: 'PIN + consent checks' },
            { title: 'Display name', caption: 'Choose how you appear' },
        ],
    },
};

export function CustomerAuthShell({
    mode,
    formBadge,
    formTitle,
    formDescription,
    children,
    footer,
}: CustomerAuthShellProps) {
    const content = modeContent[mode];
    const wide = mode === 'register';

    return (
        <div className="relative min-h-svh overflow-x-clip bg-background text-foreground">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-12 left-[8%] h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute top-10 right-[8%] h-64 w-64 rounded-full bg-chart-2/18 blur-3xl" />
                <div className="absolute bottom-16 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-chart-3/15 blur-3xl" />
                <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/8 via-transparent to-transparent" />
            </div>

            <div className="absolute right-3 top-3 z-20 sm:right-5 sm:top-5">
                <AppearanceMenu compact />
            </div>

            <main className="relative z-10 px-3 py-4 sm:px-5 sm:py-6 md:px-6 md:py-8">
                <div
                    className={cn(
                        'mx-auto grid gap-4 md:gap-5',
                        wide
                            ? 'max-w-7xl lg:grid-cols-[0.95fr_1.05fr]'
                            : 'max-w-6xl lg:grid-cols-[1fr_0.95fr]',
                    )}
                >
                    <section className="order-1 overflow-hidden rounded-3xl border border-border/70 bg-background/75 p-4 shadow-[0_16px_40px_-28px_color-mix(in_oklab,var(--foreground)_30%,transparent)] backdrop-blur-xl sm:p-5 md:p-6">
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="inline-flex items-center gap-1">
                                <Wallet className="h-3 w-3" />
                                CariCash
                            </Badge>
                            <Badge variant="outline">{content.heroEyebrow}</Badge>
                            <Badge variant="outline" className="hidden sm:inline-flex">
                                Smooth payments
                            </Badge>
                        </div>

                        <div className="space-y-2">
                            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">
                                {content.heroTitle}
                            </h1>
                            <p className="max-w-2xl text-sm text-muted-foreground sm:text-[15px]">
                                {content.heroDescription}
                            </p>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            {content.highlightCards.map((item) => (
                                <div
                                    key={item.title}
                                    className="rounded-2xl border border-border/70 bg-background/80 p-4"
                                >
                                    <p className="text-sm font-semibold">{item.title}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{item.caption}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-5 space-y-2.5">
                            {content.featureLines.map((line) => (
                                <div
                                    key={line.text}
                                    className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2.5 text-sm"
                                >
                                    {line.icon}
                                    <span>{line.text}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <Card className="order-2 rounded-3xl border-border/70 bg-background/88 shadow-[0_22px_56px_-34px_color-mix(in_oklab,var(--foreground)_35%,transparent)] backdrop-blur-xl">
                        <CardHeader className="space-y-2 px-5 pt-5 sm:px-6 sm:pt-6">
                            <Badge variant="outline" className="w-fit">
                                {formBadge}
                            </Badge>
                            <CardTitle className="text-xl tracking-tight sm:text-2xl">
                                {formTitle}
                            </CardTitle>
                            <CardDescription className="text-sm">
                                {formDescription}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
                            {children}
                        </CardContent>
                        {footer ? <CardFooter className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6">{footer}</CardFooter> : null}
                    </Card>
                </div>
            </main>
        </div>
    );
}

export function CustomerAuthSection({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4 sm:p-5">
            <div className="space-y-1">
                <p className="text-sm font-semibold">{title}</p>
                {description ? (
                    <p className="text-xs text-muted-foreground">{description}</p>
                ) : null}
            </div>
            <div className="space-y-3">{children}</div>
        </section>
    );
}

export function CustomerAuthField({
    label,
    htmlFor,
    hint,
    children,
}: {
    label: string;
    htmlFor?: string;
    hint?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={htmlFor}>{label}</Label>
            {children}
            {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
        </div>
    );
}

export function CustomerTextField({
    id,
    label,
    value,
    onChange,
    placeholder,
    icon,
    type = 'text',
    required = false,
    disabled = false,
    autoComplete,
    inputMode,
    maxLength,
    hint,
    className,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    icon?: ReactNode;
    type?: string;
    required?: boolean;
    disabled?: boolean;
    autoComplete?: string;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    maxLength?: number;
    hint?: ReactNode;
    className?: string;
}) {
    return (
        <CustomerAuthField label={label} htmlFor={id} hint={hint}>
            <div className="relative">
                {icon ? (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {icon}
                    </span>
                ) : null}
                <Input
                    id={id}
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className={cn(icon ? 'pl-10' : '', className)}
                    required={required}
                    disabled={disabled}
                    autoComplete={autoComplete}
                    inputMode={inputMode}
                    maxLength={maxLength}
                />
            </div>
        </CustomerAuthField>
    );
}

export function CustomerPinField({
    id,
    label,
    value,
    onChange,
    placeholder,
    show,
    onToggleShow,
    disabled = false,
    maxLength,
    hint,
    autoComplete,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    show: boolean;
    onToggleShow: () => void;
    disabled?: boolean;
    maxLength?: number;
    hint?: ReactNode;
    autoComplete?: string;
}) {
    const toggleLabelId = useId();

    return (
        <CustomerAuthField label={label} htmlFor={id} hint={hint}>
            <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Lock className="h-4 w-4" />
                </span>
                <Input
                    id={id}
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="pl-10 pr-12"
                    required
                    disabled={disabled}
                    autoComplete={autoComplete ?? (id.includes('confirm') ? 'new-password' : 'current-password')}
                    inputMode="numeric"
                    maxLength={maxLength}
                />
                <span id={toggleLabelId} className="sr-only">
                    {show ? 'Hide PIN' : 'Show PIN'}
                </span>
                <button
                    type="button"
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={onToggleShow}
                    aria-labelledby={toggleLabelId}
                >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            </div>
        </CustomerAuthField>
    );
}

export function CustomerAuthError({ error }: { error?: string | null }) {
    if (!error) return null;
    return (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
        </div>
    );
}

export function CustomerConsentRow({
    checked,
    onCheckedChange,
    label,
    required = false,
}: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label: ReactNode;
    required?: boolean;
}) {
    return (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/60 bg-background/70 px-3 py-2.5 text-sm">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onCheckedChange(e.target.checked)}
                required={required}
                className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--primary)]"
            />
            <span className="leading-5">{label}</span>
        </label>
    );
}

export function CustomerAuthSubmitButton({
    loading,
    idleLabel,
    loadingLabel,
}: {
    loading?: boolean;
    idleLabel: string;
    loadingLabel: string;
}) {
    return (
        <Button type="submit" disabled={loading} className="w-full rounded-xl">
            {loading ? (
                <span className="inline-flex items-center gap-2">
                    <LoadingSpinner size="sm" />
                    {loadingLabel}
                </span>
            ) : (
                idleLabel
            )}
        </Button>
    );
}

export function CustomerAuthLinkPrompt({
    prompt,
    actionLabel,
    onAction,
}: {
    prompt: string;
    actionLabel: string;
    onAction: () => void;
}) {
    return (
        <p className="text-center text-sm text-muted-foreground">
            {prompt}{' '}
            <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={onAction}
            >
                {actionLabel}
            </button>
        </p>
    );
}
