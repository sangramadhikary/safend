'use client';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, Plus } from 'lucide-react';
import { FormEvent } from "react";

interface SearchFormProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedBranchId: string | undefined;
  setSelectedBranchId: (id: string | undefined) => void;
  handleSearch: (e: FormEvent) => void;
}

export function SearchForm({ 
  searchQuery, 
  setSearchQuery, 
  selectedBranchId, 
  setSelectedBranchId,
  handleSearch 
}: SearchFormProps) {
  return (
    <div className="flex justify-between items-center gap-4 flex-wrap">
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <Input
          placeholder="Search advances..."
          className="max-w-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="h-10 rounded-md border border-input bg-background px-3"
          value={selectedBranchId || ''}
          onChange={(e) => setSelectedBranchId(e.target.value || undefined)}
        >
          <option value="">All Branches</option>
          <option value="delhi">Delhi</option>
          <option value="mumbai">Mumbai</option>
          <option value="bangalore">Bangalore</option>
          <option value="chennai">Chennai</option>
        </select>
        <Button type="submit">
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
      </form>
      
      <div className="flex items-center gap-2">
        <Button variant="outline">
          <Filter className="h-4 w-4 mr-2" />
          Filter
        </Button>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Advance
        </Button>
      </div>
    </div>
  );
}
