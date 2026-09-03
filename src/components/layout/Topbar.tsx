'use client';

import { NotificationPanel } from "./NotificationPanel";
import { DigitalClock } from "./DigitalClock";
import { useBranch } from "@/contexts/BranchContext";
import { Building2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Topbar() {
  const { allBranches, currentBranch, setCurrentBranchById, isMainBranchUser } = useBranch();

  const activeBranches = allBranches.filter(b => b.status === 'active');

  return (
    <header className="h-14 sm:h-16 border-b border-white/30 dark:border-white/10 bg-white/80 dark:bg-[#0B0F19]/80 backdrop-blur-lg sticky top-0 z-40 flex items-center px-3 sm:px-4 md:px-6 gap-2 sm:gap-4">
      {/* Left — Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <img
          src="https://static.wixstatic.com/media/5b3fdf_0d52b265a0004375a797c038ad88f65e~mv2.png/v1/fill/w_278,h_172,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Logo_edited_edited.png"
          alt="Safend Logo"
          className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
        />
        <span className="font-semibold text-base sm:text-lg hidden sm:inline">Safend</span>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Branch selector — compact on mobile */}
      {currentBranch && (
        isMainBranchUser ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex items-center gap-1.5 sm:gap-2 h-8 sm:h-9 pl-2.5 sm:pl-3 pr-2 sm:pr-2.5 rounded-lg text-xs sm:text-sm font-medium",
                "bg-muted/60 hover:bg-muted border border-border/50",
                "transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              )}>
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="max-w-[80px] sm:max-w-[140px] truncate">{currentBranch.name}</span>
                {currentBranch.type === 'main' && (
                  <Badge className="text-[9px] px-1.5 py-0 h-4 bg-red-600 text-white hover:bg-red-600 rounded-full font-semibold hidden sm:inline-flex">
                    HQ
                  </Badge>
                )}
                <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Switch Branch
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {activeBranches.map((branch) => (
                <DropdownMenuItem
                  key={branch.id}
                  onClick={() => setCurrentBranchById(branch.id)}
                  className={cn(
                    "flex items-center justify-between gap-2 cursor-pointer",
                    currentBranch.id === branch.id && "bg-red-600 text-white font-medium focus:bg-red-600 focus:text-white"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className={cn("h-3.5 w-3.5 shrink-0", currentBranch.id === branch.id ? "text-white" : "text-muted-foreground")} />
                    <span className="truncate">{branch.name}</span>
                  </div>
                  {branch.type === 'main' && (
                    <Badge className={cn(
                      "text-[9px] px-1.5 py-0 h-4 rounded-full font-semibold shrink-0",
                      currentBranch.id === branch.id ? "bg-white text-red-600 hover:bg-white" : "bg-red-600 text-white hover:bg-red-600"
                    )}>
                      HQ
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2 h-8 sm:h-9 pl-2.5 sm:pl-3 pr-2.5 sm:pr-3 rounded-lg text-xs sm:text-sm font-medium bg-muted/60 border border-border/50">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="max-w-[80px] sm:max-w-[140px] truncate">{currentBranch.name}</span>
          </div>
        )
      )}

      {/* Right — Controls */}
      <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0">
        <NotificationPanel />
        <DigitalClock />
      </div>
    </header>
  );
}
