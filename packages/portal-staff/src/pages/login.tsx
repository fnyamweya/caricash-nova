import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { LoginForm, useAuth, useApi } from '@caricash/ui';

interface LoginResponse {
  token: string;
  actor_id: string;
  actor_type: string;
  session_id: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const api = useApi();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: { identifier: string; pin: string }) => {
      return api.post<LoginResponse>('/auth/staff/login', {
        staff_code: data.identifier,
        pin: data.pin,
      });
    },
    onSuccess: (res) => {
      localStorage.setItem('caricash_staff_id', res.actor_id);
      auth.login(res.token, {
        id: res.actor_id,
        type: res.actor_type,
        name: res.actor_id,
      });
      navigate({ to: '/dashboard' });
    },
    onError: (err: Error) => {
      setError(err.message ?? 'Login failed. Please try again.');
    },
  });

  return (
    <LoginForm
      portalType="staff"
      loading={mutation.isPending}
      error={error}
      onSubmit={async (data: { identifier: string; pin: string }) => {
        setError(null);
        await mutation.mutateAsync(data);
      }}
    />
  );
}
