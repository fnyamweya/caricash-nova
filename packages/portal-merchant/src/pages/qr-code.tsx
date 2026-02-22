import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import QRCode from 'qrcode';
import {
    Badge,
    Button,
    Input,
    Label,
    PageTransition,
} from '@caricash/ui';
import {
    Check,
    Copy,
    DollarSign,
    Download,
    Printer,
    QrCode,
    RefreshCw,
    ScanLine,
    Store,
} from 'lucide-react';
import { MerchantHero, MerchantSection, MerchantSegmentedFilters, MerchantStickyActionBar } from '../components/merchant-ui.js';
import { useMerchantWorkspace } from '../lib/merchant-workspace.js';

type QrFormat = 'static' | 'amount';

interface QrPayload {
    store_code: string;
    merchant_name?: string;
    amount?: string;
    currency: string;
}

function buildQrPayload(storeCode: string, merchantName: string, amount?: string): QrPayload {
    const payload: QrPayload = { store_code: storeCode, currency: 'BBD' };
    if (merchantName.trim()) payload.merchant_name = merchantName.trim();
    if (amount && Number(amount) > 0) payload.amount = Number(amount).toFixed(2);
    return payload;
}

export function QrCodePage() {
    const { activeStore, activeStoreCode } = useMerchantWorkspace();
    const storeCode = activeStoreCode || activeStore?.store_code || '';

    const [merchantName, setMerchantName] = useState(activeStore?.name ?? '');
    const [amount, setAmount] = useState('');
    const [format, setFormat] = useState<QrFormat>('static');
    const [copied, setCopied] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (activeStore?.name) {
            setMerchantName((prev) => prev || activeStore.name);
        }
    }, [activeStore?.name]);

    const payload = useMemo(
        () => buildQrPayload(storeCode, merchantName, format === 'amount' ? amount : undefined),
        [storeCode, merchantName, amount, format],
    );
    const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);

    useEffect(() => {
        let cancelled = false;
        async function generate() {
            if (!storeCode) return;
            try {
                const dataUrl = await QRCode.toDataURL(payloadJson, {
                    width: 320,
                    margin: 2,
                    color: { dark: '#111827', light: '#ffffff' },
                    errorCorrectionLevel: 'M',
                });
                if (!cancelled) setQrDataUrl(dataUrl);

                const svg = await QRCode.toString(payloadJson, {
                    type: 'svg',
                    width: 320,
                    margin: 2,
                    color: { dark: '#111827', light: '#ffffff' },
                    errorCorrectionLevel: 'M',
                });
                if (!cancelled) setSvgMarkup(svg);

                if (canvasRef.current && !cancelled) {
                    await QRCode.toCanvas(canvasRef.current, payloadJson, {
                        width: 640,
                        margin: 2,
                        color: { dark: '#111827', light: '#ffffff' },
                        errorCorrectionLevel: 'M',
                    });
                }
            } catch {
                // ignore QR rendering failures
            }
        }
        void generate();
        return () => { cancelled = true; };
    }, [payloadJson, storeCode]);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(payloadJson);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // noop
        }
    }, [payloadJson]);

    const handleDownloadPng = useCallback(() => {
        if (!canvasRef.current || !storeCode) return;
        const link = document.createElement('a');
        link.download = `qr-${storeCode}.png`;
        link.href = canvasRef.current.toDataURL('image/png');
        link.click();
    }, [storeCode]);

    const handleDownloadSvg = useCallback(() => {
        if (!svgMarkup || !storeCode) return;
        const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
        const link = document.createElement('a');
        const objectUrl = URL.createObjectURL(blob);
        link.download = `qr-${storeCode}.svg`;
        link.href = objectUrl;
        link.click();
        URL.revokeObjectURL(objectUrl);
    }, [svgMarkup, storeCode]);

    const handlePrint = useCallback(() => {
        if (!svgMarkup || !storeCode) return;
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(`<!DOCTYPE html><html><head><title>QR Code - ${storeCode}</title><style>body{font-family:system-ui,sans-serif;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f8fafc;color:#0f172a}.wrap{background:white;border:1px solid #e2e8f0;border-radius:20px;padding:24px;box-shadow:0 20px 50px -35px rgba(0,0,0,.25);text-align:center}.wrap .code{font-weight:700}.wrap .sub{color:#64748b;margin:8px 0 16px}.qr svg{width:320px;height:320px}.amt{margin-top:12px;font-weight:600}</style></head><body><div class="wrap"><div class="code">${storeCode}</div><div class="sub">${merchantName.trim() || 'Scan to pay'}</div><div class="qr">${svgMarkup}</div><div class="amt">${format === 'amount' && amount && Number(amount) > 0 ? `BBD ${Number(amount).toFixed(2)}` : 'Customer enters amount after scanning'}</div></div><script>window.onload=()=>{window.print();window.close();}<' + '/script></body></html>`);
        win.document.close();
    }, [svgMarkup, storeCode, merchantName, format, amount]);

    const canRenderQr = !!storeCode;

    return (
        <PageTransition>
            <div className="flex flex-col gap-4 md:gap-5">
                <MerchantHero
                    title="QR Collect Workspace"
                    description="Create a countertop-ready QR experience for each store. Switch stores from the sidebar to generate the right QR instantly."
                    badge={storeCode ? `QR for ${storeCode}` : 'Select active store'}
                    actions={(
                        <Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1">
                            {format === 'amount' ? 'Fixed amount QR' : 'Static QR'}
                        </Badge>
                    )}
                >
                    <div className="grid gap-3 sm:grid-cols-3">
                        <QuickHint icon={<Store className="h-4 w-4" />} label="Store" value={activeStore?.name || 'No active store'} />
                        <QuickHint icon={<ScanLine className="h-4 w-4" />} label="Use Case" value={format === 'amount' ? 'Checkout-specific amount' : 'Countertop general collect'} />
                        <QuickHint icon={<DollarSign className="h-4 w-4" />} label="Amount" value={format === 'amount' && amount ? `BBD ${Number(amount || 0).toFixed(2)}` : 'Customer enters amount'} />
                    </div>
                </MerchantHero>

                <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                    <MerchantSection title="QR Preview" description="Optimized display for screen sharing, print, or countertop use.">
                        <div className="space-y-4">
                            <motion.div layout className="rounded-[28px] border border-border/70 bg-card p-4 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.24)]">
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Collect QR</p>
                                        <p className="text-sm font-semibold">{storeCode || 'No store selected'}</p>
                                    </div>
                                    <Badge className="rounded-full border border-primary/20 bg-primary/10 text-primary hover:bg-primary/10">
                                        {format === 'amount' ? 'Fixed' : 'Open Amount'}
                                    </Badge>
                                </div>

                                <div className="flex min-h-[22rem] items-center justify-center rounded-2xl border border-dashed border-border/60 bg-background/80 p-4">
                                    {canRenderQr && qrDataUrl ? (
                                        <motion.img
                                            key={qrDataUrl}
                                            initial={{ opacity: 0, scale: 0.98 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            src={qrDataUrl}
                                            alt={`QR code for ${storeCode}`}
                                            className="h-64 w-64 rounded-xl bg-white p-2 shadow-sm"
                                            draggable={false}
                                        />
                                    ) : canRenderQr ? (
                                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                                    ) : (
                                        <div className="text-center text-muted-foreground">
                                            <Store className="mx-auto mb-2 h-8 w-8 opacity-50" />
                                            <p className="text-sm">Select an active store from the sidebar to generate the QR.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-3 text-center">
                                    <p className="text-sm font-semibold">{merchantName.trim() || activeStore?.name || 'Merchant Store'}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {format === 'amount' && amount && Number(amount) > 0 ? `BBD ${Number(amount).toFixed(2)}` : 'Customer enters amount after scan'}
                                    </p>
                                </div>
                            </motion.div>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <Button variant="outline" className="rounded-xl" onClick={handleDownloadPng} disabled={!canRenderQr}>
                                    <Download className="h-4 w-4" /> PNG
                                </Button>
                                <Button variant="outline" className="rounded-xl" onClick={handleDownloadSvg} disabled={!canRenderQr}>
                                    <Download className="h-4 w-4" /> SVG
                                </Button>
                                <Button variant="outline" className="rounded-xl" onClick={handlePrint} disabled={!canRenderQr}>
                                    <Printer className="h-4 w-4" /> Print
                                </Button>
                                <Button variant="outline" className="rounded-xl" onClick={handleCopy} disabled={!canRenderQr}>
                                    {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                                    {copied ? 'Copied' : 'Copy'}
                                </Button>
                            </div>

                            <canvas ref={canvasRef} className="hidden" />
                        </div>
                    </MerchantSection>

                    <MerchantSection title="QR Configuration" description="Tune your customer collection experience per store and checkout context.">
                        <div className="space-y-4">
                            <MerchantSegmentedFilters<QrFormat>
                                value={format}
                                onChange={setFormat}
                                options={[
                                    { value: 'static', label: 'Static QR' },
                                    { value: 'amount', label: 'Fixed Amount' },
                                ]}
                            />

                            <div className="grid gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="merchant-display-name">Display Name (optional)</Label>
                                    <Input id="merchant-display-name" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} className="h-11 rounded-xl" placeholder="Corner Grocer - Sunset Mall" />
                                    <p className="text-xs text-muted-foreground">Displayed to customers in QR metadata.</p>
                                </div>

                                {format === 'amount' ? (
                                    <AnimatePresence mode="wait">
                                        <motion.div key="fixed-amount" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="space-y-1.5">
                                            <Label htmlFor="fixed-amount">Fixed Amount (BBD)</Label>
                                            <Input id="fixed-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 rounded-xl" placeholder="0.00" />
                                            <p className="text-xs text-muted-foreground">Use this for exact checkout totals or pre-priced services.</p>
                                        </motion.div>
                                    </AnimatePresence>
                                ) : null}

                                <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Payload Preview</p>
                                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-background/70 p-3 text-xs text-muted-foreground">
                                        {JSON.stringify(payload, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </MerchantSection>
                </div>

                <MerchantStickyActionBar
                    title={storeCode ? `QR ready for ${storeCode}` : 'Select a store to generate QR'}
                    subtitle={format === 'amount' && amount ? `Fixed amount: BBD ${Number(amount || 0).toFixed(2)}` : 'Static collect QR recommended for countertop usage.'}
                    secondary={<Button variant="outline" className="w-full rounded-xl sm:w-auto" onClick={() => { setFormat('static'); setAmount(''); }}>Reset to Static</Button>}
                    primary={<Button className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto" onClick={handlePrint} disabled={!canRenderQr}><Printer className="h-4 w-4" />Print Counter QR</Button>}
                />
            </div>
        </PageTransition>
    );
}

function QuickHint({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted">{icon}</div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-semibold">{value}</p>
        </div>
    );
}
