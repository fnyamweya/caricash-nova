import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  EmptyState,
} from '@caricash/ui';

interface CreateMerchantResponse {
  actor: { id: string; name: string; type: string };
  wallet_id: string;
  correlation_id: string;
}

export function MerchantsPage() {
  const api = useApi();

  const [storeCode, setStoreCode] = useState('');
  const [name, setName] = useState('');
  const [msisdn, setMsisdn] = useState('');
  const [pin, setPin] = useState('');
  const [result, setResult] = useState<CreateMerchantResponse | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      return api.post<CreateMerchantResponse>('/merchants', {
        store_code: storeCode,
        name,
        msisdn,
        pin,
      });
    },
    onSuccess: (res) => {
      setResult(res);
      setStoreCode('');
      setName('');
      setMsisdn('');
      setPin('');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <PageTransition>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Merchant Management"
          description="Create and manage merchant accounts"
        />

        {/* Create Merchant form */}
        <Card className="max-w-lg">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle className="text-base">Create Merchant</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="merch-code">Store Code</Label>
                <Input
                  id="merch-code"
                  type="text"
                  placeholder="e.g. STORE-001"
                  value={storeCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStoreCode(e.target.value)}
                  required
                />
              </div>

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
                disabled={mutation.isPending || !storeCode || !name || !msisdn || !pin}
              >
                {mutation.isPending ? 'Creating…' : 'Create Merchant'}
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
      </div>

      {/* Success dialog */}
      <Dialog open={!!result} onOpenChange={() => setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <DialogTitle className="text-center">Merchant Created</DialogTitle>
            <DialogDescription className="text-center">
              The merchant account has been created successfully.
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
                <span className="font-medium">Correlation ID:</span>{' '}
                {result.correlation_id}
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
