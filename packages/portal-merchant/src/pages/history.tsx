import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import {
  useApi,
  PageHeader,
  PageTransition,
  TransactionTable,
  EmptyState,
  Card,
  CardContent,
  ApiError,
  type Transaction,
} from '@caricash/ui';

export function HistoryPage() {
  const api = useApi();

  const txQuery = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: async () => {
      try {
        return await api.get<Transaction[]>('/tx');
      } catch (err) {
        // Gracefully handle 501 Not Implemented
        if (err instanceof ApiError && err.status === 501) {
          return [];
        }
        throw err;
      }
    },
  });

  const transactions = txQuery.data ?? [];

  return (
    <PageTransition>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Transaction History"
          description="View your past transactions"
        />

        {transactions.length > 0 ? (
          <TransactionTable
            transactions={transactions}
            loading={txQuery.isLoading}
          />
        ) : (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                icon={<Clock />}
                title="No transactions yet"
                description="Transaction history is not available at this time. Check back later."
              />
            </CardContent>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
