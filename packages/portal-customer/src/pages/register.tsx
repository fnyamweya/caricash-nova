import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Mail, Phone, User, UserCircle } from 'lucide-react';
import {
    Badge,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    useApi,
} from '@caricash/ui';
import type { CustomerRegisterData, PreferredNameOption } from '@caricash/ui';
import {
    CustomerAuthError,
    CustomerAuthField,
    CustomerAuthLinkPrompt,
    CustomerAuthSection,
    CustomerAuthShell,
    CustomerAuthSubmitButton,
    CustomerConsentRow,
    CustomerPinField,
    CustomerTextField,
} from '../components/customer-auth-ui.js';

interface RegisterResponse {
    actor: {
        id: string;
        type: string;
        name: string;
        msisdn: string;
    };
    wallet_id: string;
    correlation_id: string;
}

function resolveDisplayPreview(
    preferred: PreferredNameOption | '',
    first: string,
    middle: string,
    last: string,
    custom: string,
): string {
    switch (preferred) {
        case 'FIRST_NAME':
            return first || 'Customer';
        case 'MIDDLE_NAME':
            return middle || first || 'Customer';
        case 'LAST_NAME':
            return last || first || 'Customer';
        case 'FULL_NAME':
            return [first, middle, last].filter(Boolean).join(' ') || 'Customer';
        case 'CUSTOM':
            return custom || 'Customer';
        default:
            return first || 'Customer';
    }
}

