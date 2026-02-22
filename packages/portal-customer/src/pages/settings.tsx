import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    cn,
    useApi,
    useAuth,
} from '@caricash/ui';
import {
    Bell,
    FileText,
    LockKeyhole,
    Settings2,
    ShieldCheck,
    Sparkles,
    UserRound,
    Wallet,
    Zap,
} from 'lucide-react';
import {
    type CustomerFlowStep,
    CustomerFlowStepPills,
    CustomerStickyActionBar,
    CustomerSuccessDialog,
} from '../components/customer-flow-ui.js';

const DOCUMENT_TYPES = [
    { value: 'NATIONAL_ID', label: 'National ID' },
    { value: 'PASSPORT', label: 'Passport' },
    { value: 'DRIVERS_LICENSE', label: "Driver's License" },
] as const;

function parseCustomerName(name?: string | null): { firstName: string; lastName: string; raw: string } {
    const raw = name?.trim() ?? '';
    if (!raw) return { firstName: 'Customer', lastName: '', raw: '' };
    if (!/[A-Za-z]/.test(raw)) return { firstName: 'Customer', lastName: '', raw };
    const parts = raw.split(/\s+/).filter(Boolean);
    return { firstName: parts[0] ?? 'Customer', lastName: parts.slice(1).join(' '), raw };
}

type SettingsTab = 'verification' | 'preferences';

