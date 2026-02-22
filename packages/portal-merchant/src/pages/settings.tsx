import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Badge,
    Button,
    EmptyState,
    Input,
    Label,
    LoadingSpinner,
    PageTransition,
    formatCurrency,
    useApi,
    useAuth,
} from '@caricash/ui';
import {
    Building2,
    CheckCircle,
    Landmark,
    Loader2,
    Mail,
    ShieldCheck,
    Store,
    User,
    Wallet,
} from 'lucide-react';
import { MerchantHero, MerchantSection, MerchantSegmentedFilters, MerchantStickyActionBar } from '../components/merchant-ui.js';
import { useMerchantWorkspace } from '../lib/merchant-workspace.js';

interface MerchantProfileResponse {
    merchant: {
        id: string;
        name: string;
        display_name?: string | null;
        email?: string | null;
        msisdn?: string | null;
        store_code?: string | null;
        kyc_state?: string | null;
        created_at?: string;
        updated_at?: string;
    };
    wallet: {
        account_id: string;
        currency: string;
        actual_balance?: string;
        available_balance?: string;
    } | null;
    kyc: {
        status?: string;
        verification_level?: string | number;
        submitted_at?: string | null;
    } | null;
}

interface MerchantKycResponse {
    profile?: {
        status?: string;
        verification_level?: string | number;
        submitted_at?: string | null;
        documents_json?: string | null;
    } | null;
    requirements?: Array<{
        id?: string;
        code?: string;
        name?: string;
        label?: string;
        description?: string;
    }>;
}

interface CreateStoreResponse {
    store: {
        id: string;
        name: string;
        store_code: string;
        state?: string;
        kyc_state?: string;
    };
    store_code: string;
}

type SettingsPanel = 'profile' | 'stores' | 'settlement' | 'security';

