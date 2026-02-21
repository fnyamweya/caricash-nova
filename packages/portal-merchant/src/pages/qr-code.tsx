import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Input,
    Label,
    PageHeader,
    PageTransition,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    useAuth,
} from '@caricash/ui';
import {
    Download,
    Copy,
    Check,
    QrCode,
    Printer,
    RefreshCw,
    Store,
    DollarSign,
} from 'lucide-react';

type QrFormat = 'static' | 'amount';

interface QrPayload {
    store_code: string;
    merchant_name?: string;
    amount?: string;
    currency: string;
}

function buildQrPayload(storeCode: string, merchantName: string, amount?: string): QrPayload {
    const payload: QrPayload = {
        store_code: storeCode,
        currency: 'BBD',
    };
    if (merchantName.trim()) payload.merchant_name = merchantName.trim();
    if (amount && Number(amount) > 0) payload.amount = Number(amount).toFixed(2);
    return payload;
}

export function QrCodePage() {
    const { actor } = useAuth();
    const storeCode = localStorage.getItem('caricash_store_code') ?? actor?.name ?? '';

    const [merchantName, setMerchantName] = useState('');
    const [amount, setAmount] = useState('');
    const [format, setFormat] = useState<QrFormat>('static');
    const [copied, setCopied] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const payload = useMemo(
        () =>
            buildQrPayload(
                storeCode,
                merchantName,
                format === 'amount' ? amount : undefined,
            ),
        [storeCode, merchantName, amount, format],
    );

    const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);

    // Generate QR on payload change
    useEffect(() => {
        let cancelled = false;

        async function generate() {
            try {
                // Generate data URL for display
                const dataUrl = await QRCode.toDataURL(payloadJson, {
                    width: 320,
                    margin: 2,
                    color: { dark: '#0f172a', light: '#ffffff' },
                    errorCorrectionLevel: 'M',
                });
                if (!cancelled) setQrDataUrl(dataUrl);

                // Generate SVG for print/download
                const svg = await QRCode.toString(payloadJson, {
                    type: 'svg',
                    width: 320,
                    margin: 2,
                    color: { dark: '#0f172a', light: '#ffffff' },
                    errorCorrectionLevel: 'M',
                });
                if (!cancelled) setSvgMarkup(svg);

                // Render to hidden canvas for PNG download
                if (canvasRef.current && !cancelled) {
                    await QRCode.toCanvas(canvasRef.current, payloadJson, {
                        width: 640,
                        margin: 2,
                        color: { dark: '#0f172a', light: '#ffffff' },
                        errorCorrectionLevel: 'M',
                    });
                }
            } catch {
                // QR generation failed silently
            }
        }

        void generate();
        return () => { cancelled = true; };
    }, [payloadJson]);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(payloadJson);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard API not available
        }
    }, [payloadJson]);

    const handleDownloadPng = useCallback(() => {
        if (!canvasRef.current) return;
        const link = document.createElement('a');
        link.download = `qr-${storeCode}.png`;
        link.href = canvasRef.current.toDataURL('image/png');
        link.click();
    }, [storeCode]);

    const handleDownloadSvg = useCallback(() => {
        if (!svgMarkup) return;
        const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
        const link = document.createElement('a');
        link.download = `qr-${storeCode}.svg`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    }, [svgMarkup, storeCode]);

    const handlePrint = useCallback(() => {
        if (!svgMarkup) return;
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>QR Code – ${storeCode}</title>
                <style>
                    body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui, sans-serif; margin: 0; }
                    .store { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
                    .label { font-size: 1rem; color: #64748b; margin-bottom: 1.5rem; }
                    .qr svg { width: 320px; height: 320px; }
                    .footer { margin-top: 1.5rem; font-size: 0.875rem; color: #94a3b8; }
                </style>
            </head>
            <body>
                <p class="store">${storeCode}</p>
                ${merchantName.trim() ? `<p class="label">${merchantName.trim()}</p>` : '<p class="label">Scan to pay</p>'}
                <div class="qr">${svgMarkup}</div>
                ${format === 'amount' && amount && Number(amount) > 0 ? `<p class="footer">Amount: BBD ${Number(amount).toFixed(2)}</p>` : '<p class="footer">Customer enters amount after scanning</p>'}
                <script>window.onload=()=>{window.print();window.close();}<\/script>
            </body>
            </html>
        `);
        win.document.close();
    }, [svgMarkup, storeCode, merchantName, amount, format]);

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="My QR Code"
                    description="Display or print your QR code so customers can scan and pay."
                    badge="Receive Payments"
                />

                <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                    {/* QR Display */}
                    <Card>
                        <CardHeader className="text-center">
                            <CardTitle className="flex items-center justify-center gap-2 text-base">
                                <QrCode className="h-4 w-4 text-primary" />
                                {storeCode}
                            </CardTitle>
                            <CardDescription>
                                {merchantName.trim() || 'Your store QR code'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center gap-4">
                            {qrDataUrl ? (
                                <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
                                    <img
                                        src={qrDataUrl}
                                        alt={`QR code for ${storeCode}`}
                                        className="h-64 w-64"
                                        draggable={false}
                                    />
                                </div>
                            ) : (
                                <div className="flex h-64 w-64 items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20">
                                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            )}

                            {format === 'amount' && amount && Number(amount) > 0 ? (
                                <p className="text-lg font-bold tracking-tight">
                                    BBD {Number(amount).toFixed(2)}
                                </p>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Customer enters amount after scanning
                                </p>
                            )}

                            <canvas ref={canvasRef} className="hidden" />
                        </CardContent>
                        <CardFooter className="flex flex-wrap justify-center gap-2">
                            <Button variant="outline" size="sm" onClick={handleDownloadPng}>
                                <Download className="mr-1.5 h-3.5 w-3.5" />
                                PNG
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleDownloadSvg}>
                                <Download className="mr-1.5 h-3.5 w-3.5" />
                                SVG
                            </Button>
                            <Button variant="outline" size="sm" onClick={handlePrint}>
                                <Printer className="mr-1.5 h-3.5 w-3.5" />
                                Print
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleCopy}>
                                {copied ? (
                                    <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" />
                                ) : (
                                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                {copied ? 'Copied' : 'Copy'}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* Configuration */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Store className="h-4 w-4 text-primary" />
                                QR Configuration
                            </CardTitle>
                            <CardDescription>
                                Customize what's encoded in your QR code.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-5">
                            <div className="flex flex-col gap-1.5">
                                <Label>Store Code</Label>
                                <Input value={storeCode} disabled />
                                <p className="text-xs text-muted-foreground">
                                    Your store code is automatically set from your login.
                                </p>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="merchant-display-name">
                                    Display Name (optional)
                                </Label>
                                <Input
                                    id="merchant-display-name"
                                    placeholder="e.g. Corner Grocer"
                                    value={merchantName}
                                    onChange={(e) => setMerchantName(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Shown to customers when they scan your QR code.
                                </p>
                            </div>

                            <Tabs
                                value={format}
                                onValueChange={(v) => setFormat(v as QrFormat)}
                            >
                                <TabsList className="w-full">
                                    <TabsTrigger value="static" className="flex-1">
                                        <QrCode className="mr-1.5 h-3.5 w-3.5" />
                                        Static QR
                                    </TabsTrigger>
                                    <TabsTrigger value="amount" className="flex-1">
                                        <DollarSign className="mr-1.5 h-3.5 w-3.5" />
                                        Fixed Amount
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="static">
                                    <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3">
                                        <p className="text-sm text-muted-foreground">
                                            Customers scan and type the amount themselves.
                                            Ideal for general-purpose countertop display.
                                        </p>
                                    </div>
                                </TabsContent>

                                <TabsContent value="amount" className="space-y-3">
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="fixed-amount">Amount (BBD)</Label>
                                        <Input
                                            id="fixed-amount"
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Pre-fills the customer's payment amount on scan.
                                        </p>
                                    </div>
                                </TabsContent>
                            </Tabs>

                            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    QR Payload Preview
                                </p>
                                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-background p-2 text-xs font-mono text-muted-foreground">
                                    {JSON.stringify(payload, null, 2)}
                                </pre>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </PageTransition>
    );
}
