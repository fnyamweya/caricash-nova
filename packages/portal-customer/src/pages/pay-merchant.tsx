import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
    PageHeader,
    PageTransition,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    useApi,
    useAuth,
} from '@caricash/ui';
import {
    CheckCircle,
    QrCode,
    ScanLine,
    Store,
    Sparkles,
    Camera,
    CircleAlert,
    ShieldAlert,
    Loader2,
} from 'lucide-react';
import { ActionConfirmModal } from '../components/action-confirm-modal.js';

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

    async function handleReviewSubmit(e: React.FormEvent) {
        e.preventDefault();
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

    function getMerchantDisplayName(): string {
        if (verifiedMerchant) {
            const parts = [verifiedMerchant.first_name, verifiedMerchant.last_name].filter(Boolean);
            if (parts.length > 0) return `${verifiedMerchant.name} (${parts.join(' ')})`;
            return verifiedMerchant.name;
        }
        return merchantName.trim() || storeCode.trim() || '-';
    }

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Pay Merchant"
                    description="Pay in store with code or QR, then confirm with your PIN."
                    badge="Merchant Payments"
                />

                <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                    <Card>
                        <form onSubmit={handleReviewSubmit}>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Store className="h-4 w-4 text-primary" />
                                    Payment Details
                                </CardTitle>
                                <CardDescription>
                                    Choose merchant entry mode and review before authorizing.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <Tabs defaultValue="manual">
                                    <TabsList className="w-full">
                                        <TabsTrigger value="manual" className="flex-1">
                                            Manual
                                        </TabsTrigger>
                                        <TabsTrigger value="scan" className="flex-1">
                                            Scan QR
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="manual" className="space-y-4">
                                        <div className="flex flex-col gap-1.5">
                                            <Label htmlFor="store-code">Store Code</Label>
                                            <Input
                                                id="store-code"
                                                type="text"
                                                placeholder="e.g. STORE001"
                                                value={storeCode}
                                                onChange={(e) => setStoreCode(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="scan" className="space-y-3">
                                        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4">
                                            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                                                <QrCode className="h-4 w-4 text-primary" />
                                                Scan Merchant QR
                                            </p>
                                            <p className="mb-3 text-sm text-muted-foreground">
                                                Scan a merchant QR to autofill store code and amount when available.
                                            </p>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full"
                                                onClick={() => setScannerOpen(true)}
                                            >
                                                <ScanLine className="mr-2 h-4 w-4" />
                                                Open QR Scanner
                                            </Button>
                                        </div>
                                    </TabsContent>
                                </Tabs>

                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="merchant-name">Merchant Name (optional)</Label>
                                    <Input
                                        id="merchant-name"
                                        type="text"
                                        placeholder="e.g. Corner Grocer"
                                        value={merchantName}
                                        onChange={(e) => setMerchantName(e.target.value)}
                                    />
                                </div>

                                {recentMerchants.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                            Recent Merchants
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {recentMerchants.map((merchant) => (
                                                <button
                                                    key={`${merchant.storeCode}-${merchant.merchantName ?? ''}`}
                                                    type="button"
                                                    className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary/40 hover:bg-accent/45"
                                                    onClick={() => {
                                                        setStoreCode(merchant.storeCode);
                                                        setMerchantName(merchant.merchantName ?? '');
                                                    }}
                                                >
                                                    {merchant.merchantName
                                                        ? `${merchant.merchantName} (${merchant.storeCode})`
                                                        : merchant.storeCode}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="amount">Amount (BBD)</Label>
                                    <Input
                                        id="amount"
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {QUICK_AMOUNTS.map((quick) => (
                                        <button
                                            key={quick}
                                            type="button"
                                            className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary/40 hover:bg-accent/45"
                                            onClick={() => setAmount(quick)}
                                        >
                                            BBD {quick}
                                        </button>
                                    ))}
                                </div>

                                {mutation.isError ? (
                                    <p className="text-sm text-destructive">
                                        {mutation.error?.message ?? 'Payment failed. Please try again.'}
                                    </p>
                                ) : null}

                                {verifyError ? (
                                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                        <span>{verifyError}</span>
                                    </div>
                                ) : null}
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" className="w-full" disabled={!canReview || verifyLoading}>
                                    {verifyLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Verifying merchant...
                                        </>
                                    ) : (
                                        'Review Payment'
                                    )}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Payment Snapshot</CardTitle>
                            <CardDescription>
                                Transparent checkout details before confirmation.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
                                <div className="mb-2 flex items-center justify-between">
                                    <p className="text-sm font-semibold">You are paying</p>
                                    <Badge variant="outline">Secure</Badge>
                                </div>
                                <p className="text-2xl font-bold tracking-tight">BBD {normalizedAmount}</p>
                            </div>

                            <div className="rounded-xl border border-border/70 p-4 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Store code</span>
                                    <span className="font-semibold">{storeCode.trim() || 'Not set'}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                    <span className="text-muted-foreground">Merchant</span>
                                    <span className="font-semibold">{merchantName.trim() || 'Not set'}</span>
                                </div>
                                {verifiedMerchant ? (
                                    <div className="mt-2 flex items-center justify-between">
                                        <span className="text-muted-foreground">Verified as</span>
                                        <span className="font-semibold text-green-600 dark:text-green-400">
                                            {getMerchantDisplayName()}
                                        </span>
                                    </div>
                                ) : null}
                                <div className="mt-2 flex items-center justify-between">
                                    <span className="text-muted-foreground">Service fee</span>
                                    <span className="font-semibold">BBD 0.00</span>
                                </div>
                            </div>

                            <div className="rounded-xl border border-dashed border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                                <p className="mb-2 flex items-center gap-2 font-semibold text-foreground">
                                    <Sparkles className="h-4 w-4 text-primary" />
                                    Customer Experience Boosters
                                </p>
                                <p className="mb-1 flex items-start gap-2">
                                    <Camera className="mt-0.5 h-3.5 w-3.5 text-primary" />
                                    Use QR scan for faster checkout and fewer entry errors.
                                </p>
                                <p className="flex items-start gap-2">
                                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 text-primary" />
                                    Always review merchant details before PIN confirmation.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

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

            <Dialog open={!!receipt} onOpenChange={() => setReceipt(null)}>
                <DialogContent>
                    <DialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                        <DialogTitle className="text-center">Payment Successful</DialogTitle>
                        <DialogDescription className="text-center">
                            Your payment has been processed.
                        </DialogDescription>
                    </DialogHeader>
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
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline" className="w-full">
                                Done
                            </Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageTransition>
    );
}
