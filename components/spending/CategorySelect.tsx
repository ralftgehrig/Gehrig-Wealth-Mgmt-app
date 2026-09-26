'use client';

import type { TransactionCategory } from '@/lib/spending/types';

interface CategorySelectProps {
  categories: TransactionCategory[];
  value: string | null;
  onChange: (categoryId: string) => void;
  className?: string;
}

export default function CategorySelect({ categories, value, onChange, className }: CategorySelectProps) {
  const topLevel = categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const childrenOf = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <select
      className={className ?? 'input'}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      {topLevel.map((top) => {
        const children = childrenOf(top.id);
        if (children.length === 0) {
          return (
            <option key={top.id} value={top.id}>
              {top.name}
            </option>
          );
        }
        return (
          <optgroup key={top.id} label={top.name}>
            <option value={top.id}>{top.name} (general)</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
