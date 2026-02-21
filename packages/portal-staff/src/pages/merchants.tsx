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
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    EmptyState,
} from '@caricash/ui';
import { ModulePage } from '../components/module-page.js';

interface CreateMerchantResponse {
    actor: { id: string; name: string; type: string };
    wallet_id: string;
    owner_user_id: string;
    correlation_id: string;
}

interface CreateStoreResponse {
    merchant_id: string;
    store: { id: string; name: string; store_code: string };
    store_code: string;
    wallet_id: string;
    owner_user_id: string;
    correlation_id: string;
}

export function MerchantsPage() {
    const api = useApi();

    const [name, setName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [msisdn, setMsisdn] = useState('');
    const [pin, setPin] = useState('');
    const [result, setResult] = useState<CreateMerchantResponse | null>(null);

    const [merchantId, setMerchantId] = useState('');
    const [storeName, setStoreName] = useState('');
    const [storeOwnerName, setStoreOwnerName] = useState('');
    const [storeMsisdn, setStoreMsisdn] = useState('');
    const [storePin, setStorePin] = useState('');
    const [storeCode, setStoreCode] = useState('');
    const [availableStoreCodes, setAvailableStoreCodes] = useState<string[]>([]);
    const [storeCodesError, setStoreCodesError] = useState<string | null>(null);
    const [storeResult, setStoreResult] = useState<CreateStoreResponse | null>(null);
    const [loadingStoreCodes, setLoadingStoreCodes] = useState(false);

    const mutation = useMutation({
        mutationFn: async () => {
            return api.post<CreateMerchantResponse>('/merchants', {
                name,
                owner_name: ownerName,
                msisdn,
                pin,
            });
        },
        onSuccess: (res) => {
            setResult(res);
            setName('');
            setOwnerName('');
            setMsisdn('');
            setPin('');
            setMerchantId(res.actor.id);
        },
    });

    const createStoreMutation = useMutation({
        mutationFn: async () => {
            return api.post<CreateStoreResponse>(`/merchants/${encodeURIComponent(merchantId)}/stores`, {
                store_code: storeCode,
                name: storeName,
                owner_name: storeOwnerName,
                msisdn: storeMsisdn,
                pin: storePin,
            });
        },
        onSuccess: (res) => {
            setStoreResult(res);
            setStoreName('');
            setStoreOwnerName('');
            setStoreMsisdn('');
            setStorePin('');
            setStoreCode('');
            setAvailableStoreCodes([]);
        },
    });

    async function loadStoreCodes() {
        if (!merchantId.trim()) {
            setStoreCodesError('Enter Merchant Actor ID first');
            return;
        }

        setLoadingStoreCodes(true);
        setStoreCodesError(null);
        try {
            const response = await api.post<{ codes: string[] }>('/codes/generate', {
                code_type: 'STORE',
                merchant_id: merchantId.trim(),
                count: 5,
            });
            const codes = response.codes ?? [];
            setAvailableStoreCodes(codes);
            setStoreCode(codes[0] ?? '');
        } catch (err) {
            setStoreCodesError(err instanceof Error ? err.message : 'Failed to generate store codes');
        } finally {
            setLoadingStoreCodes(false);
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        mutation.mutate();
    }

    function handleCreateStore(e: React.FormEvent) {
        e.preventDefault();
        createStoreMutation.mutate();
    }

    return (
        <PageTransition>
            <ModulePage
                module="Core"
                title="Merchant Management"
                description="Provision merchants and stores with clear ownership and code assignment"
                playbook={[
                    'Create merchant actor and confirm owner details.',
                    'Generate store codes only after merchant ID validation.',
                    'Persist wallet and correlation identifiers for audit trace.',
                ]}
            >
                <Card className="max-w-2xl">
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle className="text-base">Create Merchant</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="merch-name">Merchant Name</Label>
                                <Input
                                    id="merch-name"
                                    type="text"
                                    placeholder="Business name"
                                    value={name}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="owner-name">Owner Name</Label>
                                <Input
                                    id="owner-name"
                                    type="text"
                                    placeholder="Owner full name"
                                    value={ownerName}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOwnerName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="merch-msisdn">Phone Number (MSISDN)</Label>
                                <Input
                                    id="merch-msisdn"
                                    type="tel"
                                    placeholder="e.g. +1246XXXXXXX"
                                    value={msisdn}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMsisdn(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="merch-pin">Initial PIN</Label>
                                <Input
                                    id="merch-pin"
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
                                    {mutation.error?.message ?? 'Failed to create merchant.'}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={mutation.isPending || !name || !ownerName || !msisdn || !pin}
                            >
                                {mutation.isPending ? 'Creating…' : 'Create Merchant'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                <Card className="max-w-2xl">
                    <form onSubmit={handleCreateStore}>
                        <CardHeader>
                            <CardTitle className="text-base">Create Store</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="merchant-id">Merchant Actor ID</Label>
                                <Input
                                    id="merchant-id"
                                    type="text"
                                    placeholder="Merchant actor ID"
                                    value={merchantId}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMerchantId(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="store-code-select">Store Code</Label>
                                <div className="flex gap-2">
                                    <Select value={storeCode} onValueChange={setStoreCode}>
                                        <SelectTrigger id="store-code-select" className="flex-1">
                                            <SelectValue placeholder="Generate and select code" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableStoreCodes.map((code) => (
                                                <SelectItem key={code} value={code}>{code}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => void loadStoreCodes()}
                                        disabled={loadingStoreCodes || createStoreMutation.isPending || !merchantId}
                                    >
                                        {loadingStoreCodes ? 'Generating…' : 'Get 5 Codes'}
                                    </Button>
                                </div>
                                {storeCodesError ? <p className="text-xs text-destructive">{storeCodesError}</p> : null}
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="store-name">Store Name</Label>
                                <Input
                                    id="store-name"
                                    type="text"
                                    placeholder="Branch/store name"
                                    value={storeName}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStoreName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="store-owner-name">Store Owner Name</Label>
                                <Input
                                    id="store-owner-name"
                                    type="text"
                                    placeholder="Owner full name"
                                    value={storeOwnerName}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStoreOwnerName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="store-msisdn">Store Phone (MSISDN)</Label>
                                <Input
                                    id="store-msisdn"
                                    type="tel"
                                    placeholder="e.g. +1246XXXXXXX"
                                    value={storeMsisdn}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStoreMsisdn(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="store-pin">Store PIN</Label>
                                <Input
                                    id="store-pin"
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={6}
                                    placeholder="Set a 4–6 digit PIN"
                                    value={storePin}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStorePin(e.target.value)}
                                    required
                                />
                            </div>

                            {createStoreMutation.isError && (
                                <p className="text-sm text-destructive">
                                    {createStoreMutation.error?.message ?? 'Failed to create store.'}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={createStoreMutation.isPending || loadingStoreCodes || !merchantId || !storeCode || !storeName || !storeOwnerName || !storeMsisdn || !storePin}
                            >
                                {createStoreMutation.isPending ? 'Creating…' : 'Create Store'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                {/* Merchant list placeholder */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Merchant List</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <EmptyState title="No merchant list API available yet" />
                    </CardContent>
                </Card>
            </ModulePage>

            {/* Success dialog */}
            <Dialog
                open={!!result || !!storeResult}
                onOpenChange={() => {
                    setResult(null);
                    setStoreResult(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                        <DialogTitle className="text-center">Creation Successful</DialogTitle>
                        <DialogDescription className="text-center">
                            Merchant/store operation completed successfully.
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
                                <span className="font-medium">Owner User ID:</span> {result.owner_user_id}
                            </p>
                            <p>
                                <span className="font-medium">Correlation ID:</span>{' '}
                                {result.correlation_id}
                            </p>
                        </div>
                    )}
                    {storeResult && (
                        <div className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                            <p>
                                <span className="font-medium">Store Actor ID:</span> {storeResult.store.id}
                            </p>
                            <p>
                                <span className="font-medium">Store Code:</span> {storeResult.store_code}
                            </p>
                            <p>
                                <span className="font-medium">Store Wallet ID:</span> {storeResult.wallet_id}
                            </p>
                            <p>
                                <span className="font-medium">Store Correlation ID:</span>{' '}
                                {storeResult.correlation_id}
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
