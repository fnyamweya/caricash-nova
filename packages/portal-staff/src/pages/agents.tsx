import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
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
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from '@caricash/ui';

type AgentType = 'STANDARD' | 'AGGREGATOR';
type CurrencyCode = 'BBD' | 'USD';

interface CreateAgentResponse {
    actor: { id: string; name: string; type: string };
    agent_code?: string;
    owner_user_id?: string;
    owner_user_role?: string;
    parent_aggregator_id?: string;
    wallet_id: string;
    cash_float_id: string;
    correlation_id: string;
}

interface FloatOperationResponse {
    operation_id: string;
    journal_id: string;
    agent_id: string;
    agent_code: string;
    amount: string;
    currency: CurrencyCode;
    balance_before: string;
    balance_after: string;
    available_before: string;
    available_after: string;
    correlation_id: string;
}

interface FloatBalanceResponse {
    agent_id: string;
    agent_code: string;
    currency: CurrencyCode;
    account_id: string;
    actual_balance: string;
    available_balance: string;
    hold_amount: string;
    pending_credits: string;
    correlation_id: string;
}

interface FloatHistoryOperation {
    id: string;
    operation_type: string;
    amount: string;
    currency: string;
    created_at: string;
    balance_after: string;
}

interface FloatHistoryResponse {
    agent_id: string;
    agent_code: string;
    operations: FloatHistoryOperation[];
    count: number;
    correlation_id: string;
}

interface KycInitiateResponse {
    actor_id: string;
    kyc_state: string;
    correlation_id: string;
}

interface KycProfile {
    actor_id: string;
    status: string;
    submitted_at?: string;
    documents_json?: string;
    metadata_json?: string;
    updated_at?: string;
}

interface KycRequirement {
    code?: string;
    display_name?: string;
    required?: boolean;
}

interface AgentKycStatusResponse {
    profile: KycProfile | null;
    requirements: KycRequirement[];
    correlation_id: string;
}

interface ApprovalActionResponse {
    request_id: string;
    state: string;
    correlation_id?: string;
    [key: string]: unknown;
}

interface OverdraftRequestResponse {
    facility_id: string;
    request_id: string;
    state: string;
    correlation_id: string;
}

interface OverdraftActionResponse {
    request_id: string;
    state: string;
    correlation_id?: string;
}

