import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Lock,
    Phone,
    User,
    Mail,
    Sparkles,
    ShieldCheck,
    Clock3,
    Eye,
    EyeOff,
    UserCircle,
    CheckCircle2,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '../ui/select.js';
import { LoadingSpinner } from './loading-spinner.js';

export type PreferredNameOption = 'FIRST_NAME' | 'MIDDLE_NAME' | 'LAST_NAME' | 'FULL_NAME' | 'CUSTOM';

export interface CustomerRegisterData {
    first_name: string;
    middle_name?: string;
    last_name: string;
    preferred_name?: PreferredNameOption;
    display_name?: string;
    msisdn: string;
    email?: string;
    pin: string;
    terms_accepted: boolean;
    privacy_accepted: boolean;
    marketing_opt_in: boolean;
}

export interface CustomerRegisterFormProps {
    onSubmit: (data: CustomerRegisterData) => Promise<void>;
    loading?: boolean;
    error?: string | null;
    onLoginClick?: () => void;
}

function resolvePreview(
    preferred: PreferredNameOption | '',
    first: string,
    middle: string,
    last: string,
    custom: string,
): string {
    switch (preferred) {
        case 'FIRST_NAME':
            return first || '—';
        case 'MIDDLE_NAME':
            return middle || '—';
        case 'LAST_NAME':
            return last || '—';
        case 'FULL_NAME':
            return [first, middle, last].filter(Boolean).join(' ') || '—';
        case 'CUSTOM':
            return custom || '—';
        default:
            return first || '—';
    }
}

