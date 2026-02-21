import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Lock,
    Phone,
    Store,
    User,
    Mail,
    Sparkles,
    ShieldCheck,
    Clock3,
    Eye,
    EyeOff,
    Building2,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { LoadingSpinner } from './loading-spinner.js';

export interface MerchantRegisterData {
    store_code: string;
    name: string;
    owner_name: string;
    msisdn: string;
    email?: string;
    pin: string;
}

export interface MerchantRegisterFormProps {
    onSubmit: (data: MerchantRegisterData) => Promise<void>;
    loading?: boolean;
    error?: string | null;
    onLoginClick?: () => void;
}

export function MerchantRegisterForm({
    onSubmit,
    loading = false,
    error = null,
    onLoginClick,
}: MerchantRegisterFormProps) {
    const [storeCode, setStoreCode] = useState('');
    const [storeName, setStoreName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [msisdn, setMsisdn] = useState('');
    const [email, setEmail] = useState('');
    const [pin, setPin] = useState('');
    const [pinConfirm, setPinConfirm] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

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

        await onSubmit({
            store_code: storeCode,
            name: storeName,
            owner_name: ownerName,
            msisdn,
            email: email || undefined,
            pin,
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
                <div className="relative hidden flex-col justify-between border-r border-border/70 bg-gradient-to-br from-primary/15 via-accent/5 to-transparent p-8 md:flex">
                    <div>
                        <Badge variant="outline" className="mb-3 w-fit">
                            New Merchant
                        </Badge>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">
                            CariCash
                        </h1>
                        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
                            Register your store to start accepting payments, managing your team, and transferring settlement funds.
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
                            Business operations suite
                        </div>
                    </div>
                </div>

                <Card className="rounded-none border-0 bg-transparent shadow-none">
                    <CardHeader className="pb-4">
                        <Badge variant="outline" className="w-fit">
                            Merchant Portal
                        </Badge>
                        <CardTitle className="text-2xl">Register your store</CardTitle>
                        <CardDescription>
                            Set up your merchant account. You will become the store owner and can add team members later.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                            {displayError && (
                                <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    {displayError}
                                </div>
                            )}

                            {/* Store details */}
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="store-code">Store Code</Label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        <Building2 className="h-4 w-4" />
                                    </span>
                                    <Input
                                        id="store-code"
                                        value={storeCode}
                                        onChange={(e) => setStoreCode(e.target.value.toUpperCase())}
                                        placeholder="e.g. STORE001"
                                        className="pl-10"
                                        required
                                        disabled={loading}
                                        autoComplete="off"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="store-name">Store Name</Label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        <Store className="h-4 w-4" />
                                    </span>
                                    <Input
                                        id="store-name"
                                        value={storeName}
                                        onChange={(e) => setStoreName(e.target.value)}
                                        placeholder="Your business name"
                                        className="pl-10"
                                        required
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            {/* Owner details */}
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="owner-name">Your Name</Label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        <User className="h-4 w-4" />
                                    </span>
                                    <Input
                                        id="owner-name"
                                        value={ownerName}
                                        onChange={(e) => setOwnerName(e.target.value)}
                                        placeholder="John Doe"
                                        className="pl-10"
                                        required
                                        disabled={loading}
                                        autoComplete="name"
                                    />
                                </div>
                            </div>

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

                            <Button type="submit" disabled={loading} className="mt-1 w-full">
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <LoadingSpinner size="sm" />
                                        Registering...
                                    </span>
                                ) : (
                                    'Register Store'
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
