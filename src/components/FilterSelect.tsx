import React from 'react';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<FilterOption | string>;
  placeholder?: string;
  width?: string;
}

export const FilterSelect: React.FC<FilterSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Semua Filter',
  width = '180px',
}) => {
  return (
    <div style={{ display: 'inline-block', width }}>
      <select
        className="input-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          paddingTop: '8px',
          paddingBottom: '8px',
          fontSize: '0.9rem',
          height: '40px',
          cursor: 'pointer',
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => {
          const optValue = typeof opt === 'string' ? opt : opt.value;
          const optLabel = typeof opt === 'string' ? opt : opt.label;
          return (
            <option key={optValue} value={optValue}>
              {optLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
};
