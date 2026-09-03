'use client';

import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectGroup, 
  SelectItem, 
  SelectLabel, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

interface ModuleSelectorProps {
  selectedModule: string | null;
  onModuleChange: (module: string | null) => void;
}

export function ModuleSelector({ selectedModule, onModuleChange }: ModuleSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Select 
        value={selectedModule || 'all'} 
        onValueChange={(value) => onModuleChange(value === 'all' ? null : value)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Module" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Modules</SelectItem>
          <SelectGroup>
            <SelectLabel>Core</SelectLabel>
            <SelectItem value="control-centre">Control Centre</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="operations">Operations</SelectItem>
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Support</SelectLabel>
            <SelectItem value="hr">HR</SelectItem>
            <SelectItem value="accounts">Accounts</SelectItem>
            <SelectItem value="office-admin">Office Admin</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      
      {selectedModule && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => onModuleChange(null)}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