export function RegisterPage() {
    const navigate = useNavigate();
    const api = useApi();
    const [error, setError] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [showPin, setShowPin] = useState(false);

    const [firstName, setFirstName] = useState('');
    const [middleName, setMiddleName] = useState('');
    const [lastName, setLastName] = useState('');
    const [preferredName, setPreferredName] = useState<PreferredNameOption | ''>('');
    const [customDisplayName, setCustomDisplayName] = useState('');
    const [msisdn, setMsisdn] = useState('');
    const [email, setEmail] = useState('');
    const [pin, setPin] = useState('');
    const [pinConfirm, setPinConfirm] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [marketingOptIn, setMarketingOptIn] = useState(false);

    const mutation = useMutation({
        mutationFn: async (data: CustomerRegisterData) => {
            const name = [data.first_name, data.middle_name, data.last_name]
                .filter(Boolean)
                .join(' ');

            return api.post<RegisterResponse>('/customers', {
                name,
                first_name: data.first_name,
                middle_name: data.middle_name,
                last_name: data.last_name,
                preferred_name: data.preferred_name,
                display_name: data.display_name,
                msisdn: data.msisdn,
                email: data.email,
                pin: data.pin,
                registration_type: 'SELF_REGISTRATION',
                channel: 'WEB',
                terms_accepted: data.terms_accepted,
                privacy_accepted: data.privacy_accepted,
                marketing_opt_in: data.marketing_opt_in,
            });
        },
        onSuccess: () => {
            // After registration, redirect to login so the user can authenticate
            navigate({ to: '/login' });
        },
        onError: (err: Error) => {
            setError(err.message ?? 'Registration failed. Please try again.');
        },
    });

    const displayPreview = useMemo(
        () =>
            resolveDisplayPreview(
                preferredName,
                firstName.trim(),
                middleName.trim(),
                lastName.trim(),
                customDisplayName.trim(),
            ),
        [customDisplayName, firstName, lastName, middleName, preferredName],
    );

    const displayError = error || validationError;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setValidationError(null);

        if (pin.length < 4) {
            setValidationError('PIN must be at least 4 digits.');
            return;
        }
        if (pin !== pinConfirm) {
            setValidationError('PINs do not match.');
            return;
        }
        if (preferredName === 'CUSTOM' && !customDisplayName.trim()) {
            setValidationError('Enter a custom display name or choose another display option.');
            return;
        }
        if (!termsAccepted) {
            setValidationError('You must accept the Terms of Service.');
            return;
        }
        if (!privacyAccepted) {
            setValidationError('You must accept the Privacy Policy.');
            return;
        }

        const fullName = [firstName, middleName, lastName]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(' ');
        const resolvedDisplayName =
            preferredName === 'CUSTOM'
                ? customDisplayName.trim()
                : preferredName === 'FULL_NAME'
                    ? fullName
                    : preferredName === 'MIDDLE_NAME'
                        ? middleName.trim()
                        : preferredName === 'LAST_NAME'
                            ? lastName.trim()
                            : firstName.trim();

        await mutation.mutateAsync({
            first_name: firstName.trim(),
            middle_name: middleName.trim() || undefined,
            last_name: lastName.trim(),
            preferred_name: preferredName || undefined,
            display_name: resolvedDisplayName || undefined,
            msisdn: msisdn.trim(),
            email: email.trim() || undefined,
            pin,
            terms_accepted: termsAccepted,
            privacy_accepted: privacyAccepted,
            marketing_opt_in: marketingOptIn,
        });
    }

    return (
        <CustomerAuthShell
            mode="register"
            formBadge="Create Customer Wallet"
            formTitle="Create your account"
            formDescription="Enter your details, set a secure PIN, and get ready to send money or pay merchants."
            footer={(
                <div className="w-full space-y-3">
                    <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-xs text-muted-foreground">
                        Registration takes a few minutes. You can complete identity verification later in Settings.
                    </div>
                    <CustomerAuthLinkPrompt
                        prompt="Already have a wallet?"
                        actionLabel="Sign in"
                        onAction={() => navigate({ to: '/login' })}
                    />
                </div>
            )}
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <CustomerAuthError error={displayError} />

                <CustomerAuthSection
                    title="Personal details"
                    description="Use your legal name so verification and payments match your account profile."
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <CustomerTextField
                            id="first-name"
                            label="First Name"
                            value={firstName}
                            onChange={setFirstName}
                            placeholder="Alicia"
                            icon={<User className="h-4 w-4" />}
                            required
                            disabled={mutation.isPending}
                            autoComplete="given-name"
                        />
                        <CustomerTextField
                            id="last-name"
                            label="Last Name"
                            value={lastName}
                            onChange={setLastName}
                            placeholder="Browne"
                            icon={<User className="h-4 w-4" />}
                            required
                            disabled={mutation.isPending}
                            autoComplete="family-name"
                        />
                    </div>

                    <CustomerTextField
                        id="middle-name"
                        label="Middle Name (optional)"
                        value={middleName}
                        onChange={setMiddleName}
                        placeholder="Marie"
                        icon={<User className="h-4 w-4" />}
                        disabled={mutation.isPending}
                        autoComplete="additional-name"
                    />

                    <CustomerAuthField
                        label="Preferred Display Name (optional)"
                        htmlFor="preferred-name"
                        hint={(
                            <span className="inline-flex items-center gap-1">
                                <UserCircle className="h-3.5 w-3.5" />
                                You'll appear as <span className="font-medium text-foreground">{displayPreview}</span>
                            </span>
                        )}
                    >
                        <Select
                            value={preferredName}
                            onValueChange={(value) => setPreferredName(value as PreferredNameOption)}
                            disabled={mutation.isPending}
                        >
                            <SelectTrigger id="preferred-name">
                                <SelectValue placeholder="Choose how your name appears" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="FIRST_NAME">First Name</SelectItem>
                                {middleName.trim() ? (
                                    <SelectItem value="MIDDLE_NAME">Middle Name</SelectItem>
                                ) : null}
                                <SelectItem value="LAST_NAME">Last Name</SelectItem>
                                <SelectItem value="FULL_NAME">Full Name</SelectItem>
                                <SelectItem value="CUSTOM">Custom</SelectItem>
                            </SelectContent>
                        </Select>
                    </CustomerAuthField>

                    {preferredName === 'CUSTOM' ? (
                        <CustomerTextField
                            id="custom-display-name"
                            label="Custom Display Name"
                            value={customDisplayName}
                            onChange={setCustomDisplayName}
                            placeholder="Ali"
                            icon={<UserCircle className="h-4 w-4" />}
                            required
                            disabled={mutation.isPending}
                        />
                    ) : null}
                </CustomerAuthSection>

                <CustomerAuthSection
                    title="Contact details"
                    description="Your phone number is used for wallet sign-in and transfers."
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <CustomerTextField
                            id="msisdn"
                            label="Phone Number"
                            value={msisdn}
                            onChange={setMsisdn}
                            placeholder="+12465551234"
                            icon={<Phone className="h-4 w-4" />}
                            required
                            disabled={mutation.isPending}
                            autoComplete="tel"
                            inputMode="tel"
                        />
                        <CustomerTextField
                            id="email"
                            label="Email (optional)"
                            value={email}
                            onChange={setEmail}
                            placeholder="you@example.com"
                            icon={<Mail className="h-4 w-4" />}
                            type="email"
                            disabled={mutation.isPending}
                            autoComplete="email"
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                    Profile preview
                                </p>
                                <Badge variant="outline">Wallet</Badge>
                            </div>
                            <p className="truncate text-sm font-semibold">{displayPreview}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                                {msisdn.trim() || 'Phone number not entered yet'}
                            </p>
                        </div>
                        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
                            You can complete identity verification later from the new Settings screen before higher-risk payments or limit changes.
                        </div>
                    </div>
                </CustomerAuthSection>

                <CustomerAuthSection
                    title="Secure your wallet"
                    description="Choose a PIN you can remember but others cannot guess."
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <CustomerPinField
                            id="register-pin"
                            label="PIN"
                            value={pin}
                            onChange={setPin}
                            placeholder="4-6 digits"
                            show={showPin}
                            onToggleShow={() => setShowPin((prev) => !prev)}
                            disabled={mutation.isPending}
                            maxLength={6}
                            autoComplete="new-password"
                            hint="Minimum 4 digits"
                        />
                        <CustomerPinField
                            id="register-pin-confirm"
                            label="Confirm PIN"
                            value={pinConfirm}
                            onChange={setPinConfirm}
                            placeholder="Re-enter PIN"
                            show={showPin}
                            onToggleShow={() => setShowPin((prev) => !prev)}
                            disabled={mutation.isPending}
                            maxLength={6}
                            autoComplete="new-password"
                        />
                    </div>
                </CustomerAuthSection>

                <CustomerAuthSection
                    title="Consents"
                    description="Required agreements must be accepted before your wallet can be created."
                >
                    <div className="space-y-2">
                        <CustomerConsentRow
                            checked={termsAccepted}
                            onCheckedChange={setTermsAccepted}
                            required
                            label={(
                                <>
                                    I accept the <span className="font-medium text-foreground">Terms of Service</span>.
                                </>
                            )}
                        />
                        <CustomerConsentRow
                            checked={privacyAccepted}
                            onCheckedChange={setPrivacyAccepted}
                            required
                            label={(
                                <>
                                    I accept the <span className="font-medium text-foreground">Privacy Policy</span>.
                                </>
                            )}
                        />
                        <CustomerConsentRow
                            checked={marketingOptIn}
                            onCheckedChange={setMarketingOptIn}
                            label="Send me occasional updates and offers (optional)."
                        />
                    </div>
                </CustomerAuthSection>

                <CustomerAuthSubmitButton
                    loading={mutation.isPending}
                    idleLabel="Create Wallet"
                    loadingLabel="Creating wallet..."
                />
            </form>
        </CustomerAuthShell>
    );
}
