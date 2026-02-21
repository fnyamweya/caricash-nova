import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { LoginForm, useAuth, useApi } from '@caricash/ui';

interface LoginResponse {
    token: string;
    actor_id: string;
    actor_type: string;
    merchant_user_id: string;
    merchant_user_role: string;
    merchant_user_name: string;
    session_id: string;
}

export function LoginPage() {
    const navigate = useNavigate();
    const auth = useAuth();
    const api = useApi();
    const [error, setError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: async (data: { identifier: string; pin: string; msisdn?: string }) => {
            // Store the store_code used for login so we can use it for B2B transfers
            localStorage.setItem('caricash_store_code', data.identifier);
            return api.post<LoginResponse>('/auth/merchant/login', {
                store_code: data.identifier,
                msisdn: data.msisdn,
                pin: data.pin,
            });
        },
        onSuccess: (res, variables) => {
            // Persist merchant user context for downstream pages
            localStorage.setItem('caricash_merchant_user_id', res.merchant_user_id);
            localStorage.setItem('caricash_merchant_user_role', res.merchant_user_role);
            auth.login(res.token, {
                id: res.actor_id,
                type: res.actor_type,
                name: res.merchant_user_name || variables.identifier,
            });
            navigate({ to: '/dashboard' });
        },
        onError: (err: Error) => {
            setError(err.message ?? 'Login failed. Please try again.');
        },
    });

    return (
        <LoginForm
            portalType="merchant"
            loading={mutation.isPending}
            error={error}
            onSubmit={async (data) => {
                setError(null);
                await mutation.mutateAsync(data);
            }}
            onRegisterClick={() => navigate({ to: '/register' })}
        />
    );
}
