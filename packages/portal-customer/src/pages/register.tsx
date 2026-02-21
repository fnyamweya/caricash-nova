import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { CustomerRegisterForm, useApi } from '@caricash/ui';
import type { CustomerRegisterData } from '@caricash/ui';

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

export function RegisterPage() {
    const navigate = useNavigate();
    const api = useApi();
    const [error, setError] = useState<string | null>(null);

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

    return (
        <CustomerRegisterForm
            loading={mutation.isPending}
            error={error}
            onSubmit={async (data) => {
                setError(null);
                await mutation.mutateAsync(data);
            }}
            onLoginClick={() => navigate({ to: '/login' })}
        />
    );
}
