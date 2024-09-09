import React, {
  ChangeEvent,
  ComponentType,
  InputHTMLAttributes,
  useMemo,
  useState,
} from 'react';

import { FilterIcon } from '../icons/Filter.js';
import { GearIcon } from '../icons/Gear.js';
import { IconButton } from '../icons/IconButton.js';
import { SearchIcon } from '../icons/Search.js';

export interface SearchMenuProps<
  ListItem extends { disabled?: boolean },
  SortAndFilterState,
> {
  data: ListItem[];
  searchFn: (data: ListItem[], query: string) => ListItem[];
  onClickItem: (item: ListItem) => void;
  onClickEditItem: (item: ListItem) => void;
  ListComponent: ComponentType<{ data: ListItem }>;
  defaultSortAndFilterState: SortAndFilterState;
  FilterComponent: ComponentType<{
    value: SortAndFilterState;
    onChange: (s: SortAndFilterState) => void;
  }>;
}

export function SearchMenu<
  ListItem extends { disabled?: boolean },
  SortAndFilterState,
>({
  data,
  searchFn,
  onClickItem,
  onClickEditItem,
  ListComponent,
  defaultSortAndFilterState,
  FilterComponent,
}: SearchMenuProps<ListItem, SortAndFilterState>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditState, setEditState] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filterState, setFilterState] = useState<SortAndFilterState>(
    defaultSortAndFilterState,
  );

  const results = useMemo(
    () => searchFn(data, searchQuery),
    [data, searchQuery, searchFn],
  );

  return (
    <div className="htw-flex htw-flex-col">
      <div className="htw-relative">
        <SearchInput value={searchQuery} onChange={setSearchQuery} />
        <div className="htw-flex htw-items-center htw-gap-4 htw-absolute htw-right-4">
          <IconButton
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
          >
            <FilterIcon width={20} height={20} />
          </IconButton>
          <IconButton onClick={() => setEditState(!isEditState)}>
            <GearIcon width={20} height={20} />
          </IconButton>
        </div>
        {showFilterDropdown && (
          <div className="htw-absolute htw-right-2-htw-top-16">
            <FilterComponent value={filterState} onChange={setFilterState} />
          </div>
        )}
      </div>

      <div className="htw-flex htw-flex-col htw-items-stretch">
        {results.length ? (
          results.map((data, i) => (
            <button
              className={`-htw-mx-2 htw-px-2 htw-rounded htw-flex htw-items-center ${
                data.disabled ? 'htw-opacity-50' : 'hover:htw-bg-gray-200'
              } htw-transition-all htw-duration-250 htw-border-b htw-border-gray-100 last:htw-border-b-0`}
              key={i}
              type="button"
              disabled={data.disabled}
              onClick={() =>
                isEditState ? onClickEditItem(data) : onClickItem(data)
              }
            >
              <ListComponent data={data} />
            </button>
          ))
        ) : (
          <div className="htw-my-8 htw-text-gray-500 htw-text-center">
            No results found
          </div>
        )}
      </div>
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  onChange: (v: string) => void;
  classes?: string;
};

function SearchInput({ onChange, classes, ...props }: InputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e?.target?.value || '');
  };

  return (
    <input
      type="text"
      autoComplete="off"
      onChange={handleChange}
      className={`htw-rounded-full htw-bg-gray-400 htw-px-10 htw-py-3 focus:htw-bg-gray-300 disabled:htw-bg-gray-600 htw-outline-none htw-transition-all htw-duration-300 ${classes}`}
      {...props}
    >
      <SearchIcon width={18} height={18} />
    </input>
  );
}
