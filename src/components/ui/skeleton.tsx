'use client';
import { cn } from "@/lib/utils"
import { UnifiedLoader } from "./unified-loader"

function Skeleton({
  className,
  variant = "content",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "content" | "loader" }) {
  if (variant === "loader") {
    return <UnifiedLoader size="sm" variant="minimal" className={className} />;
  }

  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
