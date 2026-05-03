import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import TableSkeleton from './TableSkeleton';

export interface Column<T> {
  key: keyof T & string;
  label: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  hideOnMobile?: boolean;
  priority?: number;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (row: T) => void;
  keyExtractor?: (row: T, index: number) => string;
  className?: string;
}

export function ResponsiveTable<T extends Record<string, unknown>>({
  data,
  columns,
  isLoading = false,
  emptyMessage = 'No data available',
  emptyIcon,
  onRowClick,
  keyExtractor,
  className = '',
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();

  if (isLoading) {
    return <TableSkeleton columns={columns.length} rows={6} />;
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        {emptyIcon && <div className="mb-3 text-muted-foreground">{emptyIcon}</div>}
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  if (isMobile) {
    const visibleCols = columns.filter((c) => !c.hideOnMobile);
    return (
      <div className={`flex flex-col gap-3 ${className}`}>
        {data.map((row, i) => (
          <Card
            key={keyExtractor ? keyExtractor(row, i) : i}
            className={onRowClick ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}
            onClick={() => onRowClick?.(row)}
          >
            <CardContent className="p-3 space-y-2">
              {visibleCols.map((col) => (
                <div key={col.key} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">{col.label}</span>
                  <span className="text-xs font-medium text-right truncate max-w-[60%]">
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '-')}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={keyExtractor ? keyExtractor(row, i) : i}
                className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 whitespace-nowrap">
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ResponsiveTable;
