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
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    EmptyState,
} from '@caricash/ui';

interface CreateAgentResponse {
    actor: { id: string; name: string; type: string };
    wallet_id: string;
    cash_float_id: string;
    correlation_id: string;
}

export function AgentsPage() {
    const api = useApi();

    const [availableCodes, setAvailableCodes] = useState<string[]>([]);
    const [agentCode, setAgentCode] = useState('');
    const [codesError, setCodesError] = useState<string | null>(null);
    const [loadingCodes, setLoadingCodes] = useState(false);
    const [name, setName] = useState('');
    const [msisdn, setMsisdn] = useState('');
    const [pin, setPin] = useState('');
    const [agentType, setAgentType] = useState<'STANDARD' | 'AGGREGATOR'>('STANDARD');
    const [result, setResult] = useState<CreateAgentResponse | null>(null);

    async function loadAgentCodes() {
        setLoadingCodes(true);
        setCodesError(null);
        try {
            const response = await api.post<{ codes: string[] }>('/codes/generate', {
                code_type: 'AGENT',
                count: 5,
            });
            const codes = response.codes ?? [];
            setAvailableCodes(codes);
            setAgentCode(codes[0] ?? '');
        } catch (err) {
            setCodesError(err instanceof Error ? err.message : 'Failed to generate codes');
        } finally {
            setLoadingCodes(false);
        }
    }

    const mutation = useMutation({
        mutationFn: async () => {
            return api.post<CreateAgentResponse>('/agents', {
                agent_code: agentCode,
                name,
                msisdn,
                pin,
                agent_type: agentType,
            });
        },
        onSuccess: (res) => {
            setResult(res);
            setAgentCode('');
            setAvailableCodes([]);
            setName('');
            setMsisdn('');
            setPin('');
            setAgentType('STANDARD');
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
                    title="Agent Management"
                    description="Create and manage agent accounts"
                />

                {/* Create Agent form */}
                <Card className="max-w-lg">
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle className="text-base">Create Agent</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="agent-code">Agent Code</Label>
                                <div className="flex gap-2">
                                    <Select value={agentCode} onValueChange={setAgentCode}>
                                        <SelectTrigger id="agent-code" className="flex-1">
                                            <SelectValue placeholder="Generate and select code" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableCodes.map((code) => (
                                                <SelectItem key={code} value={code}>{code}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => void loadAgentCodes()}
                                        disabled={loadingCodes || mutation.isPending}
                                    >
                                        {loadingCodes ? 'Generating…' : 'Get 5 Codes'}
                                    </Button>
                                </div>
                                {codesError ? <p className="text-xs text-destructive">{codesError}</p> : null}
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="agent-name">Agent Name</Label>
                                <Input
                                    id="agent-name"
                                    type="text"
                                    placeholder="Full name"
                                    value={name}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="agent-msisdn">Phone Number (MSISDN)</Label>
                                <Input
                                    id="agent-msisdn"
                                    type="tel"
                                    placeholder="e.g. +1246XXXXXXX"
                                    value={msisdn}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMsisdn(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="agent-pin">Initial PIN</Label>
                                <Input
                                    id="agent-pin"
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={6}
                                    placeholder="Set a 4–6 digit PIN"
                                    value={pin}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPin(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label>Agent Type</Label>
                                <Select
                                    value={agentType}
                                    onValueChange={(v: string) => setAgentType(v as 'STANDARD' | 'AGGREGATOR')}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select agent type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="STANDARD">Standard</SelectItem>
                                        <SelectItem value="AGGREGATOR">Aggregator</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {mutation.isError && (
                                <p className="text-sm text-destructive">
                                    {mutation.error?.message ?? 'Failed to create agent.'}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={mutation.isPending || loadingCodes || !agentCode || !name || !msisdn || !pin}
                            >
                                {mutation.isPending ? 'Creating…' : 'Create Agent'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                {/* Agent list placeholder */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Agent List</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <EmptyState title="No agent list API available yet" />
                    </CardContent>
                </Card>
            </div>

            {/* Success dialog */}
            <Dialog open={!!result} onOpenChange={() => setResult(null)}>
                <DialogContent>
                    <DialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                        <DialogTitle className="text-center">Agent Created</DialogTitle>
                        <DialogDescription className="text-center">
                            The agent account has been created successfully.
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
                                <span className="font-medium">Cash Float ID:</span>{' '}
                                {result.cash_float_id}
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
