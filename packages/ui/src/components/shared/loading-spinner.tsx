import { cn } from '../../lib/utils.js';

const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
} as const;

export interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
    return (
        <div
            className={cn(
                'animate-spin rounded-full border-muted-foreground/30 border-t-primary',
                sizeClasses[size],
                className,
            )}
            role="status"
            aria-label="Loading"
        />
    );
}

export interface PageLoaderProps {
    message?: string;
    size?: 'sm' | 'md' | 'lg';
}

export function PageLoader({ message = 'Loading…', size = 'lg' }: PageLoaderProps) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
            <LoadingSpinner size={size} />
            <p className="text-sm text-muted-foreground">{message}</p>
        </div>
    );
}
