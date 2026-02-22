import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Badge, Button } from '@caricash/ui';
import { Building2, Phone, Store } from 'lucide-react';
import { MerchantAuthField, MerchantAuthModeToggle, MerchantAuthShell, MerchantAuthSubmit, MerchantPinField, merchantAuthIcons } from '../components/merchant-auth-ui.js';
import { setActiveMerchantStore } from '../lib/merchant-workspace.js';
import { useAuth, useApi } from '@caricash/ui';

interface LoginResponse {
    token: string;
    actor_id: string;
    actor_type: string;
    session_id: string;
}

type LoginMode = 'merchant' | 'store';

export function LoginPage() {
    const navigate = useNavigate();
    const auth = useAuth();
    const api = useApi();
    const [mode, setMode] = useState<LoginMode>('merchant');
    const [storeCode, setStoreCode] = useState('');
    const [msisdn, setMsisdn] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: async () => {
            return api.post<LoginResponse>('/auth/merchant/login', {
                msisdn: msisdn.trim(),
                pin,
                ...(mode === 'store' && storeCode.trim() ? { store_code: storeCode.trim() } : {}),
            });
        },
        onSuccess: (res) => {
            if (mode === 'store' && storeCode.trim()) {
                setActiveMerchantStore(storeCode.trim().toUpperCase());
            }
            auth.login(res.token, {
                id: res.actor_id,
                type: res.actor_type,
                name: mode === 'store' && storeCode.trim() ? storeCode.trim().toUpperCase() : msisdn.trim(),
            });
            navigate({ to: '/dashboard' });
        },
        onError: (err: Error) => {
            setError(err.message ?? 'Login failed. Please try again.');
        },
    });

    const canSubmit = !!msisdn.trim() && !!pin.trim() && (mode === 'merchant' || !!storeCode.trim());

    return (
        <MerchantAuthShell
            title="Sign in to your merchant workspace"
            subtitle="Choose merchant or store authentication and continue to your collection and settlement dashboard."
            sideTitle="Future-ready merchant operations"
            sideText="A merchant-first experience for collections, branch store management, transfers, and settlement workflows on mobile, tablet, and desktop."
            footer={(
                <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3 text-sm sm:flex-row">
                    <div className="text-center sm:text-left">
                        <p className="font-medium">New merchant?</p>
                        <p className="text-xs text-muted-foreground">Create your merchant account and start collecting.</p>
                    </div>
                    <Button asChild variant="outline" className="w-full rounded-xl sm:w-auto">
                        <Link to="/register">Register Merchant</Link>
                    </Button>
                </div>
            )}
        >
            <MerchantAuthModeToggle<LoginMode>
                value={mode}
                onChange={(value) => {
                    setMode(value);
                    setError(null);
                }}
                options={[
                    {
                        value: 'merchant',
                        label: 'Merchant Login',
                        helper: 'Owner/manager sign-in using MSISDN and PIN.',
                        icon: <Building2 className="h-4 w-4" />,
                    },
                    {
                        value: 'store',
                        label: 'Store Authentication',
                        helper: 'Store staff sign-in with store code + MSISDN + PIN.',
                        icon: <Store className="h-4 w-4" />,
                    },
                ]}
            />

            <form
                className="space-y-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    if (!canSubmit) return;
                    mutation.mutate();
                }}
            >
                {mode === 'store' ? (
                    <MerchantAuthField
                        id="store-code"
                        label="Store Code"
                        icon={merchantAuthIcons.store}
                        value={storeCode}
                        onChange={(e) => setStoreCode(e.target.value.toUpperCase())}
                        placeholder="e.g. STORE-001"
                        autoComplete="off"
                        hint="Use the branch store code for cashier/store-scoped access."
                    />
                ) : null}

                <MerchantAuthField
                    id="merchant-msisdn"
                    label="MSISDN"
                    icon={merchantAuthIcons.phone}
                    type="tel"
                    inputMode="tel"
                    value={msisdn}
                    onChange={(e) => setMsisdn(e.target.value)}
                    placeholder="+12465551234"
                    autoComplete="username"
                />

                <MerchantPinField
                    id="merchant-pin"
                    label="PIN"
                    value={pin}
                    onChange={setPin}
                    placeholder="Enter your PIN"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-muted/20 px-3 py-2">
                    <div className="text-xs text-muted-foreground">
                        <p>Mode</p>
                        <p className="font-medium text-foreground">{mode === 'merchant' ? 'Merchant account sign-in' : 'Store authentication sign-in'}</p>
                    </div>
                    <Badge className="rounded-full bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/12">
                        {mode === 'merchant' ? 'Owner / Manager' : 'Store / Cashier'}
                    </Badge>
                </div>

                {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-500/8 p-3 text-sm text-rose-700">{error}</div>
                ) : null}

                <MerchantAuthSubmit loading={mutation.isPending}>Continue to Merchant Portal</MerchantAuthSubmit>
            </form>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Store auth fields included</p>
                <p className="mt-1">This login supports `store_code`, `msisdn`, and `pin` for store-scoped merchant-user compatibility.</p>
            </div>
        </MerchantAuthShell>
    );
}
