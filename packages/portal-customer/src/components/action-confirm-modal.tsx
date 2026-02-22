import { useMemo, useState } from 'react';
import { ShieldCheck, Eye, EyeOff, LockKeyhole, Sparkles } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Button,
    Input,
    Label,
    Badge,
} from '@caricash/ui';

export interface ConfirmSummaryItem {
    label: string;
    value: string;
}

export interface ActionConfirmModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    summary: ConfirmSummaryItem[];
    pin: string;
    onPinChange: (pin: string) => void;
    onConfirm: () => void;
    confirmLabel: string;
    loading?: boolean;
    error?: string | null;
}

export function ActionConfirmModal({
    open,
    onOpenChange,
    title,
    description,
    summary,
    pin,
    onPinChange,
    onConfirm,
    confirmLabel,
    loading = false,
    error = null,
}: ActionConfirmModalProps) {
    const [showPin, setShowPin] = useState(false);

    const canConfirm = useMemo(() => pin.trim().length >= 4, [pin]);
    const primaryAmount =
        summary.find((item) => /(amount|recipient gets)/i.test(item.label))?.value ?? null;

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    setShowPin(false);
                }
                onOpenChange(next);
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary">
                        <ShieldCheck className="h-6 w-6" />
                    </div>
                    <DialogTitle className="text-center">{title}</DialogTitle>
                    <DialogDescription className="text-center">
                        {description}
                    </DialogDescription>
                </DialogHeader>

                {primaryAmount ? (
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                        <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                Ready to Confirm
                            </p>
                            <Badge variant="outline">Secure Checkout</Badge>
                        </div>
                        <p className="text-2xl font-semibold tracking-tight">{primaryAmount}</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                            Review details below, then enter your PIN to continue.
                        </p>
                    </div>
                ) : null}

                <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            Transaction Preview
                        </p>
                        <Badge variant="outline" className="inline-flex items-center gap-1">
                            <LockKeyhole className="h-3 w-3" />
                            PIN Protected
                        </Badge>
                    </div>
                    <dl className="space-y-1.5">
                        {summary.map((item) => (
                            <div
                                key={`${item.label}-${item.value}`}
                                className="flex items-start justify-between gap-4 rounded-lg px-2 py-1 text-sm"
                            >
                                <dt className="text-muted-foreground">{item.label}</dt>
                                <dd className="text-right font-semibold">
                                    {item.value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>

                <div className="rounded-xl border border-dashed border-border/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                            <Label htmlFor="confirm-pin">Confirm PIN</Label>
                            <p className="text-muted-foreground mt-1 text-xs">
                                Your PIN authorizes this transaction securely.
                            </p>
                        </div>
                        <Badge variant="outline" className="inline-flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-primary" />
                            Secure Step
                        </Badge>
                    </div>
                    <div className="relative">
                        <Input
                            id="confirm-pin"
                            type={showPin ? 'text' : 'password'}
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="Enter your PIN to authorize"
                            value={pin}
                            onChange={(e) => onPinChange(e.target.value)}
                            className="pr-12"
                        />
                        <button
                            type="button"
                            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setShowPin((prev) => !prev)}
                            aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                        >
                            {showPin ? (
                                <EyeOff className="h-4 w-4" />
                            ) : (
                                <Eye className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                    {!canConfirm ? (
                        <p className="text-muted-foreground mt-2 text-xs">
                            Enter at least 4 digits to continue.
                        </p>
                    ) : null}
                </div>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading || !canConfirm}
                    >
                        {loading ? 'Processing...' : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