function createIdempotencyKey(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStaffId(): string {
    const staffId = localStorage.getItem('caricash_staff_id');
    if (!staffId) {
        throw new Error('Staff ID is missing. Please log in again.');
    }
    return staffId;
}

function AgentCreatePanel() {
    const api = useApi();

    const [availableCodes, setAvailableCodes] = useState<string[]>([]);
    const [agentCode, setAgentCode] = useState('');
    const [codesError, setCodesError] = useState<string | null>(null);
    const [loadingCodes, setLoadingCodes] = useState(false);
    const [name, setName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [msisdn, setMsisdn] = useState('');
    const [pin, setPin] = useState('');
    const [agentType, setAgentType] = useState<AgentType>('STANDARD');
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
        mutationFn: async () =>
            api.post<CreateAgentResponse>('/agents', {
                agent_code: agentCode,
                name,
                owner_name: ownerName || name,
                msisdn,
                pin,
                agent_type: agentType,
            }),
        onSuccess: (res) => {
            setResult(res);
            setAgentCode('');
            setAvailableCodes([]);
            setName('');
            setOwnerName('');
            setMsisdn('');
            setPin('');
            setAgentType('STANDARD');
        },
    });

    return (
        <div className="flex flex-col gap-4">
            <Card className="max-w-2xl">
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        mutation.mutate();
                    }}
                >
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
                                            <SelectItem key={code} value={code}>
                                                {code}
                                            </SelectItem>
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
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="agent-owner-name">Agent Owner Name</Label>
                            <Input
                                id="agent-owner-name"
                                type="text"
                                placeholder="Owner full name"
                                value={ownerName}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setOwnerName(e.target.value)}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="agent-msisdn">Phone Number (MSISDN)</Label>
                            <Input
                                id="agent-msisdn"
                                type="tel"
                                placeholder="e.g. +1246XXXXXXX"
                                value={msisdn}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setMsisdn(e.target.value)}
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
                                placeholder="Set a 4-6 digit PIN"
                                value={pin}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setPin(e.target.value)}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label>Agent Type</Label>
                            <Select
                                value={agentType}
                                onValueChange={(v: string) => setAgentType(v as AgentType)}
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

            {result && (
                <Card className="max-w-2xl border-green-500/30">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Agent Created
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                        <p>
                            <span className="font-medium">Actor ID:</span> {result.actor.id}
                        </p>
                        <p>
                            <span className="font-medium">Name:</span> {result.actor.name}
                        </p>
                        <p>
                            <span className="font-medium">Agent Code:</span> {result.agent_code ?? agentCode}
                        </p>
                        <p>
                            <span className="font-medium">Owner User ID:</span> {result.owner_user_id ?? '—'}
                        </p>
                        <p>
                            <span className="font-medium">Owner Role:</span> {result.owner_user_role ?? 'agent_owner'}
                        </p>
                        <p>
                            <span className="font-medium">Wallet ID:</span> {result.wallet_id}
                        </p>
                        <p>
                            <span className="font-medium">Cash Float ID:</span> {result.cash_float_id}
                        </p>
                        <p>
                            <span className="font-medium">Correlation ID:</span> {result.correlation_id}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function ChildAgentPanel() {
    const api = useApi();

    const [parentAggregatorId, setParentAggregatorId] = useState('');
    const [availableCodes, setAvailableCodes] = useState<string[]>([]);
    const [agentCode, setAgentCode] = useState('');
    const [codesError, setCodesError] = useState<string | null>(null);
    const [loadingCodes, setLoadingCodes] = useState(false);
    const [name, setName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [msisdn, setMsisdn] = useState('');
    const [pin, setPin] = useState('');
    const [result, setResult] = useState<(CreateAgentResponse & { parent_aggregator_id: string }) | null>(null);

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
            if (!parentAggregatorId.trim()) {
                throw new Error('Parent aggregator ID is required');
            }
            return api.post<CreateAgentResponse>('/agents', {
                agent_code: agentCode,
                name,
                owner_name: ownerName || name,
                msisdn,
                pin,
                agent_type: 'STANDARD',
                parent_aggregator_id: parentAggregatorId,
            });
        },
        onSuccess: (res) => {
            setResult({ ...res, parent_aggregator_id: res.parent_aggregator_id ?? parentAggregatorId });
            setAgentCode('');
            setAvailableCodes([]);
            setName('');
            setOwnerName('');
            setMsisdn('');
            setPin('');
        },
    });

    return (
        <div className="flex flex-col gap-4">
            <Card className="max-w-2xl">
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        mutation.mutate();
                    }}
                >
                    <CardHeader>
                        <CardTitle className="text-base">Create Child Agent (Aggregator Flow)</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="parent-aggregator-id">Parent Aggregator Actor ID</Label>
                            <Input
                                id="parent-aggregator-id"
                                type="text"
                                placeholder="Aggregator actor ID"
                                value={parentAggregatorId}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setParentAggregatorId(e.target.value)}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="child-agent-code">Child Agent Code</Label>
                            <div className="flex gap-2">
                                <Select value={agentCode} onValueChange={setAgentCode}>
                                    <SelectTrigger id="child-agent-code" className="flex-1">
                                        <SelectValue placeholder="Generate and select code" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableCodes.map((code) => (
                                            <SelectItem key={code} value={code}>
                                                {code}
                                            </SelectItem>
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
                            <Label htmlFor="child-name">Child Agent Name</Label>
                            <Input
                                id="child-name"
                                type="text"
                                placeholder="Full name"
                                value={name}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="child-owner-name">Child Agent Owner Name</Label>
                            <Input
                                id="child-owner-name"
                                type="text"
                                placeholder="Owner full name"
                                value={ownerName}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setOwnerName(e.target.value)}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="child-msisdn">Phone Number (MSISDN)</Label>
                            <Input
                                id="child-msisdn"
                                type="tel"
                                placeholder="e.g. +1246XXXXXXX"
                                value={msisdn}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setMsisdn(e.target.value)}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="child-pin">Initial PIN</Label>
                            <Input
                                id="child-pin"
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="Set a 4-6 digit PIN"
                                value={pin}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setPin(e.target.value)}
                                required
                            />
                        </div>

                        {mutation.isError && (
                            <p className="text-sm text-destructive">
                                {mutation.error?.message ?? 'Failed to create child agent.'}
                            </p>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={mutation.isPending || loadingCodes || !parentAggregatorId || !agentCode || !name || !msisdn || !pin}
                        >
                            {mutation.isPending ? 'Creating…' : 'Create Child Agent'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            {result && (
                <Card className="max-w-2xl border-green-500/30">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Child Agent Created
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                        <p>
                            <span className="font-medium">Parent Aggregator ID:</span> {result.parent_aggregator_id}
                        </p>
                        <p>
                            <span className="font-medium">Actor ID:</span> {result.actor.id}
                        </p>
                        <p>
                            <span className="font-medium">Agent Code:</span> {result.agent_code ?? agentCode}
                        </p>
                        <p>
                            <span className="font-medium">Owner User ID:</span> {result.owner_user_id ?? '—'}
                        </p>
                        <p>
                            <span className="font-medium">Owner Role:</span> {result.owner_user_role ?? 'agent_owner'}
                        </p>
                        <p>
                            <span className="font-medium">Wallet ID:</span> {result.wallet_id}
                        </p>
                        <p>
                            <span className="font-medium">Cash Float ID:</span> {result.cash_float_id}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function FloatActionsPanel() {
    const api = useApi();

    const [topUpAgentCode, setTopUpAgentCode] = useState('');
    const [topUpAmount, setTopUpAmount] = useState('');
    const [topUpCurrency, setTopUpCurrency] = useState<CurrencyCode>('BBD');
    const [topUpReason, setTopUpReason] = useState('');
    const [topUpReference, setTopUpReference] = useState('');
    const [topUpIdempotency, setTopUpIdempotency] = useState(() => createIdempotencyKey('float-topup'));
    const [topUpResult, setTopUpResult] = useState<FloatOperationResponse | null>(null);

    const [withdrawalAgentCode, setWithdrawalAgentCode] = useState('');
    const [withdrawalAmount, setWithdrawalAmount] = useState('');
    const [withdrawalCurrency, setWithdrawalCurrency] = useState<CurrencyCode>('BBD');
    const [withdrawalReason, setWithdrawalReason] = useState('');
    const [withdrawalReference, setWithdrawalReference] = useState('');
    const [withdrawalIdempotency, setWithdrawalIdempotency] = useState(() => createIdempotencyKey('float-withdrawal'));
    const [withdrawalResult, setWithdrawalResult] = useState<FloatOperationResponse | null>(null);

    const [queryAgentCode, setQueryAgentCode] = useState('');
    const [queryCurrency, setQueryCurrency] = useState<CurrencyCode>('BBD');
    const [queryLimit, setQueryLimit] = useState('20');
    const [balanceResult, setBalanceResult] = useState<FloatBalanceResponse | null>(null);
    const [historyResult, setHistoryResult] = useState<FloatHistoryResponse | null>(null);

    const topUpMutation = useMutation({
        mutationFn: async () =>
            api.post<FloatOperationResponse>('/float/top-up', {
                agent_code: topUpAgentCode,
                amount: topUpAmount,
                currency: topUpCurrency,
                staff_id: getStaffId(),
                reason: topUpReason || undefined,
                reference: topUpReference || undefined,
                idempotency_key: topUpIdempotency,
            }),
        onSuccess: (res) => {
            setTopUpResult(res);
            setTopUpAmount('');
            setTopUpReason('');
            setTopUpReference('');
            setTopUpIdempotency(createIdempotencyKey('float-topup'));
        },
    });

    const withdrawalMutation = useMutation({
        mutationFn: async () =>
            api.post<FloatOperationResponse>('/float/withdrawal', {
                agent_code: withdrawalAgentCode,
                amount: withdrawalAmount,
                currency: withdrawalCurrency,
                staff_id: getStaffId(),
                reason: withdrawalReason || undefined,
                reference: withdrawalReference || undefined,
                idempotency_key: withdrawalIdempotency,
            }),
        onSuccess: (res) => {
            setWithdrawalResult(res);
            setWithdrawalAmount('');
            setWithdrawalReason('');
            setWithdrawalReference('');
            setWithdrawalIdempotency(createIdempotencyKey('float-withdrawal'));
        },
    });

    const balanceMutation = useMutation({
        mutationFn: async () =>
            api.get<FloatBalanceResponse>(
                `/float/${encodeURIComponent(queryAgentCode)}/balance?currency=${queryCurrency}`,
            ),
        onSuccess: (res) => {
            setBalanceResult(res);
        },
    });

    const historyMutation = useMutation({
        mutationFn: async () =>
            api.get<FloatHistoryResponse>(
                `/float/${encodeURIComponent(queryAgentCode)}/history?limit=${encodeURIComponent(queryLimit)}`,
            ),
        onSuccess: (res) => {
            setHistoryResult(res);
        },
    });

    return (
        <div className="flex flex-col gap-4">
            <Tabs defaultValue="topup">
                <TabsList>
                    <TabsTrigger value="topup">Top Up Float</TabsTrigger>
                    <TabsTrigger value="withdrawal">Float Withdrawal</TabsTrigger>
                </TabsList>

                <TabsContent value="topup">
                    <Card className="max-w-2xl">
                        <form
                            onSubmit={(e: FormEvent) => {
                                e.preventDefault();
                                topUpMutation.mutate();
                            }}
                        >
                            <CardHeader>
                                <CardTitle className="text-base">Top Up Agent Float</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="topup-agent-code">Agent Code</Label>
                                    <Input
                                        id="topup-agent-code"
                                        type="text"
                                        placeholder="e.g. 284761"
                                        value={topUpAgentCode}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setTopUpAgentCode(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="topup-amount">Amount</Label>
                                    <Input
                                        id="topup-amount"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="e.g. 500.00"
                                        value={topUpAmount}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setTopUpAmount(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label>Currency</Label>
                                    <Select
                                        value={topUpCurrency}
                                        onValueChange={(v: string) => setTopUpCurrency(v as CurrencyCode)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BBD">BBD</SelectItem>
                                            <SelectItem value="USD">USD</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="topup-reason">Reason (optional)</Label>
                                    <Input
                                        id="topup-reason"
                                        type="text"
                                        value={topUpReason}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setTopUpReason(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="topup-reference">Reference (optional)</Label>
                                    <Input
                                        id="topup-reference"
                                        type="text"
                                        value={topUpReference}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setTopUpReference(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="topup-idempotency">Idempotency Key</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="topup-idempotency"
                                            type="text"
                                            className="flex-1"
                                            value={topUpIdempotency}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setTopUpIdempotency(e.target.value)}
                                            required
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setTopUpIdempotency(createIdempotencyKey('float-topup'))}
                                        >
                                            Regenerate
                                        </Button>
                                    </div>
                                </div>
                                {topUpMutation.isError && (
                                    <p className="text-sm text-destructive">
                                        {topUpMutation.error?.message ?? 'Float top-up failed.'}
                                    </p>
                                )}
                            </CardContent>
                            <CardFooter>
                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={topUpMutation.isPending || !topUpAgentCode || !topUpAmount || !topUpIdempotency}
                                >
                                    {topUpMutation.isPending ? 'Processing…' : 'Submit Top Up'}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </TabsContent>

                <TabsContent value="withdrawal">
                    <Card className="max-w-2xl">
                        <form
                            onSubmit={(e: FormEvent) => {
                                e.preventDefault();
                                withdrawalMutation.mutate();
                            }}
                        >
                            <CardHeader>
                                <CardTitle className="text-base">Withdraw Agent Float</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="withdrawal-agent-code">Agent Code</Label>
                                    <Input
                                        id="withdrawal-agent-code"
                                        type="text"
                                        placeholder="e.g. 284761"
                                        value={withdrawalAgentCode}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setWithdrawalAgentCode(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="withdrawal-amount">Amount</Label>
                                    <Input
                                        id="withdrawal-amount"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="e.g. 300.00"
                                        value={withdrawalAmount}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setWithdrawalAmount(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label>Currency</Label>
                                    <Select
                                        value={withdrawalCurrency}
                                        onValueChange={(v: string) => setWithdrawalCurrency(v as CurrencyCode)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BBD">BBD</SelectItem>
                                            <SelectItem value="USD">USD</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="withdrawal-reason">Reason (optional)</Label>
                                    <Input
                                        id="withdrawal-reason"
                                        type="text"
                                        value={withdrawalReason}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setWithdrawalReason(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="withdrawal-reference">Reference (optional)</Label>
                                    <Input
                                        id="withdrawal-reference"
                                        type="text"
                                        value={withdrawalReference}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setWithdrawalReference(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="withdrawal-idempotency">Idempotency Key</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="withdrawal-idempotency"
                                            type="text"
                                            className="flex-1"
                                            value={withdrawalIdempotency}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setWithdrawalIdempotency(e.target.value)}
                                            required
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setWithdrawalIdempotency(createIdempotencyKey('float-withdrawal'))}
                                        >
                                            Regenerate
                                        </Button>
                                    </div>
                                </div>
                                {withdrawalMutation.isError && (
                                    <p className="text-sm text-destructive">
                                        {withdrawalMutation.error?.message ?? 'Float withdrawal failed.'}
                                    </p>
                                )}
                            </CardContent>
                            <CardFooter>
                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={withdrawalMutation.isPending || !withdrawalAgentCode || !withdrawalAmount || !withdrawalIdempotency}
                                >
                                    {withdrawalMutation.isPending ? 'Processing…' : 'Submit Withdrawal'}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </TabsContent>
            </Tabs>

            {(topUpResult || withdrawalResult) && (
                <Card className="max-w-2xl border-green-500/30">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Float Operation Completed
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                        {topUpResult ? (
                            <p>
                                <span className="font-medium">Top Up:</span> {topUpResult.amount} {topUpResult.currency} for {topUpResult.agent_code} (journal {topUpResult.journal_id})
                            </p>
                        ) : null}
                        {withdrawalResult ? (
                            <p>
                                <span className="font-medium">Withdrawal:</span> {withdrawalResult.amount} {withdrawalResult.currency} for {withdrawalResult.agent_code} (journal {withdrawalResult.journal_id})
                            </p>
                        ) : null}
                    </CardContent>
                </Card>
            )}

            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle className="text-base">Float Balance and History</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="float-query-agent-code">Agent Code</Label>
                        <Input
                            id="float-query-agent-code"
                            type="text"
                            placeholder="e.g. 284761"
                            value={queryAgentCode}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setQueryAgentCode(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label>Currency</Label>
                        <Select value={queryCurrency} onValueChange={(v: string) => setQueryCurrency(v as CurrencyCode)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="BBD">BBD</SelectItem>
                                <SelectItem value="USD">USD</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="float-history-limit">History Limit</Label>
                        <Input
                            id="float-history-limit"
                            type="number"
                            min="1"
                            max="100"
                            value={queryLimit}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setQueryLimit(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button
                            className="flex-1"
                            onClick={() => balanceMutation.mutate()}
                            disabled={balanceMutation.isPending || !queryAgentCode}
                        >
                            {balanceMutation.isPending ? 'Loading…' : 'Get Balance'}
                        </Button>
                        <Button
                            className="flex-1"
                            variant="outline"
                            onClick={() => historyMutation.mutate()}
                            disabled={historyMutation.isPending || !queryAgentCode}
                        >
                            {historyMutation.isPending ? 'Loading…' : 'Get History'}
                        </Button>
                    </div>
                    {balanceMutation.isError && (
                        <p className="text-sm text-destructive">
                            {balanceMutation.error?.message ?? 'Failed to fetch balance.'}
                        </p>
                    )}
                    {historyMutation.isError && (
                        <p className="text-sm text-destructive">
                            {historyMutation.error?.message ?? 'Failed to fetch history.'}
                        </p>
                    )}
                </CardContent>
            </Card>

            {balanceResult && (
                <Card className="max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-base">Current Float Balance</CardTitle>
                    </CardHeader>
                    <CardContent className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                        <p>
                            <span className="font-medium">Agent Code:</span> {balanceResult.agent_code}
                        </p>
                        <p>
                            <span className="font-medium">Actual:</span> {balanceResult.actual_balance} {balanceResult.currency}
                        </p>
                        <p>
                            <span className="font-medium">Available:</span> {balanceResult.available_balance} {balanceResult.currency}
                        </p>
                        <p>
                            <span className="font-medium">Hold:</span> {balanceResult.hold_amount}
                        </p>
                    </CardContent>
                </Card>
            )}

            {historyResult && (
                <Card className="max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-base">Recent Float Operations ({historyResult.count})</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {historyResult.operations.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No float operations found.</p>
                        ) : (
                            historyResult.operations.map((operation) => (
                                <div key={operation.id} className="rounded-md border p-3 text-sm">
                                    <p>
                                        <span className="font-medium">{operation.operation_type}</span> {operation.amount} {operation.currency}
                                    </p>
                                    <p className="text-muted-foreground">
                                        {operation.created_at}
                                    </p>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function KycActionsPanel() {
    const api = useApi();

    const [initAgentId, setInitAgentId] = useState('');
    const [documentType, setDocumentType] = useState('NATIONAL_ID');
    const [documentNumber, setDocumentNumber] = useState('');
    const [initResult, setInitResult] = useState<KycInitiateResponse | null>(null);

    const [statusAgentId, setStatusAgentId] = useState('');
    const [statusResult, setStatusResult] = useState<AgentKycStatusResponse | null>(null);

    const initiateMutation = useMutation({
        mutationFn: async () =>
            api.post<KycInitiateResponse>(`/agents/${encodeURIComponent(initAgentId)}/kyc/initiate`, {
                document_type: documentType,
                document_number: documentNumber,
            }),
        onSuccess: (res) => {
            setInitResult(res);
            setDocumentNumber('');
        },
    });

    const statusMutation = useMutation({
        mutationFn: async () =>
            api.get<AgentKycStatusResponse>(`/agents/${encodeURIComponent(statusAgentId)}/kyc`),
        onSuccess: (res) => {
            setStatusResult(res);
        },
    });

    return (
        <div className="flex flex-col gap-4">
            <Card className="max-w-2xl">
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        initiateMutation.mutate();
                    }}
                >
                    <CardHeader>
                        <CardTitle className="text-base">Initiate Agent KYC</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="kyc-agent-id">Agent Actor ID</Label>
                            <Input
                                id="kyc-agent-id"
                                type="text"
                                placeholder="Agent actor ID"
                                value={initAgentId}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setInitAgentId(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="kyc-document-type">Document Type</Label>
                            <Input
                                id="kyc-document-type"
                                type="text"
                                value={documentType}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setDocumentType(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="kyc-document-number">Document Number</Label>
                            <Input
                                id="kyc-document-number"
                                type="text"
                                value={documentNumber}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setDocumentNumber(e.target.value)}
                                required
                            />
                        </div>
                        {initiateMutation.isError && (
                            <p className="text-sm text-destructive">
                                {initiateMutation.error?.message ?? 'Failed to initiate KYC.'}
                            </p>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={initiateMutation.isPending || !initAgentId || !documentType || !documentNumber}
                        >
                            {initiateMutation.isPending ? 'Submitting…' : 'Submit KYC'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            {initResult && (
                <Card className="max-w-2xl border-green-500/30">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            KYC Submitted
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                        <p>
                            <span className="font-medium">Agent ID:</span> {initResult.actor_id}
                        </p>
                        <p>
                            <span className="font-medium">KYC State:</span> {initResult.kyc_state}
                        </p>
                        <p>
                            <span className="font-medium">Correlation ID:</span> {initResult.correlation_id}
                        </p>
                    </CardContent>
                </Card>
            )}

            <Card className="max-w-2xl">
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        statusMutation.mutate();
                    }}
                >
                    <CardHeader>
                        <CardTitle className="text-base">Get Agent KYC Status</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="kyc-status-agent-id">Agent Actor ID</Label>
                            <Input
                                id="kyc-status-agent-id"
                                type="text"
                                placeholder="Agent actor ID"
                                value={statusAgentId}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setStatusAgentId(e.target.value)}
                                required
                            />
                        </div>
                        {statusMutation.isError && (
                            <p className="text-sm text-destructive">
                                {statusMutation.error?.message ?? 'Failed to load KYC status.'}
                            </p>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={statusMutation.isPending || !statusAgentId}
                        >
                            {statusMutation.isPending ? 'Loading…' : 'Get KYC Status'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            {statusResult && (
                <Card className="max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-base">KYC Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                        <p>
                            <span className="font-medium">Status:</span>{' '}
                            {statusResult.profile?.status ?? 'NOT_STARTED'}
                        </p>
                        <p>
                            <span className="font-medium">Submitted:</span>{' '}
                            {statusResult.profile?.submitted_at ?? 'N/A'}
                        </p>
                        <p>
                            <span className="font-medium">Requirements:</span> {statusResult.requirements.length}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function ApprovalActionsPanel() {
    const api = useApi();

    const [approveId, setApproveId] = useState('');
    const [approveCorrelation, setApproveCorrelation] = useState('');
    const [approveResult, setApproveResult] = useState<ApprovalActionResponse | null>(null);

    const [rejectId, setRejectId] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [rejectCorrelation, setRejectCorrelation] = useState('');
    const [rejectResult, setRejectResult] = useState<ApprovalActionResponse | null>(null);

    const approveMutation = useMutation({
        mutationFn: async () =>
            api.post<ApprovalActionResponse>(`/approvals/${encodeURIComponent(approveId)}/approve`, {
                staff_id: getStaffId(),
                ...(approveCorrelation ? { correlation_id: approveCorrelation } : {}),
            }),
        onSuccess: (res) => {
            setApproveResult(res);
            setApproveId('');
            setApproveCorrelation('');
        },
    });

    const rejectMutation = useMutation({
        mutationFn: async () =>
            api.post<ApprovalActionResponse>(`/approvals/${encodeURIComponent(rejectId)}/reject`, {
                staff_id: getStaffId(),
                reason: rejectReason,
                ...(rejectCorrelation ? { correlation_id: rejectCorrelation } : {}),
            }),
        onSuccess: (res) => {
            setRejectResult(res);
            setRejectId('');
            setRejectReason('');
            setRejectCorrelation('');
        },
    });

    return (
        <div className="flex flex-col gap-4">
            <Card className="max-w-2xl">
                <CardContent className="flex items-center gap-3 pt-6">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                        Use approval request IDs generated by workflows (reversals, overdraft requests,
                        or other maker-checker operations).
                    </p>
                </CardContent>
            </Card>

            <Tabs defaultValue="approve">
                <TabsList>
                    <TabsTrigger value="approve">Approve Request</TabsTrigger>
                    <TabsTrigger value="reject">Reject Request</TabsTrigger>
                </TabsList>

                <TabsContent value="approve">
                    <Card className="max-w-2xl">
                        <form
                            onSubmit={(e: FormEvent) => {
                                e.preventDefault();
                                approveMutation.mutate();
                            }}
                        >
                            <CardHeader>
                                <CardTitle className="text-base">Approve Agent Request</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="approve-request-id">Approval Request ID</Label>
                                    <Input
                                        id="approve-request-id"
                                        type="text"
                                        placeholder="Request ID"
                                        value={approveId}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setApproveId(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="approve-correlation">Correlation ID (optional)</Label>
                                    <Input
                                        id="approve-correlation"
                                        type="text"
                                        value={approveCorrelation}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setApproveCorrelation(e.target.value)}
                                    />
                                </div>
                                {approveMutation.isError && (
                                    <p className="text-sm text-destructive">
                                        {approveMutation.error?.message ?? 'Approval failed.'}
                                    </p>
                                )}
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" className="w-full" disabled={approveMutation.isPending || !approveId}>
                                    {approveMutation.isPending ? 'Approving…' : 'Approve'}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </TabsContent>

                <TabsContent value="reject">
                    <Card className="max-w-2xl">
                        <form
                            onSubmit={(e: FormEvent) => {
                                e.preventDefault();
                                rejectMutation.mutate();
                            }}
                        >
                            <CardHeader>
                                <CardTitle className="text-base">Reject Agent Request</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="reject-request-id">Approval Request ID</Label>
                                    <Input
                                        id="reject-request-id"
                                        type="text"
                                        placeholder="Request ID"
                                        value={rejectId}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setRejectId(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="reject-reason">Reason</Label>
                                    <Input
                                        id="reject-reason"
                                        type="text"
                                        placeholder="Reason for rejection"
                                        value={rejectReason}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setRejectReason(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="reject-correlation">Correlation ID (optional)</Label>
                                    <Input
                                        id="reject-correlation"
                                        type="text"
                                        value={rejectCorrelation}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setRejectCorrelation(e.target.value)}
                                    />
                                </div>
                                {rejectMutation.isError && (
                                    <p className="text-sm text-destructive">
                                        {rejectMutation.error?.message ?? 'Rejection failed.'}
                                    </p>
                                )}
                            </CardContent>
                            <CardFooter>
                                <Button
                                    type="submit"
                                    variant="destructive"
                                    className="w-full"
                                    disabled={rejectMutation.isPending || !rejectId || !rejectReason}
                                >
                                    {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </TabsContent>
            </Tabs>

            {(approveResult || rejectResult) && (
                <Card className="max-w-2xl border-green-500/30">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            {approveResult ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            Approval Action Completed
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                        {approveResult ? (
                            <p>
                                <span className="font-medium">Approved:</span> {approveResult.request_id} ({approveResult.state})
                            </p>
                        ) : null}
                        {rejectResult ? (
                            <p>
                                <span className="font-medium">Rejected:</span> {rejectResult.request_id} ({rejectResult.state})
                            </p>
                        ) : null}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function OverdraftActionsPanel() {
    const api = useApi();

    const [accountId, setAccountId] = useState('');
    const [limitAmount, setLimitAmount] = useState('');
    const [currency, setCurrency] = useState<CurrencyCode>('BBD');
    const [requestResult, setRequestResult] = useState<OverdraftRequestResponse | null>(null);

    const [requestId, setRequestId] = useState('');
    const [approveCorrelation, setApproveCorrelation] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [rejectCorrelation, setRejectCorrelation] = useState('');
    const [actionResult, setActionResult] = useState<{
        type: 'approve' | 'reject';
        result: OverdraftActionResponse;
    } | null>(null);

    const requestMutation = useMutation({
        mutationFn: async () =>
            api.post<OverdraftRequestResponse>('/ops/overdraft/request', {
                account_id: accountId,
                limit_amount: limitAmount,
                currency,
            }),
        onSuccess: (res) => {
            setRequestResult(res);
            setRequestId(res.request_id);
            setAccountId('');
            setLimitAmount('');
            setCurrency('BBD');
        },
    });

    const approveMutation = useMutation({
        mutationFn: async () =>
            api.post<OverdraftActionResponse>(`/ops/overdraft/${encodeURIComponent(requestId)}/approve`, {
                ...(approveCorrelation ? { correlation_id: approveCorrelation } : {}),
            }),
        onSuccess: (res) => {
            setActionResult({ type: 'approve', result: res });
            setApproveCorrelation('');
        },
    });

    const rejectMutation = useMutation({
        mutationFn: async () =>
            api.post<OverdraftActionResponse>(`/ops/overdraft/${encodeURIComponent(requestId)}/reject`, {
                reason: rejectReason,
                ...(rejectCorrelation ? { correlation_id: rejectCorrelation } : {}),
            }),
        onSuccess: (res) => {
            setActionResult({ type: 'reject', result: res });
            setRejectReason('');
            setRejectCorrelation('');
        },
    });

    return (
        <div className="flex flex-col gap-4">
            <Card className="max-w-2xl">
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        requestMutation.mutate();
                    }}
                >
                    <CardHeader>
                        <CardTitle className="text-base">Request Overdraft Facility</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="od-account-id">Agent Account ID</Label>
                            <Input
                                id="od-account-id"
                                type="text"
                                placeholder="Wallet or cash-float account ID"
                                value={accountId}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setAccountId(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="od-limit-amount">Limit Amount</Label>
                            <Input
                                id="od-limit-amount"
                                type="number"
                                step="0.01"
                                min="0"
                                value={limitAmount}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setLimitAmount(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>Currency</Label>
                            <Select value={currency} onValueChange={(v: string) => setCurrency(v as CurrencyCode)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BBD">BBD</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {requestMutation.isError && (
                            <p className="text-sm text-destructive">
                                {requestMutation.error?.message ?? 'Failed to create overdraft request.'}
                            </p>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" disabled={requestMutation.isPending || !accountId || !limitAmount}>
                            {requestMutation.isPending ? 'Submitting…' : 'Request Overdraft'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            {requestResult && (
                <Card className="max-w-2xl border-green-500/30">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Overdraft Request Created
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                        <p>
                            <span className="font-medium">Facility ID:</span> {requestResult.facility_id}
                        </p>
                        <p>
                            <span className="font-medium">Approval Request ID:</span> {requestResult.request_id}
                        </p>
                        <p>
                            <span className="font-medium">State:</span> {requestResult.state}
                        </p>
                    </CardContent>
                </Card>
            )}

            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle className="text-base">Approve or Reject Overdraft</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="od-request-id">Approval Request ID</Label>
                        <Input
                            id="od-request-id"
                            type="text"
                            placeholder="Use request ID from overdraft creation"
                            value={requestId}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setRequestId(e.target.value)}
                            required
                        />
                    </div>

                    <div className="rounded-md border p-3 flex flex-col gap-3">
                        <p className="text-sm font-medium">Approve</p>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="od-approve-correlation">Correlation ID (optional)</Label>
                            <Input
                                id="od-approve-correlation"
                                type="text"
                                value={approveCorrelation}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setApproveCorrelation(e.target.value)}
                            />
                        </div>
                        <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending || !requestId}>
                            {approveMutation.isPending ? 'Approving…' : 'Approve Overdraft'}
                        </Button>
                        {approveMutation.isError && (
                            <p className="text-sm text-destructive">
                                {approveMutation.error?.message ?? 'Overdraft approval failed.'}
                            </p>
                        )}
                    </div>

                    <div className="rounded-md border p-3 flex flex-col gap-3">
                        <p className="text-sm font-medium">Reject</p>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="od-reject-reason">Reason</Label>
                            <Input
                                id="od-reject-reason"
                                type="text"
                                value={rejectReason}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setRejectReason(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="od-reject-correlation">Correlation ID (optional)</Label>
                            <Input
                                id="od-reject-correlation"
                                type="text"
                                value={rejectCorrelation}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setRejectCorrelation(e.target.value)}
                            />
                        </div>
                        <Button
                            variant="destructive"
                            onClick={() => rejectMutation.mutate()}
                            disabled={rejectMutation.isPending || !requestId || !rejectReason}
                        >
                            {rejectMutation.isPending ? 'Rejecting…' : 'Reject Overdraft'}
                        </Button>
                        {rejectMutation.isError && (
                            <p className="text-sm text-destructive">
                                {rejectMutation.error?.message ?? 'Overdraft rejection failed.'}
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {actionResult && (
                <Card className="max-w-2xl border-green-500/30">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            {actionResult.type === 'approve' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            Overdraft Action Completed
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                        <p>
                            <span className="font-medium">Request ID:</span> {actionResult.result.request_id}
                        </p>
                        <p>
                            <span className="font-medium">State:</span> {actionResult.result.state}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

export function AgentsPage() {
    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Agent Management"
                    description="Create agents and run agent operational actions from a single console"
                />

                <Tabs defaultValue="create">
                    <TabsList className="flex flex-wrap h-auto">
                        <TabsTrigger value="create">Create Agent</TabsTrigger>
                        <TabsTrigger value="float">Float</TabsTrigger>
                        <TabsTrigger value="kyc">KYC</TabsTrigger>
                        <TabsTrigger value="child">Child Agents</TabsTrigger>
                        <TabsTrigger value="approvals">Approvals</TabsTrigger>
                        <TabsTrigger value="overdraft">Overdraft</TabsTrigger>
                    </TabsList>

                    <TabsContent value="create">
                        <AgentCreatePanel />
                    </TabsContent>
                    <TabsContent value="float">
                        <FloatActionsPanel />
                    </TabsContent>
                    <TabsContent value="kyc">
                        <KycActionsPanel />
                    </TabsContent>
                    <TabsContent value="child">
                        <ChildAgentPanel />
                    </TabsContent>
                    <TabsContent value="approvals">
                        <ApprovalActionsPanel />
                    </TabsContent>
                    <TabsContent value="overdraft">
                        <OverdraftActionsPanel />
                    </TabsContent>
                </Tabs>
            </div>
        </PageTransition>
    );
}