export function SettingsPage() {
    const { actor } = useAuth();
    const api = useApi();

    const [documentType, setDocumentType] = useState('');
    const [documentNumber, setDocumentNumber] = useState('');
    const [success, setSuccess] = useState(false);
    const [tab, setTab] = useState<SettingsTab>('verification');

    const customerName = useMemo(() => parseCustomerName(actor?.name), [actor?.name]);
    const fullName = `${customerName.firstName}${customerName.lastName ? ` ${customerName.lastName}` : ''}`;

    const mutation = useMutation({
        mutationFn: async () => {
            return api.post(`/customers/${actor!.id}/kyc/initiate`, {
                document_type: documentType,
                document_number: documentNumber,
            });
        },
        onSuccess: () => {
            setSuccess(true);
            setDocumentType('');
            setDocumentNumber('');
            setTab('verification');
        },
    });

    const canSubmitKyc = !!documentType && !!documentNumber && !mutation.isPending;

    async function submitKyc() {
        if (!canSubmitKyc) return;
        await mutation.mutateAsync();
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        void submitKyc();
    }

    const stepItems: CustomerFlowStep[] = [
        { key: 'profile', label: 'Profile', state: 'done' as const },
        { key: 'preferences', label: 'Preferences', state: tab === 'preferences' ? 'active' as const : 'done' as const },
        {
            key: 'verification',
            label: 'Verification',
            state: tab === 'verification'
                ? (documentType && documentNumber ? 'done' : 'active')
                : 'upcoming',
        } as CustomerFlowStep,
    ];

    return (
        <PageSettingsShell>
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="space-y-4 sm:space-y-5"
            >
                <Card className="overflow-hidden rounded-3xl border-border/70 bg-background/88">
                    <CardHeader className="space-y-4 border-b border-border/60 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-4 sm:px-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="rounded-xl">Settings</Badge>
                                    <Badge variant="outline" className="rounded-xl inline-flex items-center gap-1">
                                        <Wallet className="h-3 w-3" />
                                        Customer wallet
                                    </Badge>
                                    <Badge variant="outline" className="rounded-xl inline-flex items-center gap-1">
                                        <Zap className="h-3 w-3 text-primary" />
                                        Personalize & verify
                                    </Badge>
                                </div>
                                <CardTitle className="text-lg tracking-tight sm:text-xl">
                                    Your profile and wallet preferences
                                </CardTitle>
                                <CardDescription className="mt-1 text-sm">
                                    Manage identity verification, appearance, and everyday wallet safety settings in one place.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <AppearanceMenu compact />
                            </div>
                        </div>

                        <CustomerFlowStepPills steps={stepItems} />
                    </CardHeader>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: 0.03 }}
                        className="space-y-4 xl:sticky xl:top-6 xl:self-start"
                    >
                        <Card className="rounded-3xl border-border/70 bg-background/88">
                            <CardHeader className="space-y-2 px-4 py-4 sm:px-5">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <UserRound className="h-4 w-4 text-primary" />
                                    Profile Overview
                                </CardTitle>
                                <CardDescription className="text-sm">
                                    Wallet identity used across transfers and merchant payments.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2.5 px-4 pb-5 sm:px-5">
                                <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/75 px-3 py-2.5 text-sm">
                                    <span className="text-muted-foreground">Name</span>
                                    <span className="max-w-[60%] truncate font-semibold">{fullName}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/75 px-3 py-2.5 text-sm">
                                    <span className="text-muted-foreground">Wallet ID</span>
                                    <span className="max-w-[60%] truncate font-semibold">{actor?.id ?? '—'}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/75 px-3 py-2.5 text-sm">
                                    <span className="text-muted-foreground">Contact</span>
                                    <span className="max-w-[60%] truncate font-semibold">{actor?.name ?? '—'}</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-3xl border-border/70 bg-background/88">
                            <CardHeader className="space-y-2 px-4 py-4 sm:px-5">
                                <CardTitle className="text-base">Profile completion</CardTitle>
                                <CardDescription className="text-sm">
                                    Complete verification for a smoother payments experience.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 px-4 pb-5 sm:px-5">
                                <div className="rounded-2xl border border-border/70 bg-background/75 p-4">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <p className="text-sm font-semibold">Identity verification</p>
                                        <Badge variant="outline" className="rounded-xl">
                                            {documentType && documentNumber ? 'Ready' : 'Pending'}
                                        </Badge>
                                    </div>
                                    <div className="h-2 rounded-full bg-muted">
                                        <motion.div
                                            initial={false}
                                            animate={{ width: documentType && documentNumber ? '88%' : '52%' }}
                                            transition={{ duration: 0.25 }}
                                            className="h-full rounded-full bg-primary"
                                        />
                                    </div>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Submit a valid document in the verification tab to continue.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/75 px-3 py-2.5 text-sm">
                                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                        <span>Verify recipient and merchant details before entering your PIN.</span>
                                    </div>
                                    <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/75 px-3 py-2.5 text-sm">
                                        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                        <span>Review the activity timeline frequently to catch mistakes early.</span>
                                    </div>
                                    <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/75 px-3 py-2.5 text-sm">
                                        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                        <span>Keep your PIN private and avoid reusing it outside your wallet.</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: 0.06 }}
                    >
                        <Card className="rounded-3xl border-border/70 bg-background/88">
                            <CardHeader className="space-y-3 px-4 py-4 sm:px-5">
                                <CardTitle className="text-base">Settings Workspace</CardTitle>
                                <CardDescription className="text-sm">
                                    Switch between verification and preferences without leaving the page.
                                </CardDescription>
                                <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)}>
                                    <TabsList className="w-full rounded-xl sm:w-auto">
                                        <TabsTrigger value="verification">Verification</TabsTrigger>
                                        <TabsTrigger value="preferences">Preferences</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="verification" className="mt-4 space-y-4">
                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key="verification-panel"
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -8 }}
                                                transition={{ duration: 0.18 }}
                                                className="space-y-4"
                                            >
                                                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                        <p className="text-sm font-semibold">KYC Verification</p>
                                                        <Badge variant="outline" className="rounded-xl">Secure form</Badge>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        Submit your document type and number for review. This helps enable smoother wallet activity.
                                                    </p>
                                                </div>

                                                <form onSubmit={handleSubmit} className="space-y-4">
                                                    <div className="grid gap-4 sm:grid-cols-2">
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="doc-type">Document Type</Label>
                                                            <Select value={documentType} onValueChange={setDocumentType}>
                                                                <SelectTrigger id="doc-type" className="h-11 rounded-xl border-border/70">
                                                                    <SelectValue placeholder="Select document type" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {DOCUMENT_TYPES.map((dt) => (
                                                                        <SelectItem key={dt.value} value={dt.value}>
                                                                            {dt.label}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="doc-number">Document Number</Label>
                                                            <Input
                                                                id="doc-number"
                                                                type="text"
                                                                placeholder="Enter document number"
                                                                value={documentNumber}
                                                                onChange={(e) => setDocumentNumber(e.target.value)}
                                                                className="h-11 rounded-xl border-border/70"
                                                                required
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="grid gap-3 sm:grid-cols-3">
                                                        {DOCUMENT_TYPES.map((dt) => (
                                                            <button
                                                                key={dt.value}
                                                                type="button"
                                                                onClick={() => setDocumentType(dt.value)}
                                                                className={cn(
                                                                    'rounded-2xl border px-3 py-3 text-left text-sm transition-colors',
                                                                    documentType === dt.value
                                                                        ? 'border-primary/25 bg-primary/10'
                                                                        : 'border-border/70 bg-background/70 hover:bg-primary/5',
                                                                )}
                                                            >
                                                                <div className="mb-1 flex items-center justify-between gap-2">
                                                                    <FileText className="h-4 w-4 text-primary" />
                                                                    <Badge variant="outline" className="rounded-lg px-2 py-0.5 text-[10px]">
                                                                        Accepted
                                                                    </Badge>
                                                                </div>
                                                                <p className="text-xs font-semibold">{dt.label}</p>
                                                            </button>
                                                        ))}
                                                    </div>

                                                    <AnimatePresence initial={false}>
                                                        {mutation.isError ? (
                                                            <motion.p
                                                                key="kyc-error"
                                                                initial={{ opacity: 0, y: 6 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, y: 6 }}
                                                                className="text-sm text-destructive"
                                                            >
                                                                {mutation.error?.message ?? 'Submission failed. Please try again.'}
                                                            </motion.p>
                                                        ) : null}
                                                    </AnimatePresence>

                                                    <div className="hidden flex-col gap-2 lg:flex">
                                                        <Button
                                                            type="submit"
                                                            className="w-full rounded-xl"
                                                            disabled={!canSubmitKyc}
                                                        >
                                                            {mutation.isPending ? 'Submitting…' : 'Submit KYC'}
                                                        </Button>
                                                        <p className="text-center text-xs text-muted-foreground">
                                                            Review usually begins shortly after successful submission.
                                                        </p>
                                                    </div>
                                                </form>
                                            </motion.div>
                                        </AnimatePresence>
                                    </TabsContent>

                                    <TabsContent value="preferences" className="mt-4 space-y-4">
                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key="preferences-panel"
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -8 }}
                                                transition={{ duration: 0.18 }}
                                                className="space-y-4"
                                            >
                                                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                        <p className="text-sm font-semibold">Appearance & Feel</p>
                                                        <AppearanceMenu compact />
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        Theme, mode, and wallet shell style apply instantly across all customer screens.
                                                    </p>
                                                </div>

                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <Card className="rounded-2xl border-border/70 bg-background/70 shadow-none">
                                                        <CardHeader className="space-y-1 px-4 py-4">
                                                            <CardTitle className="flex items-center gap-2 text-sm">
                                                                <Settings2 className="h-4 w-4 text-primary" />
                                                                Wallet Preferences
                                                            </CardTitle>
                                                            <CardDescription className="text-xs">
                                                                Fintech-style surfaces, theme presets, and responsive shell options.
                                                            </CardDescription>
                                                        </CardHeader>
                                                        <CardFooter className="px-4 pb-4 pt-0">
                                                            <AppearanceMenu compact />
                                                        </CardFooter>
                                                    </Card>

                                                    <Card className="rounded-2xl border-border/70 bg-background/70 shadow-none">
                                                        <CardHeader className="space-y-1 px-4 py-4">
                                                            <CardTitle className="flex items-center gap-2 text-sm">
                                                                <Sparkles className="h-4 w-4 text-primary" />
                                                                Flow Guidance
                                                            </CardTitle>
                                                            <CardDescription className="text-xs">
                                                                Recipient and merchant verification stays enabled before PIN confirmation.
                                                            </CardDescription>
                                                        </CardHeader>
                                                        <CardContent className="px-4 pb-4 pt-0 text-xs text-muted-foreground">
                                                            Built for quick but safe everyday payments on mobile and tablet.
                                                        </CardContent>
                                                    </Card>
                                                </div>
                                            </motion.div>
                                        </AnimatePresence>
                                    </TabsContent>
                                </Tabs>
                            </CardHeader>
                        </Card>
                    </motion.div>
                </div>
            </motion.div>

            {tab === 'verification' ? (
                <CustomerStickyActionBar
                    title={documentType ? DOCUMENT_TYPES.find((dt) => dt.value === documentType)?.label ?? 'Document selected' : 'KYC verification'}
                    subtitle={documentNumber ? `Doc #: ${documentNumber}` : 'Select a document type and enter number'}
                    actionLabel={mutation.isPending ? 'Submitting…' : 'Submit KYC'}
                    onAction={() => {
                        void submitKyc();
                    }}
                    disabled={!canSubmitKyc}
                    loading={mutation.isPending}
                    icon={<ShieldCheck className="h-4 w-4" />}
                />
            ) : null}

            <CustomerSuccessDialog
                open={success}
                onOpenChange={setSuccess}
                title="KYC Submitted"
                description="Your identity documents have been submitted for review. We will notify you when verification is complete."
            />
        </PageSettingsShell>
    );
}

function PageSettingsShell({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
