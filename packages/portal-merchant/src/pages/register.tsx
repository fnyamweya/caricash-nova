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
        store_code: string;
    };
    wallet_id: string;
    owner_user_id: string;
    correlation_id: string;
}

interface LoginResponse {
    token: string;
    actor_id: string;
    actor_type: string;
    merchant_user_id: string;
    merchant_user_role: string;
    merchant_user_name: string;
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
                store_code: data.store_code,
                name: data.name,
                owner_name: data.owner_name,
                msisdn: data.msisdn,
                email: data.email,
                pin: data.pin,
            });

            // 2. Auto-login with the new credentials
            const login = await api.post<LoginResponse>('/auth/merchant/login', {
                store_code: data.store_code,
                msisdn: data.msisdn,
                pin: data.pin,
            });

            return { reg, login, store_code: data.store_code };
        },
        onSuccess: ({ reg, login, store_code }) => {
            // Persist context
            localStorage.setItem('caricash_store_code', store_code);
            localStorage.setItem('caricash_merchant_user_id', login.merchant_user_id);
            localStorage.setItem('caricash_merchant_user_role', login.merchant_user_role);

            auth.login(login.token, {
                id: login.actor_id,
                type: login.actor_type,
                name: login.merchant_user_name || reg.actor.name,
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
