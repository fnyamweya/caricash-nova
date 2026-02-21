import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Phone, Store, UserCog, Shield } from 'lucide-react';

import { cn } from '../../lib/utils.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { Button } from '../ui/button.js';
import { LoadingSpinner } from './loading-spinner.js';

type PortalType = 'customer' | 'agent' | 'merchant' | 'staff';

const portalConfig: Record<
  PortalType,
  { label: string; placeholder: string; icon: React.ReactNode; title: string }
> = {
  customer: {
    label: 'Phone Number',
    placeholder: 'Enter your phone number',
    icon: <Phone className="h-4 w-4" />,
    title: 'Customer Portal',
  },
  agent: {
    label: 'Agent Code',
    placeholder: 'Enter your agent code',
    icon: <UserCog className="h-4 w-4" />,
    title: 'Agent Portal',
  },
  merchant: {
    label: 'Store Code',
    placeholder: 'Enter your store code',
    icon: <Store className="h-4 w-4" />,
    title: 'Merchant Portal',
  },
  staff: {
    label: 'Staff Code',
    placeholder: 'Enter your staff code',
    icon: <Shield className="h-4 w-4" />,
    title: 'Staff Portal',
  },
};

export interface LoginFormProps {
  portalType: PortalType;
  onSubmit: (data: { identifier: string; pin: string }) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export function LoginForm({
  portalType,
  onSubmit,
  loading = false,
  error = null,
}: LoginFormProps) {
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const config = portalConfig[portalType];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit({ identifier, pin });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 text-3xl font-extrabold tracking-tight text-primary">
              CariCash
            </div>
            <CardTitle className="text-xl">{config.title}</CardTitle>
            <CardDescription>Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="identifier">{config.label}</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {config.icon}
                  </span>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={config.placeholder}
                    className="pl-9"
                    required
                    disabled={loading}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="pin">PIN</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Lock className="h-4 w-4" />
                  </span>
                  <Input
                    id="pin"
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter your PIN"
                    className="pl-9"
                    required
                    disabled={loading}
                    autoComplete="current-password"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" />
                    Signing in…
                  </span>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
