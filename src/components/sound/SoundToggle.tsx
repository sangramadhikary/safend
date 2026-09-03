'use client';

import { Button } from "@/components/ui/button";
import { Volume2, VolumeX } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSoundContext } from "./SoundEffectsProvider";

export function SoundToggle() {
  const { isSoundEnabled, toggleSound } = useSoundContext();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full w-10 h-10 fixed bottom-4 right-4 z-50 bg-background/80 backdrop-blur-xs border shadow-md"
            onClick={toggleSound}
            aria-label={isSoundEnabled ? "Disable sound effects" : "Enable sound effects"}
          >
            {isSoundEnabled ? (
              <Volume2 className="h-5 w-5" />
            ) : (
              <VolumeX className="h-5 w-5" />
            )}
            <span className="sr-only">
              {isSoundEnabled ? "Disable sound effects" : "Enable sound effects"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>{isSoundEnabled ? "Disable sound effects" : "Enable sound effects"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
