import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    PageTransition,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    useApi,
    useAuth,
    Avatar,
    AvatarFallback,
    cn,
    getInitials,
} from '@caricash/ui';
import {
    QrCode,
    ScanLine,
    Store,
    Sparkles,
    Camera,
    CircleAlert,
    ShieldAlert,
    Loader2,
    ReceiptText,
    ShieldCheck,
    Zap,
    ChevronRight,
} from 'lucide-react';
import { ActionConfirmModal } from '../components/action-confirm-modal.js';
import {
    CustomerSuccessDialog,
    CustomerFlowStepPills,
    CustomerStickyActionBar,
    QuickAmountGrid,
    VerificationSuccessNotice,
} from '../components/customer-flow-ui.js';
import { consumePayFlowPrefill } from '../lib/customer-prefill.js';

interface PostingReceipt {
    posting_id: string;
    state: string;
    [key: string]: unknown;
}

interface ActorLookupResult {
    actor: {
        id: string;
        type: string;
        state: string;
        name: string;
        first_name?: string;
        last_name?: string;
    };
}

interface RecentMerchant {
    storeCode: string;
    merchantName?: string;
}

interface ParsedMerchantQr {
    storeCode: string;
    merchantName?: string;
    amount?: string;
}

interface BarcodeResultLike {
    rawValue?: string;
}

interface BarcodeDetectorLike {
    detect: (source: ImageBitmapSource) => Promise<BarcodeResultLike[]>;
}

type BarcodeDetectorCtorLike = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const QUICK_AMOUNTS = ['20.00', '50.00', '100.00', '200.00'] as const;
const RECENT_MERCHANTS_KEY = 'caricash_recent_merchants';

function getBarcodeDetectorCtor(): BarcodeDetectorCtorLike | null {
    const candidate = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtorLike }).BarcodeDetector;
    return candidate ?? null;
}

function sanitizeAmount(input: string): string {
    const numeric = Number(input);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    return numeric.toFixed(2);
}

function parseMerchantQrPayload(rawInput: string): ParsedMerchantQr | null {
    const raw = rawInput.trim();
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') {
            const data = parsed as Record<string, unknown>;
            const storeCode = (data.store_code ?? data.storeCode ?? data.store) as string | undefined;
            if (typeof storeCode === 'string' && storeCode.trim()) {
                const amountValue = (data.amount ?? data.total) as string | number | undefined;
                const merchantName = (data.merchant_name ?? data.merchantName ?? data.merchant) as string | undefined;
                return {
                    storeCode: storeCode.trim(),
                    amount: amountValue !== undefined ? sanitizeAmount(String(amountValue)) : undefined,
                    merchantName: typeof merchantName === 'string' ? merchantName.trim() : undefined,
                };
            }
        }
    } catch {
        // Continue parsing other formats.
    }

    try {
        if (raw.includes('://')) {
            const url = new URL(raw);
            const storeCode = url.searchParams.get('store_code') ?? url.searchParams.get('store') ?? url.searchParams.get('merchant');
            const amount = url.searchParams.get('amount');
            const merchantName = url.searchParams.get('merchant_name') ?? url.searchParams.get('merchantName');
            if (storeCode) {
                return {
                    storeCode: storeCode.trim(),
                    amount: amount ? sanitizeAmount(amount) : undefined,
                    merchantName: merchantName?.trim() || undefined,
                };
            }
        }
    } catch {
        // Continue parsing regex formats.
    }

    const storeMatch = raw.match(/(?:store_code|store|merchant)\s*[:=]\s*([A-Za-z0-9_-]+)/i);
    if (storeMatch?.[1]) {
        const amountMatch = raw.match(/(?:amount|amt)\s*[:=]\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
        return {
            storeCode: storeMatch[1].trim(),
            amount: amountMatch?.[1] ? sanitizeAmount(amountMatch[1]) : undefined,
        };
    }

    if (/^[A-Za-z0-9_-]{4,}$/.test(raw)) {
        return { storeCode: raw };
    }

    return null;
}

