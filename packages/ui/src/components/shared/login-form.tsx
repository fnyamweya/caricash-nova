import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Lock,
    Phone,
    UserCog,
    Shield,
    Sparkles,
    ShieldCheck,
    Clock3,
    Eye,
    EyeOff,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { AppearanceMenu } from './appearance-menu.js';
import { LoadingSpinner } from './loading-spinner.js';
import { useTheme } from '../../hooks/use-theme.js';

type PortalType = 'customer' | 'agent' | 'merchant' | 'staff';

const portalConfig: Record<
    PortalType,
    {
        label: string;
        placeholder: string;
        icon: React.ReactNode;
        title: string;
        subtitle: string;
        trustText: string;
    }
> = {
    customer: {
        label: 'Phone Number',
        placeholder: 'Enter your phone number',
        icon: <Phone className="h-4 w-4" />,
        title: 'Customer Portal',
        subtitle: 'Send money, pay merchants, and stay in control of daily spending.',
        trustText: 'Fast wallet access',
    },
    agent: {
        label: 'Agent Code',
        placeholder: 'Enter your agent code',
        icon: <UserCog className="h-4 w-4" />,
        title: 'Agent Portal',
        subtitle: 'Handle assisted cash-in and cash-out operations with confidence.',
        trustText: 'Branch-grade tooling',
    },
    merchant: {
        label: 'Phone Number',
        placeholder: 'Enter your phone number',
        icon: <Phone className="h-4 w-4" />,
        title: 'Merchant Portal',
        subtitle: 'Track payments and transfer settlement funds between stores.',
        trustText: 'Business operations suite',
    },
    staff: {
        label: 'Staff Code',
        placeholder: 'Enter your staff code',
        icon: <Shield className="h-4 w-4" />,
        title: 'Staff Portal',
        subtitle: 'Run approvals, monitor reconciliation, and supervise platform integrity.',
        trustText: 'Enterprise control center',
    },
};

export interface LoginFormProps {
    portalType: PortalType;
    onSubmit: (data: { identifier: string; pin: string }) => Promise<void>;
    loading?: boolean;
    error?: string | null;
    onRegisterClick?: () => void;
}

export function LoginForm({
    portalType,
    onSubmit,
    loading = false,
    error = null,
    onRegisterClick,
}: LoginFormProps) {
    const [identifier, setIdentifier] = useState('');
    const [pin, setPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const config = portalConfig[portalType];
    const { activeTheme, shellVariant, themes, shellVariants } = useTheme();
    const activeThemeLabel =
        themes.find((theme) => theme.value === activeTheme)?.label ?? activeTheme;
    const shellVariantLabel =
        shellVariants.find((variant) => variant.value === shellVariant)?.label ?? shellVariant;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        await onSubmit({ identifier, pin });
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,color-mix(in_oklab,var(--primary)_18%,transparent)_0,transparent_45%),radial-gradient(circle_at_100%_100%,color-mix(in_oklab,var(--accent)_20%,transparent)_0,transparent_42%)]" />
            <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
                <AppearanceMenu />
            </div>
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border bg-card shadow-sm md:grid-cols-[1.1fr_0.9fr]"
            >
                <div className="relative hidden flex-col justify-between border-r border-border/70 bg-gradient-to-br from-primary/15 via-accent/5 to-transparent p-8 md:flex">
                    <div>
                        <div className="mb-3 flex flex-wrap gap-2">
                            <Badge variant="outline" className="w-fit">
                                Secure Access
                            </Badge>
                            <Badge variant="outline" className="w-fit">
                                {activeThemeLabel}
                            </Badge>
                            <Badge variant="outline" className="w-fit">
                                {shellVariantLabel}
                            </Badge>
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">
                            CariCash
                        </h1>
                        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
                            {config.subtitle}
                        </p>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-foreground/90">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            Enterprise-grade security controls
                        </div>
                        <div className="flex items-center gap-2 text-sm text-foreground/90">
                            <Clock3 className="h-4 w-4 text-primary" />
                            Real-time transaction workflows
                        </div>
                        <div className="flex items-center gap-2 text-sm text-foreground/90">
                            <Sparkles className="h-4 w-4 text-primary" />
                            {config.trustText}
                        </div>
                    </div>
                </div>

                <Card className="rounded-none border-0 bg-transparent shadow-none">
                    <CardHeader className="pb-5">
                        <Badge variant="outline" className="w-fit">
                            {config.title}
                        </Badge>
                        <CardTitle className="text-2xl">Sign in to continue</CardTitle>
                        <CardDescription>
                            Use your assigned credentials to access your workspace.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            {error && (
                                <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    {error}
                                </div>
                            )}

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="identifier">{config.label}</Label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        {config.icon}
                                    </span>
                                    <Input
                                        id="identifier"
                                        value={identifier}
                                        onChange={(e) => setIdentifier(e.target.value)}
                                        placeholder={config.placeholder}
                                        className="pl-10"
                                        required
                                        disabled={loading}
                                        autoComplete="username"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="pin">PIN</Label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        <Lock className="h-4 w-4" />
                                    </span>
                                    <Input
                                        id="pin"
                                        type={showPin ? 'text' : 'password'}
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value)}
                                        placeholder="Enter your PIN"
                                        className="pl-10 pr-12"
                                        required
                                        disabled={loading}
                                        autoComplete="current-password"
                                        inputMode="numeric"
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        onClick={() => setShowPin((prev) => !prev)}
                                        aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                                    >
                                        {showPin ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <Button type="submit" disabled={loading} className="mt-1 w-full">
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <LoadingSpinner size="sm" />
                                        Signing in...
                                    </span>
                                ) : (
                                    'Sign In'
                                )}
                            </Button>

                            {onRegisterClick && (
                                <p className="mt-1 text-center text-sm text-muted-foreground">
                                    Don&apos;t have an account?{' '}
                                    <button
                                        type="button"
                                        className="font-medium text-primary underline-offset-4 hover:underline"
                                        onClick={onRegisterClick}
                                    >
                                        Register your store
                                    </button>
                                </p>
                            )}
                        </form>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}
