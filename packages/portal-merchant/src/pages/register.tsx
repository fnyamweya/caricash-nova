import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { MerchantRegisterForm, useAuth, useApi } from '@caricash/ui';
import type { MerchantRegisterData } from '@caricash/ui';

interface RegisterResponse {
    actor: {
        id: string;
        type: string;
        name: string;
    };
    wallet_id: string;
    owner_user_id: string;
    correlation_id: string;
}

interface LoginResponse {
    token: string;
    actor_id: string;
    actor_type: string;
    session_id: string;
}

export function RegisterPage() {
    const navigate = useNavigate();
    const auth = useAuth();
    const api = useApi();
    const [error, setError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: async (data: MerchantRegisterData) => {
            // 1. Register the merchant (creates actor + store_owner user)
            const reg = await api.post<RegisterResponse>('/merchants', {
                name: data.name,
                owner_name: data.owner_name,
                owner_first_name: data.owner_first_name,
                owner_last_name: data.owner_last_name,
                business_registration_no: data.business_registration_no,
                tax_id: data.tax_id,
                msisdn: data.msisdn,
                email: data.email,
                pin: data.pin,
            });

            // 2. Auto-login with the new credentials
            const login = await api.post<LoginResponse>('/auth/merchant/login', {
                msisdn: data.msisdn,
                pin: data.pin,
            });

            return { reg, login };
        },
        onSuccess: ({ reg, login }) => {

            auth.login(login.token, {
                id: login.actor_id,
                type: login.actor_type,
                name: reg.actor.name,
            });
            navigate({ to: '/dashboard' });
        },
        onError: (err: Error) => {
            setError(err.message ?? 'Registration failed. Please try again.');
        },
    });

    return (
        <MerchantRegisterForm
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