export function SettingsPage() {
    const { actor } = useAuth();
    const api = useApi();
    const queryClient = useQueryClient();
    const {
        stores,
        activeStoreCode,
        setActiveStoreCode,
        rememberStore,
        storesQuery,
        preferences,
        updatePreferences,
    } = useMerchantWorkspace();

    const [panel, setPanel] = useState<SettingsPanel>('profile');

    const profileQuery = useQuery<MerchantProfileResponse>({
        queryKey: ['merchant-profile', actor?.id],
        queryFn: () => api.get(`/merchants/${actor!.id}`),
        enabled: !!actor?.id,
    });

    const kycQuery = useQuery<MerchantKycResponse>({
        queryKey: ['merchant-kyc-profile', actor?.id],
        queryFn: () => api.get(`/merchants/${actor!.id}/kyc`),
        enabled: !!actor?.id,
    });

    const [profileForm, setProfileForm] = useState({
        name: '',
        display_name: '',
        email: '',
    });
    const [kycForm, setKycForm] = useState({
        document_type: 'BUSINESS_REGISTRATION',
        document_number: '',
    });
    const [storeForm, setStoreForm] = useState({
        store_code: '',
        name: '',
        msisdn: '',
        owner_name: '',
        email: '',
        pin: '',
    });
    const [settlementForm, setSettlementForm] = useState({
        settlementBankName: preferences?.settlementBankName ?? '',
        settlementAccountName: preferences?.settlementAccountName ?? '',
        settlementAccountNo: preferences?.settlementAccountNo ?? '',
        settlementFrequency: preferences?.settlementFrequency ?? 'manual',
        settlementThreshold: preferences?.settlementThreshold ?? '500.00',
        notifyPayments: preferences?.notifications?.payments ?? true,
        notifySettlements: preferences?.notifications?.settlements ?? true,
        notifyTeam: preferences?.notifications?.team ?? true,
        notifyRisk: preferences?.notifications?.risk ?? true,
    });

    useEffect(() => {
        const merchant = profileQuery.data?.merchant;
        if (!merchant) return;
        setProfileForm((prev) => ({
            name: prev.name || merchant.name || '',
            display_name: prev.display_name || merchant.display_name || '',
            email: prev.email || merchant.email || '',
        }));
    }, [profileQuery.data?.merchant]);

    useEffect(() => {
        setSettlementForm((prev) => ({
            ...prev,
            settlementBankName: preferences?.settlementBankName ?? prev.settlementBankName,
            settlementAccountName: preferences?.settlementAccountName ?? prev.settlementAccountName,
            settlementAccountNo: preferences?.settlementAccountNo ?? prev.settlementAccountNo,
            settlementFrequency: preferences?.settlementFrequency ?? prev.settlementFrequency,
            settlementThreshold: preferences?.settlementThreshold ?? prev.settlementThreshold,
            notifyPayments: preferences?.notifications?.payments ?? prev.notifyPayments,
            notifySettlements: preferences?.notifications?.settlements ?? prev.notifySettlements,
            notifyTeam: preferences?.notifications?.team ?? prev.notifyTeam,
            notifyRisk: preferences?.notifications?.risk ?? prev.notifyRisk,
        }));
    }, [preferences]);

    const profileMutation = useMutation({
        mutationFn: async () => api.put(`/merchants/${actor!.id}`, {
            name: profileForm.name.trim(),
            display_name: profileForm.display_name.trim(),
            email: profileForm.email.trim(),
        }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['merchant-profile', actor?.id] });
        },
    });

    const kycMutation = useMutation({
        mutationFn: async () => api.post(`/merchants/${actor!.id}/kyc/initiate`, {
            document_type: kycForm.document_type,
            document_number: kycForm.document_number.trim(),
        }),
        onSuccess: () => {
            void Promise.all([
                queryClient.invalidateQueries({ queryKey: ['merchant-kyc-profile', actor?.id] }),
                queryClient.invalidateQueries({ queryKey: ['merchant-profile', actor?.id] }),
            ]);
        },
    });

    const createStoreMutation = useMutation<CreateStoreResponse>({
        mutationFn: async () => api.post(`/merchants/${actor!.id}/stores`, {
            store_code: storeForm.store_code.trim() || undefined,
            name: storeForm.name.trim(),
            msisdn: storeForm.msisdn.trim(),
            owner_name: storeForm.owner_name.trim(),
            email: storeForm.email.trim() || undefined,
            pin: storeForm.pin,
        }),
        onSuccess: (result) => {
            rememberStore(result.store);
            setActiveStoreCode(result.store.store_code || result.store_code);
            setStoreForm({ store_code: '', name: '', msisdn: '', owner_name: '', email: '', pin: '' });
            void queryClient.invalidateQueries({ queryKey: ['merchant-stores-workspace', actor?.id] });
        },
    });

    const walletBalance = profileQuery.data?.wallet?.available_balance ?? profileQuery.data?.wallet?.actual_balance ?? '0.00';
    const kycStatus = profileQuery.data?.kyc?.status ?? profileQuery.data?.merchant?.kyc_state ?? 'NOT_STARTED';
    const kycRequirements = kycQuery.data?.requirements ?? [];

    const profileDirty = useMemo(() => {
        const merchant = profileQuery.data?.merchant;
        if (!merchant) return false;
        return profileForm.name !== (merchant.name ?? '')
            || profileForm.display_name !== (merchant.display_name ?? '')
            || profileForm.email !== (merchant.email ?? '');
    }, [profileForm, profileQuery.data?.merchant]);

    const settlementDirty = true;
    const canCreateStore = !!storeForm.name.trim() && !!storeForm.msisdn.trim() && !!storeForm.owner_name.trim() && storeForm.pin.trim().length >= 4;
    const canSubmitKyc = !!kycForm.document_type && !!kycForm.document_number.trim();

    return (
        <PageTransition>
            <div className="flex flex-col gap-4 md:gap-5">
                <MerchantHero
                    title="Merchant Settings & Operations Controls"
                    description="Manage your business profile, branch stores, KYC posture, and settlement preferences in one polished control center."
                    badge={activeStoreCode ? `Active store ${activeStoreCode}` : 'Settings workspace'}
                    actions={(
                        <Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1">
                            {stores.length} store{stores.length === 1 ? '' : 's'} connected
                        </Badge>
                    )}
                >
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MiniCard icon={<Building2 className="h-4 w-4" />} label="Merchant" value={profileQuery.data?.merchant?.name ?? 'Loading…'} />
                        <MiniCard icon={<Wallet className="h-4 w-4" />} label="Wallet" value={formatCurrency(walletBalance, 'BBD')} />
                        <MiniCard icon={<ShieldCheck className="h-4 w-4" />} label="KYC Status" value={String(kycStatus)} tone="emerald" />
                        <MiniCard icon={<Store className="h-4 w-4" />} label="Stores" value={`${stores.length}`} tone="blue" />
                    </div>
                </MerchantHero>

                <MerchantSection title="Settings Areas" description="Move between merchant profile, stores, settlement preferences, and security/KYC without losing context.">
                    <MerchantSegmentedFilters<SettingsPanel>
                        value={panel}
                        onChange={setPanel}
                        options={[
                            { value: 'profile', label: 'Profile' },
                            { value: 'stores', label: 'Stores', count: stores.length },
                            { value: 'settlement', label: 'Settlement' },
                            { value: 'security', label: 'Security & KYC' },
                        ]}
                    />
                </MerchantSection>

                <AnimatePresence mode="wait" initial={false}>
                    {panel === 'profile' ? (
                        <motion.div key="profile" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                            <MerchantSection title="Business Profile" description="Update how your merchant appears in the platform and communications.">
                                {profileQuery.isLoading ? (
                                    <div className="flex justify-center py-8"><LoadingSpinner /></div>
                                ) : (
                                    <div className="space-y-4">
                                        <Field label="Legal / Merchant Name" htmlFor="merchant-name">
                                            <Input id="merchant-name" value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} className="h-11 rounded-xl" />
                                        </Field>
                                        <Field label="Display Name" htmlFor="merchant-display-name" hint="Shown in merchant-facing UI and QR labels where applicable.">
                                            <Input id="merchant-display-name" value={profileForm.display_name} onChange={(e) => setProfileForm((p) => ({ ...p, display_name: e.target.value }))} className="h-11 rounded-xl" placeholder="Optional display name" />
                                        </Field>
                                        <Field label="Business Email" htmlFor="merchant-email">
                                            <Input id="merchant-email" type="email" value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} className="h-11 rounded-xl" placeholder="merchant@example.com" />
                                        </Field>

                                        {profileMutation.isError ? (
                                            <div className="rounded-2xl border border-rose-200 bg-rose-500/8 p-3 text-sm text-rose-700">
                                                {profileMutation.error instanceof Error ? profileMutation.error.message : 'Failed to save merchant profile.'}
                                            </div>
                                        ) : null}
                                        {profileMutation.isSuccess ? (
                                            <div className="rounded-2xl border border-emerald-200 bg-emerald-500/8 p-3 text-sm text-emerald-700">
                                                Merchant profile updated successfully.
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </MerchantSection>

                            <MerchantSection title="Profile Snapshot" description="Reference details from your merchant actor and wallet.">
                                <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
                                    <ReadOnlyRow icon={<User className="h-4 w-4" />} label="MSISDN" value={profileQuery.data?.merchant?.msisdn || '—'} />
                                    <ReadOnlyRow icon={<Mail className="h-4 w-4" />} label="Email" value={profileQuery.data?.merchant?.email || '—'} />
                                    <ReadOnlyRow icon={<Store className="h-4 w-4" />} label="Default Store Code" value={profileQuery.data?.merchant?.store_code || '—'} />
                                    <ReadOnlyRow icon={<Wallet className="h-4 w-4" />} label="Wallet Account" value={profileQuery.data?.wallet?.account_id || '—'} mono />
                                    <ReadOnlyRow icon={<ShieldCheck className="h-4 w-4" />} label="KYC" value={String(kycStatus)} />
                                </div>
                            </MerchantSection>
                        </motion.div>
                    ) : null}

                    {panel === 'stores' ? (
                        <motion.div key="stores" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                            <MerchantSection title="Branch Store Directory" description="Switch active stores and manage which branch your operations team is working from.">
                                {storesQuery.isLoading ? (
                                    <div className="flex justify-center py-8"><LoadingSpinner /></div>
                                ) : stores.length > 0 ? (
                                    <div className="space-y-2">
                                        {stores.map((store) => (
                                            <button
                                                key={store.store_code}
                                                type="button"
                                                onClick={() => setActiveStoreCode(store.store_code)}
                                                className={cn(
                                                    'flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left',
                                                    activeStoreCode === store.store_code ? 'border-emerald-300 bg-emerald-500/8' : 'border-border/70 hover:bg-accent/30',
                                                )}
                                            >
                                                <div className="min-w-0 flex items-center gap-3">
                                                    <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', activeStoreCode === store.store_code ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted')}>
                                                        <Store className="h-4 w-4" />
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-semibold">{store.name}</span>
                                                        <span className="block truncate text-xs text-muted-foreground">{store.store_code}</span>
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant={activeStoreCode === store.store_code ? 'default' : 'outline'} className={cn(activeStoreCode === store.store_code ? 'bg-emerald-600 hover:bg-emerald-600' : '', 'rounded-full')}>
                                                        {activeStoreCode === store.store_code ? 'Active' : (store.state || 'Store')}
                                                    </Badge>
                                                    <Badge variant="outline" className="rounded-full">{store.kyc_state || 'KYC'}</Badge>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState icon={<Store />} title="No stores added yet" description="Create your first branch store below to start using store switching and team assignment workflows." />
                                )}
                            </MerchantSection>

                            <MerchantSection title="Add Branch Store" description="Create a new merchant store branch and owner credentials in one guided form.">
                                <div className="space-y-3">
                                    <Field label="Store Name" htmlFor="store-name">
                                        <Input id="store-name" value={storeForm.name} onChange={(e) => setStoreForm((p) => ({ ...p, name: e.target.value }))} className="h-11 rounded-xl" placeholder="Sunset Mall Branch" />
                                    </Field>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="Store Code (optional)" htmlFor="store-code" hint="Leave blank to auto-generate.">
                                            <Input id="store-code" value={storeForm.store_code} onChange={(e) => setStoreForm((p) => ({ ...p, store_code: e.target.value.toUpperCase() }))} className="h-11 rounded-xl" placeholder="STORE-002" />
                                        </Field>
                                        <Field label="Store Phone (MSISDN)" htmlFor="store-msisdn">
                                            <Input id="store-msisdn" value={storeForm.msisdn} onChange={(e) => setStoreForm((p) => ({ ...p, msisdn: e.target.value }))} className="h-11 rounded-xl" placeholder="+1246..." />
                                        </Field>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="Store Owner Name" htmlFor="store-owner-name">
                                            <Input id="store-owner-name" value={storeForm.owner_name} onChange={(e) => setStoreForm((p) => ({ ...p, owner_name: e.target.value }))} className="h-11 rounded-xl" placeholder="Branch Manager" />
                                        </Field>
                                        <Field label="Store Email (optional)" htmlFor="store-email">
                                            <Input id="store-email" type="email" value={storeForm.email} onChange={(e) => setStoreForm((p) => ({ ...p, email: e.target.value }))} className="h-11 rounded-xl" placeholder="branch@example.com" />
                                        </Field>
                                    </div>
                                    <Field label="Store PIN (4-6 digits)" htmlFor="store-pin" hint="Used for store-level authentication and user setup.">
                                        <Input id="store-pin" type="password" inputMode="numeric" maxLength={6} value={storeForm.pin} onChange={(e) => setStoreForm((p) => ({ ...p, pin: e.target.value }))} className="h-11 rounded-xl" placeholder="Enter PIN" />
                                    </Field>

                                    {createStoreMutation.isError ? (
                                        <div className="rounded-2xl border border-rose-200 bg-rose-500/8 p-3 text-sm text-rose-700">
                                            {createStoreMutation.error instanceof Error ? createStoreMutation.error.message : 'Failed to create branch store.'}
                                        </div>
                                    ) : null}
                                    {createStoreMutation.isSuccess ? (
                                        <div className="rounded-2xl border border-emerald-200 bg-emerald-500/8 p-3 text-sm text-emerald-700">
                                            Branch store created and added to your workspace.
                                        </div>
                                    ) : null}

                                    <Button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90" disabled={!canCreateStore || createStoreMutation.isPending} onClick={() => createStoreMutation.mutate()}>
                                        {createStoreMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                                        {createStoreMutation.isPending ? 'Creating Store…' : 'Create Branch Store'}
                                    </Button>
                                </div>
                            </MerchantSection>
                        </motion.div>
                    ) : null}

                    {panel === 'settlement' ? (
                        <motion.div key="settlement" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                            <MerchantSection title="Settlement Preferences" description="Store payout details and operational defaults so your team can request settlement faster.">
                                <div className="space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="Bank Name" htmlFor="pref-bank-name">
                                            <Input id="pref-bank-name" value={settlementForm.settlementBankName} onChange={(e) => setSettlementForm((p) => ({ ...p, settlementBankName: e.target.value }))} className="h-11 rounded-xl" placeholder="Bank name" />
                                        </Field>
                                        <Field label="Account Name" htmlFor="pref-account-name">
                                            <Input id="pref-account-name" value={settlementForm.settlementAccountName} onChange={(e) => setSettlementForm((p) => ({ ...p, settlementAccountName: e.target.value }))} className="h-11 rounded-xl" placeholder="Business account name" />
                                        </Field>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="Account Number" htmlFor="pref-account-no">
                                            <Input id="pref-account-no" value={settlementForm.settlementAccountNo} onChange={(e) => setSettlementForm((p) => ({ ...p, settlementAccountNo: e.target.value }))} className="h-11 rounded-xl" placeholder="Account number" />
                                        </Field>
                                        <Field label="Threshold (BBD)" htmlFor="pref-threshold" hint="Optional target for automatic/manual settlement decisions.">
                                            <Input id="pref-threshold" value={settlementForm.settlementThreshold} onChange={(e) => setSettlementForm((p) => ({ ...p, settlementThreshold: e.target.value }))} className="h-11 rounded-xl" placeholder="500.00" />
                                        </Field>
                                    </div>

                                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Settlement frequency preference</p>
                                        <MerchantSegmentedFilters<'manual' | 'daily' | 'weekly'>
                                            value={settlementForm.settlementFrequency as 'manual' | 'daily' | 'weekly'}
                                            onChange={(value) => setSettlementForm((p) => ({ ...p, settlementFrequency: value }))}
                                            options={[
                                                { value: 'manual', label: 'Manual' },
                                                { value: 'daily', label: 'Daily' },
                                                { value: 'weekly', label: 'Weekly' },
                                            ]}
                                        />
                                    </div>

                                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Notifications</p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <ToggleRow label="Payment alerts" checked={settlementForm.notifyPayments} onToggle={() => setSettlementForm((p) => ({ ...p, notifyPayments: !p.notifyPayments }))} />
                                            <ToggleRow label="Settlement updates" checked={settlementForm.notifySettlements} onToggle={() => setSettlementForm((p) => ({ ...p, notifySettlements: !p.notifySettlements }))} />
                                            <ToggleRow label="Team changes" checked={settlementForm.notifyTeam} onToggle={() => setSettlementForm((p) => ({ ...p, notifyTeam: !p.notifyTeam }))} />
                                            <ToggleRow label="Risk signals" checked={settlementForm.notifyRisk} onToggle={() => setSettlementForm((p) => ({ ...p, notifyRisk: !p.notifyRisk }))} />
                                        </div>
                                    </div>
                                </div>
                            </MerchantSection>

                            <MerchantSection title="Settlement Profile Preview" description="This data pre-fills the settlement request flow to reduce repetitive manual entry.">
                                <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
                                    <ReadOnlyRow icon={<Landmark className="h-4 w-4" />} label="Bank" value={settlementForm.settlementBankName || '—'} />
                                    <ReadOnlyRow icon={<User className="h-4 w-4" />} label="Account Name" value={settlementForm.settlementAccountName || '—'} />
                                    <ReadOnlyRow icon={<Wallet className="h-4 w-4" />} label="Account Number" value={settlementForm.settlementAccountNo || '—'} mono />
                                    <ReadOnlyRow icon={<CheckCircle className="h-4 w-4" />} label="Frequency" value={settlementForm.settlementFrequency} />
                                    <ReadOnlyRow icon={<Wallet className="h-4 w-4" />} label="Threshold" value={formatCurrency(settlementForm.settlementThreshold || '0', 'BBD')} />
                                </div>
                            </MerchantSection>
                        </motion.div>
                    ) : null}

                    {panel === 'security' ? (
                        <motion.div key="security" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                            <MerchantSection title="Merchant KYC" description="Submit merchant verification details and track compliance status directly from settings.">
                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className="rounded-full">Current status: {String(kycStatus)}</Badge>
                                            <Badge className="rounded-full bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/12">
                                                {kycRequirements.length} requirement{kycRequirements.length === 1 ? '' : 's'}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Use the form below to initiate or re-submit merchant KYC. This helps streamline collections, transfers, and settlement checks.
                                        </p>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="Document Type" htmlFor="merchant-kyc-doc-type">
                                            <Input id="merchant-kyc-doc-type" value={kycForm.document_type} onChange={(e) => setKycForm((p) => ({ ...p, document_type: e.target.value.toUpperCase() }))} className="h-11 rounded-xl" placeholder="BUSINESS_REGISTRATION" />
                                        </Field>
                                        <Field label="Document Number" htmlFor="merchant-kyc-doc-number">
                                            <Input id="merchant-kyc-doc-number" value={kycForm.document_number} onChange={(e) => setKycForm((p) => ({ ...p, document_number: e.target.value }))} className="h-11 rounded-xl" placeholder="Registration number" />
                                        </Field>
                                    </div>

                                    {kycMutation.isError ? (
                                        <div className="rounded-2xl border border-rose-200 bg-rose-500/8 p-3 text-sm text-rose-700">
                                            {kycMutation.error instanceof Error ? kycMutation.error.message : 'Failed to submit KYC.'}
                                        </div>
                                    ) : null}
                                    {kycMutation.isSuccess ? (
                                        <div className="rounded-2xl border border-emerald-200 bg-emerald-500/8 p-3 text-sm text-emerald-700">
                                            KYC submission initiated successfully. Your status should move to `PENDING`.
                                        </div>
                                    ) : null}

                                    <Button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90" disabled={!canSubmitKyc || kycMutation.isPending} onClick={() => kycMutation.mutate()}>
                                        {kycMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                                        {kycMutation.isPending ? 'Submitting KYC…' : 'Submit KYC Details'}
                                    </Button>
                                </div>
                            </MerchantSection>

                            <MerchantSection title="Security & Store Auth Guidance" description="Use store-scoped sign-in for branch staff and cashier-specific operations.">
                                <div className="space-y-3">
                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-500/8 p-3">
                                        <p className="text-sm font-semibold text-emerald-700">Store authentication is available on login</p>
                                        <p className="mt-1 text-xs text-emerald-700/90">
                                            Branch staff can sign in with `store_code`, `msisdn`, and `pin` for store-specific workflows.
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">KYC requirements preview</p>
                                        {kycRequirements.length > 0 ? (
                                            <div className="space-y-2">
                                                {kycRequirements.slice(0, 6).map((req, index) => (
                                                    <div key={req.id ?? req.code ?? index} className="rounded-xl border border-border/60 bg-background/70 p-2 text-sm">
                                                        <p className="font-medium">{req.label || req.name || req.code || `Requirement ${index + 1}`}</p>
                                                        {req.description ? <p className="mt-1 text-xs text-muted-foreground">{req.description}</p> : null}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">Requirements will appear here once loaded.</p>
                                        )}
                                    </div>
                                </div>
                            </MerchantSection>
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                <MerchantStickyActionBar
                    title={panel === 'profile' ? 'Save merchant profile changes' : panel === 'settlement' ? 'Save settlement defaults' : panel === 'security' ? 'Submit KYC or review security setup' : 'Create and switch branch stores'}
                    subtitle={panel === 'settlement' ? 'Preferences are stored locally in the merchant workspace for faster settlement request entry.' : panel === 'stores' ? 'Use the branch creation form or switch the active store above.' : 'Keep merchant operations smooth by keeping settings and compliance up to date.'}
                    secondary={<Button variant="outline" className="w-full rounded-xl sm:w-auto" onClick={() => void Promise.all([profileQuery.refetch(), kycQuery.refetch(), storesQuery.refetch()])}>Refresh Data</Button>}
                    primary={
                        panel === 'profile' ? (
                            <Button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90 sm:w-auto" disabled={!profileDirty || profileMutation.isPending || profileQuery.isLoading} onClick={() => profileMutation.mutate()}>
                                {profileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                {profileMutation.isPending ? 'Saving…' : 'Save Profile'}
                            </Button>
                        ) : panel === 'settlement' ? (
                            <Button
                                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90 sm:w-auto"
                                disabled={!settlementDirty}
                                onClick={() => updatePreferences({
                                    settlementBankName: settlementForm.settlementBankName,
                                    settlementAccountName: settlementForm.settlementAccountName,
                                    settlementAccountNo: settlementForm.settlementAccountNo,
                                    settlementFrequency: settlementForm.settlementFrequency as 'manual' | 'daily' | 'weekly',
                                    settlementThreshold: settlementForm.settlementThreshold,
                                    notifications: {
                                        payments: settlementForm.notifyPayments,
                                        settlements: settlementForm.notifySettlements,
                                        team: settlementForm.notifyTeam,
                                        risk: settlementForm.notifyRisk,
                                    },
                                })}
                            >
                                <Landmark className="h-4 w-4" />
                                Save Settlement Preferences
                            </Button>
                        ) : panel === 'security' ? (
                            <Button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90 sm:w-auto" disabled={!canSubmitKyc || kycMutation.isPending} onClick={() => kycMutation.mutate()}>
                                {kycMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                                {kycMutation.isPending ? 'Submitting KYC…' : 'Submit KYC'}
                            </Button>
                        ) : (
                            <Button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90 sm:w-auto" disabled={!canCreateStore || createStoreMutation.isPending} onClick={() => createStoreMutation.mutate()}>
                                {createStoreMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                                {createStoreMutation.isPending ? 'Creating Store…' : 'Create Branch Store'}
                            </Button>
                        )
                    }
                />
            </div>
        </PageTransition>
    );
}

function Field({
    label,
    htmlFor,
    hint,
    children,
}: {
    label: string;
    htmlFor: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={htmlFor}>{label}</Label>
            {children}
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

function ToggleRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className={cn(
                'flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm',
                checked ? 'border-emerald-300 bg-emerald-500/8 text-emerald-700' : 'border-border/70 bg-background/70',
            )}
        >
            <span>{label}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', checked ? 'bg-emerald-500/15' : 'bg-muted text-muted-foreground')}>
                {checked ? 'On' : 'Off'}
            </span>
        </button>
    );
}

function MiniCard({ icon, label, value, tone = 'slate' }: { icon: React.ReactNode; label: string; value: string; tone?: 'slate' | 'emerald' | 'blue' }) {
    return (
        <div className={cn(
            'rounded-2xl border p-3',
            tone === 'emerald' && 'border-emerald-200 bg-emerald-500/8',
            tone === 'blue' && 'border-blue-200 bg-blue-500/8',
            tone === 'slate' && 'border-border/70 bg-background/70',
        )}>
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-background/80">{icon}</div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold">{value}</p>
        </div>
    );
}

function ReadOnlyRow({
    icon,
    label,
    value,
    mono = false,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2">
            <div className="inline-flex min-w-0 items-center gap-2">
                <span className="text-muted-foreground">{icon}</span>
                <span className="text-sm text-muted-foreground">{label}</span>
            </div>
            <span className={cn('max-w-[60%] text-right text-sm font-medium break-words', mono && 'font-mono text-xs')}>{value}</span>
        </div>
    );
}

function cn(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}
