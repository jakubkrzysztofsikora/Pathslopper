import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  body?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  title,
  body,
  icon,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 px-6 py-12 text-center",
        className
      )}
      {...props}
    >
      {icon && <div className="text-zinc-400">{icon}</div>}
      <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
      {body && (
        <p className="max-w-md text-sm text-zinc-300 leading-relaxed">{body}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
