import { CreditCard } from 'lucide-react';
import {
    PageHeader,
    PageTransition,
    EmptyState,
    Card,
    CardContent,
} from '@caricash/ui';

export function PaymentsPage() {
    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Incoming Payments"
                    description="Track payments received from customers"
                />

                <Card>
                    <CardContent className="py-8">
                        <EmptyState
                            icon={<CreditCard />}
                            title="No payments yet"
                            description="Payment history will appear here once customers start paying at your store."
                        />
                    </CardContent>
                </Card>
            </div>
        </PageTransition>
    );
}
