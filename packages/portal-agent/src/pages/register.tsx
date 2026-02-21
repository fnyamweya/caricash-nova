import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle } from 'lucide-react';
import {
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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@caricash/ui';

interface RegisterResponse {
    actor: { id: string; name: string; type: string };
    wallet_id: string;
    correlation_id: string;
}

export function RegisterCustomerPage() {
    const api = useApi();

    const [name, setName] = useState('');
    const [msisdn, setMsisdn] = useState('');
    const [pin, setPin] = useState('');
    const [result, setResult] = useState<RegisterResponse | null>(null);

    const mutation = useMutation({
        mutationFn: async () => {
            return api.post<RegisterResponse>('/customers', {
                msisdn,
                name,
                pin,
            });
        },
        onSuccess: (res) => {
            setResult(res);
            setName('');
            setMsisdn('');
            setPin('');
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
                    title="Register Customer"
                    description="Register a new customer for CariCash mobile money"
                />

                <Card className="max-w-lg">
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle className="text-base">Customer Details</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="customer-name">Customer Name</Label>
                                <Input
                                    id="customer-name"
                                    type="text"
                                    placeholder="Full name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="customer-msisdn">Phone Number (MSISDN)</Label>
                                <Input
                                    id="customer-msisdn"
                                    type="tel"
                                    placeholder="e.g. +1246XXXXXXX"
                                    value={msisdn}
                                    onChange={(e) => setMsisdn(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="customer-pin">Initial PIN</Label>
                                <Input
                                    id="customer-pin"
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={6}
                                    placeholder="Set a 4–6 digit PIN"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    required
                                />
                            </div>

                            {mutation.isError && (
                                <p className="text-sm text-destructive">
                                    {mutation.error?.message ?? 'Registration failed. Please try again.'}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={mutation.isPending || !name || !msisdn || !pin}
                            >
                                {mutation.isPending ? 'Registering…' : 'Register Customer'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>

            {/* Success dialog */}
            <Dialog open={!!result} onOpenChange={() => setResult(null)}>
                <DialogContent>
                    <DialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                        <DialogTitle className="text-center">Customer Registered</DialogTitle>
                        <DialogDescription className="text-center">
                            The new customer account has been created successfully.
                        </DialogDescription>
                    </DialogHeader>
                    {result && (
                        <div className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                            <p>
                                <span className="font-medium">Actor ID:</span>{' '}
                                {result.actor.id}
                            </p>
                            <p>
                                <span className="font-medium">Name:</span>{' '}
                                {result.actor.name}
                            </p>
                            <p>
                                <span className="font-medium">Wallet ID:</span>{' '}
                                {result.wallet_id}
                            </p>
                            <p>
                                <span className="font-medium">Correlation ID:</span>{' '}
                                {result.correlation_id}
                            </p>
                        </div>
                    )}
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
