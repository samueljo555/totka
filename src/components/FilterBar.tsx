import React from 'react';
import { RotateCcw } from 'lucide-react';
import { SearchInput } from './SearchInput';
import { FilterSelect } from './FilterSelect';

interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterOptions?: Array<{ value: string; label: string } | string>;
  filterPlaceholder?: string;
  onReset?: () => void;
  children?: React.ReactNode;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Cari siswa (Nama/NISN/Kelas)...',
  filterValue = '',
  onFilterChange,
  filterOptions = [],
  filterPlaceholder = 'Semua Kelas',
  onReset,
  children,
}) => {
  const isFiltered = Boolean(searchValue || (filterValue && filterValue !== ''));

  const handleReset = () => {
    onSearchChange('');
    if (onFilterChange) onFilterChange('');
    if (onReset) onReset();
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '1.25rem',
      }}
    >
      <SearchInput
        value={searchValue}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        onClear={() => onSearchChange('')}
      />

      {onFilterChange && filterOptions.length > 0 && (
        <FilterSelect
          value={filterValue}
          onChange={onFilterChange}
          options={filterOptions}
          placeholder={filterPlaceholder}
        />
      )}

      {isFiltered && (
        <button
          type="button"
          onClick={handleReset}
          className="btn-secondary"
          style={{
            padding: '8px 14px',
            fontSize: '0.85rem',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            gap: '6px',
            border: '1px dashed #cbd5e1',
          }}
          title="Reset semua pencarian & filter"
        >
          <RotateCcw size={14} />
          <span>Reset Filter</span>
        </button>
      )}

      {children}
    </div>
  );
};
