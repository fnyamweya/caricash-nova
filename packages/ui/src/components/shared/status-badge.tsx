import { cn } from '../../lib/utils.js';
import { Badge } from '../ui/badge.js';

type BadgeVariant = 'success' | 'warning' | 'destructive' | 'secondary';

const statusVariantMap: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  APPROVED: 'success',
  COMPLETED: 'success',
  POSTED: 'success',
  PENDING: 'warning',
  NOT_STARTED: 'warning',
  INITIATED: 'warning',
  REJECTED: 'destructive',
  FAILED: 'destructive',
  CLOSED: 'destructive',
  SUSPENDED: 'destructive',
};

function getVariant(status: string): BadgeVariant {
  return statusVariantMap[status.toUpperCase()] ?? 'secondary';
}

export interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'default';
}

export function StatusBadge({ status, size = 'default' }: StatusBadgeProps) {
  return (
    <Badge
      variant={getVariant(status)}
      className={cn(size === 'sm' && 'px-1.5 py-0 text-[10px]')}
    >
      {status}
    </Badge>
  );
}
