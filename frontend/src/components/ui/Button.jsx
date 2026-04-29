import { cn } from "@/lib/utils";

const variants = {
  default:
    "bg-elevated border border-border text-text hover:bg-sunken hover:border-border-strong hover:-translate-y-0.5 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.3)]",
  ghost:
    "border border-transparent text-muted hover:bg-elevated hover:text-text",
  primary:
    "bg-accent border border-accent text-white hover:bg-accent-hover hover:-translate-y-0.5 shadow-[0_4px_20px_-4px_rgba(59,130,246,0.5)] hover:shadow-[0_8px_24px_-4px_rgba(59,130,246,0.6)]",
  outline:
    "bg-transparent border border-border text-text hover:bg-elevated hover:border-accent/30 hover:-translate-y-0.5",
};

const sizes = {
  sm: "px-2.5 py-1.5 text-xs gap-1.5 rounded",
  md: "px-3.5 py-2 text-sm gap-2 rounded-lg",
  lg: "px-5 py-2.5 text-sm gap-2 rounded-lg",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  children,
  ...props
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium",
        "transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}