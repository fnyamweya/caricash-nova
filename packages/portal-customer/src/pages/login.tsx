import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Phone, ShieldCheck } from 'lucide-react';
import { useAuth, useApi } from '@caricash/ui';
import {
    CustomerAuthError,
    CustomerAuthLinkPrompt,
    CustomerAuthSection,
    CustomerAuthShell,
    CustomerAuthSubmitButton,
    CustomerPinField,
    CustomerTextField,
} from '../components/customer-auth-ui.js';

interface LoginResponse {
    token: string;
    actor_id: string;
    actor_type: string;
    session_id: string;
}

export function LoginPage() {
    const navigate = useNavigate();
    const auth = useAuth();
    const api = useApi();
    const [error, setError] = useState<string | null>(null);
    const [identifier, setIdentifier] = useState('');
    const [pin, setPin] = useState('');
    const [showPin, setShowPin] = useState(false);

    const mutation = useMutation({
        mutationFn: async (data: { identifier: string; pin: string }) => {
            return api.post<LoginResponse>('/auth/customer/login', {
                msisdn: data.identifier,
                pin: data.pin,
            });
        },
        onSuccess: (res, variables) => {
            auth.login(res.token, {
                id: res.actor_id,
                type: res.actor_type,
                name: variables.identifier,
            });
            navigate({ to: '/dashboard' });
        },
        onError: (err: Error) => {
            setError(err.message ?? 'Login failed. Please try again.');
        },
    });

    return (
        <CustomerAuthShell
            mode="login"
            formBadge="Customer Sign In"
            formTitle="Welcome back"
            formDescription="Access your wallet to send money, pay merchants, and review your activity."
            footer={(
                <div className="w-full space-y-3">
                    <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-xs text-muted-foreground">
                        Use the phone number linked to your customer wallet and your PIN.
                    </div>
                    <CustomerAuthLinkPrompt
                        prompt="New to CariCash?"
                        actionLabel="Create an account"
                        onAction={() => navigate({ to: '/register' })}
                    />
                </div>
            )}
        >
            <form
                className="flex flex-col gap-4"
                onSubmit={async (e) => {
                    e.preventDefault();
                    setError(null);
                    await mutation.mutateAsync({ identifier, pin });
                }}
            >
                <CustomerAuthError error={error} />

                <CustomerAuthSection
                    title="Wallet access"
                    description="Sign in with the phone number you used during registration."
                >
                    <CustomerTextField
                        id="identifier"
                        label="Phone Number"
                        value={identifier}
                        onChange={setIdentifier}
                        placeholder="e.g. +12465551234"
                        icon={<Phone className="h-4 w-4" />}
                        required
                        disabled={mutation.isPending}
                        autoComplete="username"
                        inputMode="tel"
                        hint="Include country code if applicable."
                    />
                    <CustomerPinField
                        id="pin"
                        label="PIN"
                        value={pin}
                        onChange={setPin}
                        placeholder="Enter your PIN"
                        show={showPin}
                        onToggleShow={() => setShowPin((prev) => !prev)}
                        disabled={mutation.isPending}
                        autoComplete="current-password"
                        hint={(
                            <span className="inline-flex items-center gap-1">
                                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                                PIN is required before any wallet action.
                            </span>
                        )}
                    />
                </CustomerAuthSection>

                <CustomerAuthSubmitButton
                    loading={mutation.isPending}
                    idleLabel="Sign In"
                    loadingLabel="Signing in..."
                />
            </form>
        </CustomerAuthShell>
    );
}