export function CustomerRegisterForm({
    onSubmit,
    loading = false,
    error = null,
    onLoginClick,
}: CustomerRegisterFormProps) {
    const [firstName, setFirstName] = useState('');
    const [middleName, setMiddleName] = useState('');
    const [lastName, setLastName] = useState('');
    const [preferredName, setPreferredName] = useState<PreferredNameOption | ''>('');
    const [customDisplayName, setCustomDisplayName] = useState('');
    const [msisdn, setMsisdn] = useState('');
    const [email, setEmail] = useState('');
    const [pin, setPin] = useState('');
    const [pinConfirm, setPinConfirm] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [marketingOptIn, setMarketingOptIn] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const displayPreview = resolvePreview(preferredName, firstName, middleName, lastName, customDisplayName);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setValidationError(null);

        if (pin.length < 4) {
            setValidationError('PIN must be at least 4 digits');
            return;
        }
        if (pin !== pinConfirm) {
            setValidationError('PINs do not match');
            return;
        }
        if (!termsAccepted) {
            setValidationError('You must accept the Terms of Service');
            return;
        }
        if (!privacyAccepted) {
            setValidationError('You must accept the Privacy Policy');
            return;
        }

        const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
        const resolvedDisplay =
            preferredName === 'CUSTOM'
                ? customDisplayName
                : preferredName === 'FULL_NAME'
                    ? fullName
                    : preferredName === 'MIDDLE_NAME'
                        ? middleName
                        : preferredName === 'LAST_NAME'
                            ? lastName
                            : firstName;

        await onSubmit({
            first_name: firstName,
            middle_name: middleName || undefined,
            last_name: lastName,
            preferred_name: preferredName || undefined,
            display_name: resolvedDisplay || undefined,
            msisdn,
            email: email || undefined,
            pin,
            terms_accepted: termsAccepted,
            privacy_accepted: privacyAccepted,
            marketing_opt_in: marketingOptIn,
        });
    }

    const displayError = error || validationError;

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,color-mix(in_oklab,var(--primary)_18%,transparent)_0,transparent_45%),radial-gradient(circle_at_100%_100%,color-mix(in_oklab,var(--accent)_20%,transparent)_0,transparent_42%)]" />
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border/70 bg-card/80 shadow-[0_30px_80px_-46px_rgba(2,6,23,0.7)] backdrop-blur-md md:grid-cols-[1.1fr_0.9fr]"
            >
                {/* Left panel */}
                <div className="relative hidden flex-col justify-between border-r border-border/70 bg-gradient-to-br from-primary/15 via-accent/5 to-transparent p-8 md:flex">
                    <div>
                        <Badge variant="outline" className="mb-3 w-fit">
                            New Customer
                        </Badge>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">
                            CariCash
                        </h1>
                        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
                            Open your wallet in minutes. Send money, pay merchants, and manage your finances from anywhere.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-foreground/90">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            Secure digital wallet
                        </div>
                        <div className="flex items-center gap-2 text-sm text-foreground/90">
                            <Clock3 className="h-4 w-4 text-primary" />
                            Instant peer-to-peer transfers
                        </div>
                        <div className="flex items-center gap-2 text-sm text-foreground/90">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Contactless merchant payments
                        </div>
                    </div>
                </div>

                {/* Right panel – form */}
                <Card className="rounded-none border-0 bg-transparent shadow-none">
                    <CardHeader className="pb-4">
                        <Badge variant="outline" className="w-fit">
                            Customer Portal
                        </Badge>
                        <CardTitle className="text-2xl">Create your account</CardTitle>
                        <CardDescription>
                            Fill in your details below to open your CariCash wallet.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                            {displayError && (
                                <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    {displayError}
                                </div>
                            )}

                            {/* Name fields */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="first-name">First Name</Label>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                            <User className="h-4 w-4" />
                                        </span>
                                        <Input
                                            id="first-name"
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                            placeholder="John"
                                            className="pl-10"
                                            required
                                            disabled={loading}
                                            autoComplete="given-name"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="last-name">Last Name</Label>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                            <User className="h-4 w-4" />
                                        </span>
                                        <Input
                                            id="last-name"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            placeholder="Doe"
                                            className="pl-10"
                                            required
                                            disabled={loading}
                                            autoComplete="family-name"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="middle-name">
                                    Middle Name <span className="text-muted-foreground">(optional)</span>
                                </Label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        <User className="h-4 w-4" />
                                    </span>
                                    <Input
                                        id="middle-name"
                                        value={middleName}
                                        onChange={(e) => setMiddleName(e.target.value)}
                                        placeholder="Michael"
                                        className="pl-10"
                                        disabled={loading}
                                        autoComplete="additional-name"
                                    />
                                </div>
                            </div>

                            {/* Preferred name / display name */}
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="preferred-name">
                                    Preferred Display Name <span className="text-muted-foreground">(optional)</span>
                                </Label>
                                <Select
                                    value={preferredName}
                                    onValueChange={(v) => setPreferredName(v as PreferredNameOption)}
                                >
                                    <SelectTrigger id="preferred-name" disabled={loading}>
                                        <SelectValue placeholder="How should we address you?" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="FIRST_NAME">First Name</SelectItem>
                                        {middleName && <SelectItem value="MIDDLE_NAME">Middle Name</SelectItem>}
                                        <SelectItem value="LAST_NAME">Last Name</SelectItem>
                                        <SelectItem value="FULL_NAME">Full Name</SelectItem>
                                        <SelectItem value="CUSTOM">Custom</SelectItem>
                                    </SelectContent>
                                </Select>
                                {preferredName && (
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <UserCircle className="h-3.5 w-3.5" />
                                        You'll appear as: <span className="font-medium text-foreground">{displayPreview}</span>
                                    </div>
                                )}
                            </div>

                            {preferredName === 'CUSTOM' && (
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="custom-display">Custom Display Name</Label>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                            <UserCircle className="h-4 w-4" />
                                        </span>
                                        <Input
                                            id="custom-display"
                                            value={customDisplayName}
                                            onChange={(e) => setCustomDisplayName(e.target.value)}
                                            placeholder="Enter your preferred name"
                                            className="pl-10"
                                            required
                                            disabled={loading}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Contact */}
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="msisdn">Phone Number</Label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        <Phone className="h-4 w-4" />
                                    </span>
                                    <Input
                                        id="msisdn"
                                        value={msisdn}
                                        onChange={(e) => setMsisdn(e.target.value)}
                                        placeholder="246XXXXXXX"
                                        className="pl-10"
                                        required
                                        disabled={loading}
                                        autoComplete="tel"
                                        inputMode="tel"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="email">
                                    Email <span className="text-muted-foreground">(optional)</span>
                                </Label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        <Mail className="h-4 w-4" />
                                    </span>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        className="pl-10"
                                        disabled={loading}
                                        autoComplete="email"
                                    />
                                </div>
                            </div>

                            {/* PIN */}
                            <div className="grid grid-cols-2 gap-3">
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
                                            placeholder="4-6 digits"
                                            className="pl-10 pr-10"
                                            required
                                            disabled={loading}
                                            inputMode="numeric"
                                            maxLength={6}
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            onClick={() => setShowPin((prev) => !prev)}
                                            aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                                        >
                                            {showPin ? (
                                                <EyeOff className="h-3.5 w-3.5" />
                                            ) : (
                                                <Eye className="h-3.5 w-3.5" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="pin-confirm">Confirm PIN</Label>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                            <Lock className="h-4 w-4" />
                                        </span>
                                        <Input
                                            id="pin-confirm"
                                            type={showPin ? 'text' : 'password'}
                                            value={pinConfirm}
                                            onChange={(e) => setPinConfirm(e.target.value)}
                                            placeholder="Re-enter"
                                            className="pl-10"
                                            required
                                            disabled={loading}
                                            inputMode="numeric"
                                            maxLength={6}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Consent checkboxes */}
                            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={termsAccepted}
                                        onChange={(e) => setTermsAccepted(e.target.checked)}
                                        disabled={loading}
                                        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                                    />
                                    <span>
                                        I accept the{' '}
                                        <a href="/terms" className="font-medium text-primary underline-offset-4 hover:underline">
                                            Terms of Service
                                        </a>
                                        <span className="text-destructive"> *</span>
                                    </span>
                                </label>
                                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={privacyAccepted}
                                        onChange={(e) => setPrivacyAccepted(e.target.checked)}
                                        disabled={loading}
                                        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                                    />
                                    <span>
                                        I accept the{' '}
                                        <a href="/privacy" className="font-medium text-primary underline-offset-4 hover:underline">
                                            Privacy Policy
                                        </a>
                                        <span className="text-destructive"> *</span>
                                    </span>
                                </label>
                                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={marketingOptIn}
                                        onChange={(e) => setMarketingOptIn(e.target.checked)}
                                        disabled={loading}
                                        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                                    />
                                    <span className="text-muted-foreground">
                                        I'd like to receive product updates and promotions
                                    </span>
                                </label>
                            </div>

                            <Button type="submit" disabled={loading} className="mt-1 w-full">
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <LoadingSpinner size="sm" />
                                        Creating account...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4" />
                                        Create Account
                                    </span>
                                )}
                            </Button>

                            {onLoginClick && (
                                <p className="mt-1 text-center text-sm text-muted-foreground">
                                    Already have an account?{' '}
                                    <button
                                        type="button"
                                        className="font-medium text-primary underline-offset-4 hover:underline"
                                        onClick={onLoginClick}
                                    >
                                        Sign in
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
