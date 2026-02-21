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
} from '@caricash/ui';

interface PostingReceipt {
  posting_id: string;
  state: string;
  [key: string]: unknown;
}

export function TransferPage() {
  const api = useApi();

  const [receiverStoreCode, setReceiverStoreCode] = useState('');
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState<PostingReceipt | null>(null);

  const senderStoreCode = localStorage.getItem('caricash_store_code') ?? '';

  const mutation = useMutation({
    mutationFn: async () => {
      return api.post<PostingReceipt>('/tx/b2b', {
        sender_store_code: senderStoreCode,
        receiver_store_code: receiverStoreCode,
        amount,
        currency: 'BBD',
        idempotency_key: crypto.randomUUID(),
      });
    },
    onSuccess: (res) => {
      setReceipt(res);
      setReceiverStoreCode('');
      setAmount('');
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
          title="B2B Transfer"
          description="Transfer funds to another CariCash merchant"
        />

        <Card className="max-w-lg">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle className="text-base">Transfer Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="receiver-store-code">
                  Recipient Store Code
                </Label>
                <Input
                  id="receiver-store-code"
                  type="text"
                  placeholder="e.g. STORE-001"
                  value={receiverStoreCode}
                  onChange={(e) => setReceiverStoreCode(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount">Amount (BBD)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              {mutation.isError && (
                <p className="text-sm text-destructive">
                  {mutation.error?.message ?? 'Transfer failed. Please try again.'}
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={mutation.isPending || !receiverStoreCode || !amount}
              >
                {mutation.isPending ? 'Processing…' : 'Send Transfer'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      {/* Success dialog */}
      <Dialog open={!!receipt} onOpenChange={() => setReceipt(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <DialogTitle className="text-center">Transfer Successful</DialogTitle>
            <DialogDescription className="text-center">
              The B2B transfer has been processed successfully.
            </DialogDescription>
          </DialogHeader>
          {receipt && (
            <div className="rounded-md bg-muted p-4 text-sm">
              <p>
                <span className="font-medium">Posting ID:</span>{' '}
                {receipt.posting_id}
              </p>
              <p>
                <span className="font-medium">State:</span> {receipt.state}
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
