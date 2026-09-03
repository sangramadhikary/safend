'use client';
import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={(resolvedTheme ?? "system") as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      duration={1500}
      offset={80}
      style={{ '--width': '260px', zIndex: 9999 } as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white/95 dark:group-[.toaster]:bg-gray-900/95 group-[.toaster]:text-foreground group-[.toaster]:border-white/20 group-[.toaster]:shadow-lg group-[.toaster]:backdrop-blur-xl group-[.toaster]:rounded-full group-[.toaster]:text-xs group-[.toaster]:py-2 group-[.toaster]:px-4 group-[.toaster]:min-h-0 group-[.toaster]:animate-[slideUp_0.2s_ease-out]",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-[11px]",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:border-green-500/30 group-[.toaster]:bg-green-50/95 dark:group-[.toaster]:bg-green-900/90",
          error:
            "group-[.toaster]:border-red-500/30 group-[.toaster]:bg-red-50/95 dark:group-[.toaster]:bg-red-900/90",
          warning:
            "group-[.toaster]:border-amber-500/30 group-[.toaster]:bg-amber-50/95 dark:group-[.toaster]:bg-amber-900/90",
          info:
            "group-[.toaster]:border-blue-500/30 group-[.toaster]:bg-blue-50/95 dark:group-[.toaster]:bg-blue-900/90",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