function loadRecentMerchants(): RecentMerchant[] {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(RECENT_MERCHANTS_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(
                (entry): entry is RecentMerchant =>
                    !!entry &&
                    typeof entry === 'object' &&
                    typeof (entry as { storeCode?: unknown }).storeCode === 'string',
            )
            .map((entry) => ({
                storeCode: entry.storeCode.trim(),
                merchantName: entry.merchantName?.trim() || undefined,
            }))
            .filter((entry) => !!entry.storeCode)
            .slice(0, 6);
    } catch {
        return [];
    }
}

function persistRecentMerchant(merchant: RecentMerchant): RecentMerchant[] {
    const current = loadRecentMerchants();
    const next = [
        merchant,
        ...current.filter((item) => item.storeCode !== merchant.storeCode),
    ].slice(0, 6);
    localStorage.setItem(RECENT_MERCHANTS_KEY, JSON.stringify(next));
    return next;
}

export function PayMerchantPage() {
    const { actor } = useAuth();
    const api = useApi();
    const navigate = useNavigate();

    const [storeCode, setStoreCode] = useState('');
    const [merchantName, setMerchantName] = useState('');
    const [amount, setAmount] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [receipt, setReceipt] = useState<PostingReceipt | null>(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerError, setScannerError] = useState<string | null>(null);
    const [manualQrPayload, setManualQrPayload] = useState('');
    const [recentMerchants, setRecentMerchants] = useState<RecentMerchant[]>(() => loadRecentMerchants());

    // Recipient verification state
    const [verifiedMerchant, setVerifiedMerchant] = useState<ActorLookupResult['actor'] | null>(null);
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);

    useEffect(() => {
        const prefill = consumePayFlowPrefill();
        if (!prefill) return;
        if (prefill.storeCode) setStoreCode(prefill.storeCode);
        if (prefill.merchantName) setMerchantName(prefill.merchantName);
        if (prefill.amount) setAmount(prefill.amount);
    }, []);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const frameRef = useRef<number | null>(null);

    const numericAmount = useMemo(() => Number(amount), [amount]);
    const normalizedAmount = Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount.toFixed(2) : '0.00';
    const canReview = storeCode.trim().length >= 3 && Number.isFinite(numericAmount) && numericAmount > 0;

    const stopScanner = useCallback(() => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
        if (streamRef.current) {
            for (const track of streamRef.current.getTracks()) {
                track.stop();
            }
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const applyParsedQr = useCallback(
        (parsed: ParsedMerchantQr) => {
            setStoreCode(parsed.storeCode);
            if (parsed.amount) setAmount(parsed.amount);
            if (parsed.merchantName) setMerchantName(parsed.merchantName);
            setScannerError(null);
            setScannerOpen(false);
            setManualQrPayload('');
            stopScanner();
        },
        [stopScanner],
    );

    useEffect(() => {
        if (!scannerOpen) {
            stopScanner();
            return;
        }

        let cancelled = false;
        async function startScanning() {
            setScannerError(null);

            const detectorCtor = getBarcodeDetectorCtor();
            if (!detectorCtor) {
                setScannerError('QR auto scan is not available in this browser. Paste QR payload below.');
                return;
            }

            if (!navigator.mediaDevices?.getUserMedia) {
                setScannerError('Camera access is unavailable on this device.');
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false,
                });
                if (cancelled) {
                    for (const track of stream.getTracks()) track.stop();
                    return;
                }

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                const detector = new detectorCtor({ formats: ['qr_code'] });
                const scanFrame = async () => {
                    if (cancelled || !videoRef.current) return;

                    try {
                        const barcodes = await detector.detect(videoRef.current);
                        const rawValue = barcodes.find((item) => typeof item.rawValue === 'string')?.rawValue;
                        if (rawValue) {
                            const parsed = parseMerchantQrPayload(rawValue);
                            if (parsed) {
                                applyParsedQr(parsed);
                                return;
                            }
                            setScannerError('QR read succeeded but format was not recognized.');
                        }
                    } catch {
                        // Continue scanning without interrupting UX.
                    }

                    frameRef.current = requestAnimationFrame(() => {
                        void scanFrame();
                    });
                };
                frameRef.current = requestAnimationFrame(() => {
                    void scanFrame();
                });
            } catch {
                setScannerError('Unable to open camera. Check permissions and try again.');
            }
        }

        void startScanning();

        return () => {
            cancelled = true;
            stopScanner();
        };
    }, [applyParsedQr, scannerOpen, stopScanner]);

    const mutation = useMutation({
        mutationFn: async () => {
            return api.post<PostingReceipt>('/tx/payment', {
                customer_msisdn: actor!.name,
                store_code: storeCode.trim(),
                amount: normalizedAmount,
                currency: 'BBD',
                idempotency_key: crypto.randomUUID(),
            });
        },
        onSuccess: (res) => {
            setReceipt(res);
            setRecentMerchants(
                persistRecentMerchant({
                    storeCode: storeCode.trim(),
                    merchantName: merchantName.trim() || undefined,
                }),
            );
            setStoreCode('');
            setMerchantName('');
            setAmount('');
            setConfirmPin('');
            setConfirmOpen(false);
            setVerifiedMerchant(null);
        },
    });

    async function beginReview() {
        if (!canReview) return;

        // Look up merchant before showing PIN modal
        setVerifyLoading(true);
        setVerifyError(null);
        setVerifiedMerchant(null);

        try {
            const result = await api.get<ActorLookupResult>(
                `/actors/lookup?store_code=${encodeURIComponent(storeCode.trim())}`,
            );
            setVerifiedMerchant(result.actor);
            // Also update merchant name from verified data
            if (result.actor.name && !merchantName.trim()) {
                setMerchantName(result.actor.name);
            }
            setConfirmOpen(true);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Merchant not found';
            setVerifyError(msg);
        } finally {
            setVerifyLoading(false);
        }
    }

    async function handleReviewSubmit(e: React.FormEvent) {
        e.preventDefault();
        await beginReview();
    }

    function getMerchantDisplayName(): string {
        if (verifiedMerchant) {
            const parts = [verifiedMerchant.first_name, verifiedMerchant.last_name].filter(Boolean);
            if (parts.length > 0) return `${verifiedMerchant.name} (${parts.join(' ')})`;
            return verifiedMerchant.name;
        }
        return merchantName.trim() || storeCode.trim() || '-';
    }

    const stepItems = [
        {
            key: 'merchant',
            label: 'Merchant',
            state: (storeCode.trim().length >= 3 ? 'done' : 'active') as 'done' | 'active',
        },
        {
            key: 'amount',
            label: 'Amount',
            state: (
                Number.isFinite(numericAmount) && numericAmount > 0
                    ? 'done'
                    : storeCode.trim().length >= 3
                        ? 'active'
                        : 'upcoming'
            ) as 'upcoming' | 'active' | 'done',
        },
        {
            key: 'review',
            label: 'Review & PIN',
            state: (
                confirmOpen || verifiedMerchant
                    ? 'done'
                    : canReview
                        ? 'active'
                        : 'upcoming'
            ) as 'upcoming' | 'active' | 'done',
        },
    ];

    return (
        <PageTransition>
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
                                    <Badge variant="outline" className="rounded-xl">Pay Merchant</Badge>
                                    <Badge variant="outline" className="rounded-xl inline-flex items-center gap-1">
                                        <Zap className="h-3 w-3 text-primary" />
                                        Checkout flow
                                    </Badge>
                                    <Badge variant="outline" className="rounded-xl">BBD 0.00 fee</Badge>
                                </div>
                                <CardTitle className="text-lg tracking-tight sm:text-xl">
                                    Confirmed checkout in three steps
                                </CardTitle>
                                <CardDescription className="mt-1 text-sm">
                                    Choose a merchant, confirm the amount, then authorize securely with your PIN.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={() => navigate({ to: '/history' })}
                                >
                                    <ReceiptText className="h-4 w-4" />
                                    Activity
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={() => navigate({ to: '/send' })}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                    Send instead
                                </Button>
                            </div>
                        </div>

                        <CustomerFlowStepPills steps={stepItems} />
                    </CardHeader>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: 0.03 }}
                    >
                        <Card className="rounded-3xl border-border/70 bg-background/88">
                            <form onSubmit={handleReviewSubmit}>
                                <CardHeader className="space-y-2 px-4 py-4 sm:px-5">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Store className="h-4 w-4 text-primary" />
                                        Merchant & Amount
                                    </CardTitle>
                                    <CardDescription className="text-sm">
                                        Manual entry or QR scan both end with merchant verification before PIN.
                                    </CardDescription>
                                </CardHeader>

                                <CardContent className="space-y-4 px-4 pb-4 sm:px-5">
                                    <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-semibold">Merchant Checkout</p>
                                            <Badge variant="outline" className="rounded-xl">Secure</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Review the verified merchant and amount before entering your PIN.
                                        </p>
                                    </div>

                                    <Tabs defaultValue="manual">
                                        <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                            <TabsList className="w-full rounded-xl">
                                                <TabsTrigger value="manual" className="flex-1">Manual</TabsTrigger>
                                                <TabsTrigger value="scan" className="flex-1">Scan QR</TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="manual" className="space-y-4">
                                                <motion.div
                                                    initial={{ opacity: 0, y: 6 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="space-y-4"
                                                >
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="store-code">Store Code</Label>
                                                        <Input
                                                            id="store-code"
                                                            type="text"
                                                            placeholder="e.g. STORE001"
                                                            value={storeCode}
                                                            onChange={(e) => setStoreCode(e.target.value)}
                                                            className="h-11 rounded-xl border-border/70"
                                                            required
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="merchant-name">Merchant Name (optional)</Label>
                                                        <Input
                                                            id="merchant-name"
                                                            type="text"
                                                            placeholder="e.g. Corner Grocer"
                                                            value={merchantName}
                                                            onChange={(e) => setMerchantName(e.target.value)}
                                                            className="h-11 rounded-xl border-border/70"
                                                        />
                                                    </div>
                                                </motion.div>
                                            </TabsContent>

                                            <TabsContent value="scan" className="space-y-4">
                                                <motion.div
                                                    initial={{ opacity: 0, y: 6 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="space-y-4"
                                                >
                                                    <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 p-4">
                                                        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                                                            <QrCode className="h-4 w-4 text-primary" />
                                                            Scan merchant QR
                                                        </p>
                                                        <p className="mb-3 text-xs text-muted-foreground">
                                                            Autofill store code and amount when supported by the QR payload.
                                                        </p>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            className="w-full rounded-xl"
                                                            onClick={() => setScannerOpen(true)}
                                                        >
                                                            <ScanLine className="h-4 w-4" />
                                                            Open QR Scanner
                                                        </Button>
                                                    </div>

                                                    <div className="grid gap-4 sm:grid-cols-2">
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="store-code-scan">Store Code</Label>
                                                            <Input
                                                                id="store-code-scan"
                                                                type="text"
                                                                placeholder="Autofilled or enter manually"
                                                                value={storeCode}
                                                                onChange={(e) => setStoreCode(e.target.value)}
                                                                className="h-11 rounded-xl border-border/70"
                                                                required
                                                            />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="merchant-name-scan">Merchant Name</Label>
                                                            <Input
                                                                id="merchant-name-scan"
                                                                type="text"
                                                                placeholder="Optional"
                                                                value={merchantName}
                                                                onChange={(e) => setMerchantName(e.target.value)}
                                                                className="h-11 rounded-xl border-border/70"
                                                            />
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            </TabsContent>
                                        </div>
                                    </Tabs>

                                    {recentMerchants.length > 0 ? (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                                Recent Merchants
                                            </p>
                                            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                                {recentMerchants.map((merchant) => {
                                                    const selected = storeCode.trim() === merchant.storeCode;
                                                    return (
                                                        <motion.button
                                                            key={`${merchant.storeCode}-${merchant.merchantName ?? ''}`}
                                                            type="button"
                                                            whileHover={{ y: -1 }}
                                                            whileTap={{ scale: 0.98 }}
                                                            onClick={() => {
                                                                setStoreCode(merchant.storeCode);
                                                                setMerchantName(merchant.merchantName ?? '');
                                                            }}
                                                            className={cn(
                                                                'min-w-[160px] shrink-0 rounded-2xl border p-3 text-left transition-colors',
                                                                selected
                                                                    ? 'border-primary/25 bg-primary/10'
                                                                    : 'border-border/70 bg-background/80 hover:border-primary/20 hover:bg-primary/5',
                                                            )}
                                                        >
                                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                                <Avatar className="h-7 w-7 rounded-xl border bg-background">
                                                                    <AvatarFallback className="rounded-xl text-[10px]">
                                                                        {getInitials(merchant.merchantName || merchant.storeCode)}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <Badge variant="outline" className="rounded-lg px-2 py-0.5 text-[10px]">
                                                                    Pay
                                                                </Badge>
                                                            </div>
                                                            <p className="truncate text-xs font-semibold">
                                                                {merchant.merchantName || merchant.storeCode}
                                                            </p>
                                                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                                                                {merchant.merchantName ? merchant.storeCode : 'Merchant code'}
                                                            </p>
                                                        </motion.button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                                        <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="amount">Amount (BBD)</Label>
                                                <Input
                                                    id="amount"
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    value={amount}
                                                    onChange={(e) => setAmount(e.target.value)}
                                                    className="h-11 rounded-xl border-border/70 text-base"
                                                    required
                                                />
                                            </div>
                                            <QuickAmountGrid amounts={QUICK_AMOUNTS} onSelect={setAmount} />
                                        </div>

                                        <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                                            <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                    <p className="text-sm font-semibold">Checkout preview</p>
                                                    <Badge variant="outline" className="rounded-xl">
                                                        <ShieldCheck className="h-3 w-3 text-primary" />
                                                        Protected
                                                    </Badge>
                                                </div>
                                                <p className="text-2xl font-semibold tracking-tight">BBD {normalizedAmount}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Zero service fee for this customer payment.
                                                </p>
                                            </div>

                                            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 p-3 text-sm">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-muted-foreground">Store code</span>
                                                    <span className="max-w-[60%] truncate font-semibold">{storeCode.trim() || 'Not set'}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-muted-foreground">Merchant</span>
                                                    <span className="max-w-[60%] truncate font-semibold">{merchantName.trim() || 'Optional'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <AnimatePresence initial={false}>
                                        {verifiedMerchant ? (
                                            <motion.div
                                                key="verified-merchant"
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 6 }}
                                            >
                                                <VerificationSuccessNotice
                                                    title="Merchant verified"
                                                    description={`${getMerchantDisplayName()} is confirmed for this payment.`}
                                                />
                                            </motion.div>
                                        ) : null}
                                    </AnimatePresence>

                                    <AnimatePresence initial={false}>
                                        {verifyError ? (
                                            <motion.div
                                                key="merchant-verify-error"
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 6 }}
                                                className="flex items-start gap-2 rounded-2xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
                                            >
                                                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                                <span>{verifyError}</span>
                                            </motion.div>
                                        ) : null}
                                    </AnimatePresence>

                                    <AnimatePresence initial={false}>
                                        {mutation.isError ? (
                                            <motion.p
                                                key="merchant-mutation-error"
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 6 }}
                                                className="text-sm text-destructive"
                                            >
                                                {mutation.error?.message ?? 'Payment failed. Please try again.'}
                                            </motion.p>
                                        ) : null}
                                    </AnimatePresence>
                                </CardContent>

                                <CardFooter className="hidden flex-col gap-2 px-4 pb-5 sm:px-5 lg:flex">
                                    <Button type="submit" className="w-full rounded-xl" disabled={!canReview || verifyLoading}>
                                        {verifyLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Verifying merchant...
                                            </>
                                        ) : (
                                            'Review Payment'
                                        )}
                                    </Button>
                                    <p className="text-center text-xs text-muted-foreground">
                                        Final confirmation is available only after merchant verification.
                                    </p>
                                </CardFooter>
                            </form>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: 0.06 }}
                        className="space-y-4 lg:sticky lg:top-6 lg:self-start"
                    >
                        <Card className="rounded-3xl border-border/70 bg-background/88">
                            <CardHeader className="space-y-2 px-4 py-4 sm:px-5">
                                <CardTitle className="text-base">Payment Snapshot</CardTitle>
                                <CardDescription className="text-sm">
                                    Live merchant checkout summary.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 px-4 pb-5 sm:px-5">
                                <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-primary/8 to-transparent p-4">
                                    <div className="mb-2 flex items-center justify-between">
                                        <p className="text-sm font-semibold">You are paying</p>
                                        <Badge variant="outline" className="rounded-xl">Secure</Badge>
                                    </div>
                                    <p className="text-2xl font-semibold tracking-tight">BBD {normalizedAmount}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">PIN required to authorize</p>
                                </div>

                                <div className="space-y-2 rounded-2xl border border-border/70 bg-background/75 p-4 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Store code</span>
                                        <span className="max-w-[60%] truncate font-semibold">{storeCode.trim() || 'Not set'}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Merchant</span>
                                        <span className="max-w-[60%] truncate font-semibold">{getMerchantDisplayName()}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Fee</span>
                                        <span className="font-semibold">BBD 0.00</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-3xl border-border/70 bg-background/88">
                            <CardHeader className="space-y-2 px-4 py-4 sm:px-5">
                                <CardTitle className="text-base">Checkout tips</CardTitle>
                                <CardDescription className="text-sm">
                                    Faster payments with fewer mistakes.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2.5 px-4 pb-5 sm:px-5">
                                <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm">
                                    <Camera className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>Use QR when available to reduce typing errors.</span>
                                </div>
                                <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm">
                                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>Always confirm the verified merchant before PIN entry.</span>
                                </div>
                                <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm">
                                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>Recent merchants can prefill checkout details with one tap.</span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </motion.div>

            <CustomerStickyActionBar
                title={`BBD ${normalizedAmount}`}
                subtitle={
                    storeCode.trim()
                        ? `Pay ${merchantName.trim() || storeCode.trim()}`
                        : 'Add merchant and amount to continue'
                }
                actionLabel={verifyLoading ? 'Verifying...' : 'Review'}
                onAction={() => {
                    void beginReview();
                }}
                disabled={!canReview || verifyLoading}
                loading={verifyLoading}
                icon={<Store className="h-4 w-4" />}
            />

            <ActionConfirmModal
                open={confirmOpen}
                onOpenChange={(open) => {
                    setConfirmOpen(open);
                    if (!open) setConfirmPin('');
                }}
                title="Confirm Merchant Payment"
                description="Verify the merchant details and enter your PIN to authorize."
                summary={[
                    { label: 'From', value: actor?.name ?? 'Your wallet' },
                    { label: 'Store code', value: storeCode.trim() || '-' },
                    { label: 'Merchant', value: getMerchantDisplayName() },
                    { label: 'Amount', value: `BBD ${normalizedAmount}` },
                    { label: 'Fee', value: 'BBD 0.00' },
                ]}
                pin={confirmPin}
                onPinChange={setConfirmPin}
                onConfirm={() => mutation.mutate()}
                confirmLabel="Confirm Payment"
                loading={mutation.isPending}
                error={mutation.isError ? mutation.error?.message ?? 'Payment failed.' : null}
            />

            <Dialog
                open={scannerOpen}
                onOpenChange={(open) => {
                    setScannerOpen(open);
                    if (!open) {
                        setScannerError(null);
                        setManualQrPayload('');
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Scan Merchant QR</DialogTitle>
                        <DialogDescription>
                            Align the merchant QR code within the frame. Store code will be filled automatically.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/25">
                            <video ref={videoRef} className="h-56 w-full object-cover" autoPlay muted playsInline />
                        </div>

                        {scannerError ? <p className="text-sm text-destructive">{scannerError}</p> : null}

                        <div className="space-y-1.5">
                            <Label htmlFor="manual-qr-payload">Paste QR payload (fallback)</Label>
                            <Input
                                id="manual-qr-payload"
                                type="text"
                                placeholder="Paste scanned text if camera is unavailable"
                                value={manualQrPayload}
                                onChange={(e) => setManualQrPayload(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                const parsed = parseMerchantQrPayload(manualQrPayload);
                                if (!parsed) {
                                    setScannerError('Unable to parse that QR payload. Check format and try again.');
                                    return;
                                }
                                applyParsedQr(parsed);
                            }}
                        >
                            Use Pasted Payload
                        </Button>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Close
                            </Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <CustomerSuccessDialog
                open={!!receipt}
                onOpenChange={(open) => {
                    if (!open) setReceipt(null);
                }}
                title="Payment Successful"
                description="Your payment has been processed."
            >
                {receipt ? (
                    <div className="rounded-md bg-muted p-4 text-sm">
                        <p>
                            <span className="font-medium">Posting ID:</span> {receipt.posting_id}
                        </p>
                        <p>
                            <span className="font-medium">State:</span> {receipt.state}
                        </p>
                    </div>
                ) : null}
            </CustomerSuccessDialog>
        </PageTransition>
    );
}
