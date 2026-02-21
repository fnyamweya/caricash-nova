import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle } from 'lucide-react';
import {
    useApi,
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
    EmptyState,
} from '@caricash/ui';
import { ModulePage } from '../components/module-page.js';

interface CreateCustomerResponse {
    actor: { id: string; name: string; type: string };
    wallet_id: string;
    correlation_id: string;
}

export function CustomersPage() {
    const api = useApi();

    const [name, setName] = useState('');
    const [msisdn, setMsisdn] = useState('');
    const [pin, setPin] = useState('');
    const [result, setResult] = useState<CreateCustomerResponse | null>(null);

    const mutation = useMutation({
        mutationFn: async () => {
            return api.post<CreateCustomerResponse>('/customers', {
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
            <ModulePage
                module="Core"
                title="Customer Management"
                description="Create and maintain customer accounts with clear onboarding controls"
                playbook={[
                    'Create customer profile using verified identity details.',
                    'Capture actor and wallet identifiers for support handoff.',
                    'Track failures with correlation IDs for API troubleshooting.',
                ]}
            >
                <Card className="max-w-2xl">
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle className="text-base">Create Customer</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="cust-name">Customer Name</Label>
                                <Input
                                    id="cust-name"
                                    type="text"
                                    placeholder="Full name"
                                    value={name}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="cust-msisdn">Phone Number (MSISDN)</Label>
                                <Input
                                    id="cust-msisdn"
                                    type="tel"
                                    placeholder="e.g. +1246XXXXXXX"
                                    value={msisdn}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMsisdn(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="cust-pin">Initial PIN</Label>
                                <Input
                                    id="cust-pin"
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={6}
                                    placeholder="Set a 4–6 digit PIN"
                                    value={pin}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPin(e.target.value)}
                                    required
                                />
                            </div>

                            {mutation.isError && (
                                <p className="text-sm text-destructive">
                                    {mutation.error?.message ?? 'Failed to create customer.'}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={mutation.isPending || !name || !msisdn || !pin}
                            >
                                {mutation.isPending ? 'Creating…' : 'Create Customer'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Customer List</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <EmptyState title="No customer list API available yet" />
                    </CardContent>
                </Card>
            </ModulePage>

            <Dialog open={!!result} onOpenChange={() => setResult(null)}>
                <DialogContent>
                    <DialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                        <DialogTitle className="text-center">Customer Created</DialogTitle>
                        <DialogDescription className="text-center">
                            The customer account has been created successfully.
                        </DialogDescription>
                    </DialogHeader>
                    {result && (
                        <div className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                            <p>
                                <span className="font-medium">Actor ID:</span> {result.actor.id}
                            </p>
                            <p>
                                <span className="font-medium">Name:</span> {result.actor.name}
                            </p>
                            <p>
                                <span className="font-medium">Wallet ID:</span> {result.wallet_id}
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
