'use client';

import { useState } from "react";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardWidget } from "@/types/operations";
import { Settings } from "lucide-react";

interface WidgetCustomizerProps {
  widget?: DashboardWidget;
  onSave: (widgetId: string, config: Record<string, any>) => void;
  customizationOptions: Record<string, any>;
}

export default function WidgetCustomizer({ widget, onSave, customizationOptions }: WidgetCustomizerProps) {
  const [config, setConfig] = useState<Record<string, any>>(
    widget?.config || customizationOptions
  );

  const handleToggleChange = (key: string, checked: boolean) => {
    setConfig(prev => ({
      ...prev,
      [key]: checked
    }));
  };

  const handleSliderChange = (key: string, value: number[]) => {
    setConfig(prev => ({
      ...prev,
      [key]: value[0]
    }));
  };

  const handleSelectChange = (key: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    if (widget) {
      onSave(widget.id, config);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4">
          <div className="font-medium">Widget Configuration</div>
          
          <div className="space-y-4">
            {/* Generate controls based on the customization options */}
            {Object.entries(customizationOptions).map(([key, value]) => {
              // Boolean toggle switches
              if (typeof value === 'boolean') {
                return (
                  <div className="flex items-center justify-between" key={key}>
                    <Label htmlFor={key} className="flex-1">
                      {key.replace(/([A-Z])/g, ' $1')
                        .replace(/^./, str => str.toUpperCase())
                        .replace(/([a-z])(\d)/, '$1 $2')}
                    </Label>
                    <Switch
                      id={key}
                      checked={config[key] || false}
                      onCheckedChange={(checked) => handleToggleChange(key, checked)}
                    />
                  </div>
                );
              }
              
              // Number sliders
              if (typeof value === 'number') {
                const max = key.includes('limit') ? 20 : key.includes('days') ? 14 : 100;
                
                return (
                  <div className="space-y-2" key={key}>
                    <div className="flex items-center justify-between">
                      <Label htmlFor={key}>
                        {key.replace(/([A-Z])/g, ' $1')
                          .replace(/^./, str => str.toUpperCase())
                          .replace(/([a-z])(\d)/, '$1 $2')}
                      </Label>
                      <span className="font-mono text-sm">{config[key] || value}</span>
                    </div>
                    <Slider
                      id={key}
                      min={1}
                      max={max}
                      step={1}
                      defaultValue={[config[key] || value]}
                      onValueChange={(val) => handleSliderChange(key, val)}
                    />
                  </div>
                );
              }
              
              // String selects (like mapStyle)
              if (typeof value === 'string' && key === 'mapStyle') {
                return (
                  <div className="space-y-2" key={key}>
                    <Label htmlFor={key}>
                      Map Style
                    </Label>
                    <Select
                      value={config[key] || value}
                      onValueChange={(val) => handleSelectChange(key, val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="streets">Streets</SelectItem>
                        <SelectItem value="satellite">Satellite</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              
              return null;
            })}
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfig(widget?.config || customizationOptions)}>
              Reset
            </Button>
            <Button onClick={handleSave}>
              Apply Changes
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
