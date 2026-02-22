import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle, ShieldCheck, FileText, Sparkles, Clock3 } from 'lucide-react';
import {
    useAuth,
    useApi,
    PageHeader,
    PageTransition,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardFooter,
    Input,
    Label,
    Button,
    Badge,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@caricash/ui';

const DOCUMENT_TYPES = [
    { value: 'NATIONAL_ID', label: 'National ID' },
    { value: 'PASSPORT', label: 'Passport' },
    { value: 'DRIVERS_LICENSE', label: "Driver's License" },
] as const;

export function KycPage() {
    const { actor } = useAuth();
    const api = useApi();

    const [documentType, setDocumentType] = useState('');
    const [documentNumber, setDocumentNumber] = useState('');
    const [success, setSuccess] = useState(false);

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
        },
    });

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        mutation.mutate();
    }

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="KYC Verification"
                    description="Verify your identity to support safer transfers and smoother payments."
                    badge="Verification"
                />

                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div className="space-y-4">
                        <Card>
                            <CardHeader className="px-6 py-5">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <ShieldCheck className="h-4 w-4 text-primary" />
                                    Verification Status
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 px-6 pb-5">
                                <div className="rounded-2xl border border-dashed bg-muted/25 p-4">
                                    <div className="mb-2 flex items-center justify-between">
                                        <p className="text-sm font-semibold">KYC Submission</p>
                                        <Badge variant="outline">Pending</Badge>
                                    </div>
                                    <p className="text-muted-foreground text-sm">
                                        Submit one valid identity document to begin verification review.
                                    </p>
                                </div>

                                <div className="space-y-2 text-sm">
                                    <div className="flex items-start gap-2">
                                        <FileText className="mt-0.5 h-4 w-4 text-primary" />
                                        <span>Use a valid document number exactly as shown on the document.</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Clock3 className="mt-0.5 h-4 w-4 text-primary" />
                                        <span>We’ll review your submission and notify you when it’s complete.</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
                                        <span>Verified profiles help reduce payment friction and support limits.</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="px-6 py-5">
                                <CardTitle className="text-base">Accepted Documents</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 px-6 pb-5 text-sm">
                                {DOCUMENT_TYPES.map((dt) => (
                                    <div
                                        key={dt.value}
                                        className="flex items-center justify-between rounded-xl border bg-background px-3 py-2.5"
                                    >
                                        <span>{dt.label}</span>
                                        <Badge variant="outline">Accepted</Badge>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="h-fit">
                        <form onSubmit={handleSubmit}>
                            <CardHeader className="px-6 py-5">
                                <CardTitle className="text-base">Submit Document Details</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4 px-6 pb-5">
                                <div className="rounded-2xl border bg-primary/5 px-4 py-3 text-sm">
                                    <p className="font-semibold">Secure verification form</p>
                                    <p className="text-muted-foreground mt-1">
                                        Your document details are used only for identity verification.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="doc-type">Document Type</Label>
                                    <Select value={documentType} onValueChange={setDocumentType}>
                                        <SelectTrigger id="doc-type">
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

                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="doc-number">Document Number</Label>
                                    <Input
                                        id="doc-number"
                                        type="text"
                                        placeholder="Enter document number"
                                        value={documentNumber}
                                        onChange={(e) => setDocumentNumber(e.target.value)}
                                        required
                                    />
                                </div>

                                {mutation.isError && (
                                    <p className="text-sm text-destructive">
                                        {mutation.error?.message ?? 'Submission failed. Please try again.'}
                                    </p>
                                )}
                            </CardContent>
                            <CardFooter className="flex-col gap-2 px-6 pb-5">
                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={mutation.isPending || !documentType || !documentNumber}
                                >
                                    {mutation.isPending ? 'Submitting…' : 'Submit KYC'}
                                </Button>
                                <p className="text-muted-foreground text-center text-xs">
                                    Review usually starts after successful submission.
                                </p>
                            </CardFooter>
                        </form>
                    </Card>
                </div>
            </div>

            {/* Success dialog */}
            <Dialog open={success} onOpenChange={() => setSuccess(false)}>
                <DialogContent>
                    <DialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                        <DialogTitle className="text-center">KYC Submitted</DialogTitle>
                        <DialogDescription className="text-center">
                            Your identity documents have been submitted for review. You will be
                            notified once verification is complete.
                        </DialogDescription>
                    </DialogHeader>
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
