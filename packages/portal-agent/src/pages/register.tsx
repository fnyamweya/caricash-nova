import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle } from 'lucide-react';
import {
    useApi,
    useAuth,
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
} from '@caricash/ui';

interface RegisterResponse {
    actor: { id: string; name: string; type: string };
    wallet_id: string;
    registration_id?: string;
    registration_type?: string;
    correlation_id: string;
}

type PreferredName = 'FIRST_NAME' | 'MIDDLE_NAME' | 'LAST_NAME' | 'FULL_NAME' | 'CUSTOM';

export function RegisterCustomerPage() {
    const api = useApi();
    const { actor } = useAuth();

    const [firstName, setFirstName] = useState('');
    const [middleName, setMiddleName] = useState('');
    const [lastName, setLastName] = useState('');
    const [preferredName, setPreferredName] = useState<PreferredName>('FIRST_NAME');
    const [customDisplayName, setCustomDisplayName] = useState('');
    const [msisdn, setMsisdn] = useState('');
    const [email, setEmail] = useState('');
    const [pin, setPin] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(true);
    const [privacyAccepted, setPrivacyAccepted] = useState(true);
    const [marketingOptIn, setMarketingOptIn] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [result, setResult] = useState<RegisterResponse | null>(null);

    function resolveDisplayName(): string | undefined {
        const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
        if (preferredName === 'CUSTOM') {
            return customDisplayName || undefined;
        }
        if (preferredName === 'MIDDLE_NAME') {
            return middleName || undefined;
        }
        if (preferredName === 'LAST_NAME') {
            return lastName || undefined;
        }
        if (preferredName === 'FULL_NAME') {
            return fullName || undefined;
        }
        return firstName || undefined;
    }

    const mutation = useMutation({
        mutationFn: async () => {
            const name = [firstName, middleName, lastName].filter(Boolean).join(' ');

            return api.post<RegisterResponse>('/customers', {
                name,
                first_name: firstName,
                middle_name: middleName || undefined,
                last_name: lastName,
                preferred_name: preferredName,
                display_name: resolveDisplayName(),
                msisdn,
                email: email || undefined,
                pin,
                registration_type: 'AGENT_REGISTRATION',
                channel: 'PORTAL',
                registered_by_actor_id: actor?.id,
                terms_accepted: termsAccepted,
                privacy_accepted: privacyAccepted,
                marketing_opt_in: marketingOptIn,
            });
        },
        onSuccess: (res) => {
            setResult(res);
            setFirstName('');
            setMiddleName('');
            setLastName('');
            setPreferredName('FIRST_NAME');
            setCustomDisplayName('');
            setMsisdn('');
            setEmail('');
            setPin('');
            setTermsAccepted(true);
            setPrivacyAccepted(true);
            setMarketingOptIn(false);
            setFormError(null);
        },
    });

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);

        if (!firstName || !lastName || !msisdn || !pin) {
            setFormError('First name, last name, phone number, and PIN are required.');
            return;
        }
        if (pin.length < 4) {
            setFormError('PIN must be at least 4 digits.');
            return;
        }
        if (preferredName === 'CUSTOM' && !customDisplayName) {
            setFormError('Custom display name is required when preferred name is custom.');
            return;
        }
        if (!termsAccepted || !privacyAccepted) {
            setFormError('Terms and privacy acceptance are required.');
            return;
        }

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
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="customer-first-name">First Name</Label>
                                    <Input
                                        id="customer-first-name"
                                        type="text"
                                        placeholder="First name"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="customer-last-name">Last Name</Label>
                                    <Input
                                        id="customer-last-name"
                                        type="text"
                                        placeholder="Last name"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="customer-middle-name">Middle Name (optional)</Label>
                                <Input
                                    id="customer-middle-name"
                                    type="text"
                                    placeholder="Middle name"
                                    value={middleName}
                                    onChange={(e) => setMiddleName(e.target.value)}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="preferred-name">Preferred Display Name</Label>
                                <Select value={preferredName} onValueChange={(value) => setPreferredName(value as PreferredName)}>
                                    <SelectTrigger id="preferred-name">
                                        <SelectValue placeholder="Select preferred name" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="FIRST_NAME">First Name</SelectItem>
                                        <SelectItem value="MIDDLE_NAME">Middle Name</SelectItem>
                                        <SelectItem value="LAST_NAME">Last Name</SelectItem>
                                        <SelectItem value="FULL_NAME">Full Name</SelectItem>
                                        <SelectItem value="CUSTOM">Custom</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {preferredName === 'CUSTOM' && (
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="customer-display-name">Custom Display Name</Label>
                                    <Input
                                        id="customer-display-name"
                                        type="text"
                                        placeholder="Preferred name shown in the app"
                                        value={customDisplayName}
                                        onChange={(e) => setCustomDisplayName(e.target.value)}
                                        required
                                    />
                                </div>
                            )}

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
                                <Label htmlFor="customer-email">Email (optional)</Label>
                                <Input
                                    id="customer-email"
                                    type="email"
                                    placeholder="customer@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
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

                            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                                <label className="flex items-start gap-2">
                                    <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={termsAccepted}
                                        onChange={(e) => setTermsAccepted(e.target.checked)}
                                    />
                                    <span>I confirm the customer accepted the Terms of Service.</span>
                                </label>
                                <label className="flex items-start gap-2">
                                    <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={privacyAccepted}
                                        onChange={(e) => setPrivacyAccepted(e.target.checked)}
                                    />
                                    <span>I confirm the customer accepted the Privacy Policy.</span>
                                </label>
                                <label className="flex items-start gap-2">
                                    <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={marketingOptIn}
                                        onChange={(e) => setMarketingOptIn(e.target.checked)}
                                    />
                                    <span>Customer opts in to marketing updates.</span>
                                </label>
                            </div>

                            {formError && <p className="text-sm text-destructive">{formError}</p>}

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
                                disabled={
                                    mutation.isPending
                                    || !firstName
                                    || !lastName
                                    || !msisdn
                                    || !pin
                                    || !termsAccepted
                                    || !privacyAccepted
                                }
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
                            {result.registration_type && (
                                <p>
                                    <span className="font-medium">Registration Type:</span>{' '}
                                    {result.registration_type}
                                </p>
                            )}
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
