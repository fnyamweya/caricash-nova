import { cn } from '../../lib/utils.js';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../ui/table.js';
import { Skeleton } from '../ui/skeleton.js';
import { EmptyState } from './empty-state.js';

export interface DataTableColumn<T> {
    key: keyof T;
    header: string;
    render?: (value: T[keyof T], row: T) => React.ReactNode;
    className?: string;
}

export interface DataTableProps<T> {
    data: T[];
    columns: DataTableColumn<T>[];
    emptyMessage?: string;
    loading?: boolean;
    onRowClick?: (row: T) => void;
}

export function DataTable<T extends object>({
    data,
    columns,
    emptyMessage = 'No data found',
    loading = false,
    onRowClick,
}: DataTableProps<T>) {
    if (loading) {
        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map((col) => (
                            <TableHead key={String(col.key)} className={col.className}>
                                {col.header}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                            {columns.map((col) => (
                                <TableCell key={String(col.key)} className={col.className}>
                                    <Skeleton className="h-4 w-full" />
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        );
    }

    if (data.length === 0) {
        return <EmptyState title={emptyMessage} />;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    {columns.map((col) => (
                        <TableHead key={String(col.key)} className={col.className}>
                            {col.header}
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((row, i) => (
                    <TableRow
                        key={i}
                        className={cn(onRowClick && 'cursor-pointer')}
                        onClick={() => onRowClick?.(row)}
                    >
                        {columns.map((col) => (
                            <TableCell key={String(col.key)} className={col.className}>
                                {col.render
                                    ? col.render(row[col.key], row)
                                    : String(row[col.key] ?? '')}
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
