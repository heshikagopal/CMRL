import { cn } from "@/lib/utils";

const ASSET_STATUS_STYLES: Record<string, { label: string; badge: string; dot: string }> = {
  WORKING: {
    label: "Working",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  NOT_WORKING: {
    label: "Not Working",
    badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800",
    dot: "bg-red-500",
  },
  IN_STORE: {
    label: "In Store",
    badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
    dot: "bg-blue-500",
  },
  UNDER_REPAIR: {
    label: "Under Repair",
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  RETIRED: {
    label: "Retired",
    badge: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    dot: "bg-slate-500",
  },
};

const TICKET_STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800",
  ASSIGNED: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
  IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
  WAITING_SPARE_PARTS: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  CLOSED: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300",
  HIGH: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300",
  CRITICAL: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/80 dark:text-red-300",
};

export function AssetStatusBadge({ status, className }: { status: string; className?: string }) {
  const cfg = ASSET_STATUS_STYLES[status] || ASSET_STATUS_STYLES.RETIRED;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        cfg.badge,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function TicketStatusBadge({ status }: { status: string }) {
  const cls = TICKET_STATUS_STYLES[status] || "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", cls)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_STYLES[priority] || PRIORITY_STYLES.MEDIUM;
  return (
    <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", cls)}>
      {priority}
    </span>
  );
}

export function MetroLineBadge({ line }: { line: string }) {
  if (line === "BLUE") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-[#0066B3]/10 px-2 py-0.5 text-xs font-semibold text-[#0066B3] dark:bg-[#0066B3]/25 dark:text-sky-300">
        <span className="h-2 w-2 rounded-full bg-[#0066B3]" />
        Blue Line
      </span>
    );
  }
  if (line === "GREEN") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-[#009E49]/10 px-2 py-0.5 text-xs font-semibold text-[#009E49] dark:bg-[#009E49]/25 dark:text-emerald-300">
        <span className="h-2 w-2 rounded-full bg-[#009E49]" />
        Green Line
      </span>
    );
  }
  if (line === "INTERCHANGE") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
        <span className="h-2 w-2 rounded-full bg-[#0066B3]" />
        <span className="h-2 w-2 rounded-full bg-[#009E49]" />
        Interchange
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      Nandanam HQ
    </span>
  );
}
