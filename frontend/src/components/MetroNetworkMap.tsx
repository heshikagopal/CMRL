import { useState } from "react";
import type { StationNodeSummary } from "@/types";

export type MapViewMode = "HEALTH" | "FAULT_DENSITY" | "WARRANTY";

const FLOOR_BANDS = [
  { level: "5F", label: "5th Floor • Executive & Operations", y: 54, h: 76 },
  { level: "4F", label: "4th Floor • Engineering & Telecom NOC", y: 140, h: 76 },
  { level: "3F", label: "3rd Floor • Admin & Finance", y: 226, h: 76 },
  { level: "2F", label: "2nd Floor • IT Helpdesk & Central Store", y: 312, h: 76 },
  { level: "GF / B1", label: "Ground Lobby & Basement B1 Data Centre", y: 398, h: 76 },
];

function getNodeColor(
  node: StationNodeSummary,
  mode: MapViewMode
): { fill: string; softBg: string; border: string; badgeText?: string } {
  if (mode === "FAULT_DENSITY") {
    if (node.total_assets === 0) {
      return { fill: "#64748B", softBg: "#F8FAFC", border: "#CBD5E1" };
    }
    if (node.fault_density_pct >= 30) {
      return { fill: "#DC2626", softBg: "#FEF2F2", border: "#FCA5A5", badgeText: `${node.fault_density_pct}%` };
    }
    if (node.fault_density_pct > 0) {
      return { fill: "#D97706", softBg: "#FFFBEB", border: "#FCD34D", badgeText: `${node.fault_density_pct}%` };
    }
    return { fill: "#16A34A", softBg: "#F0FDF4", border: "#86EFAC", badgeText: "0%" };
  }

  if (mode === "WARRANTY") {
    if (node.total_assets === 0) {
      return { fill: "#64748B", softBg: "#F8FAFC", border: "#CBD5E1" };
    }
    if (node.expiring_warranty_count >= 2) {
      return { fill: "#DC2626", softBg: "#FEF2F2", border: "#FCA5A5", badgeText: `${node.expiring_warranty_count} exp` };
    }
    if (node.expiring_warranty_count === 1) {
      return { fill: "#D97706", softBg: "#FFFBEB", border: "#FCD34D", badgeText: "1 exp" };
    }
    return { fill: "#0284C7", softBg: "#F0F9FF", border: "#7DD3FC", badgeText: "OK" };
  }

  // HEALTH view
  switch (node.health_status) {
    case "GREEN":
      return { fill: "#16A34A", softBg: "#F0FDF4", border: "#86EFAC" };
    case "AMBER":
      return { fill: "#D97706", softBg: "#FFFBEB", border: "#FCD34D" };
    case "RED":
      return { fill: "#DC2626", softBg: "#FEF2F2", border: "#FCA5A5" };
    default:
      return { fill: "#64748B", softBg: "#F8FAFC", border: "#CBD5E1" };
  }
}

function getFacilityBadge(locType: StationNodeSummary["location_type"]): string {
  switch (locType) {
    case "DATA_CENTRE":
      return "DC / NOC";
    case "CENTRAL_STORE":
      return "IT STORE";
    case "OTHER":
      return "REPAIR LAB";
    default:
      return "HQ WING";
  }
}

export function MetroNetworkMap({
  nodes,
  viewMode,
  selectedLocationId,
  onSelectLocation,
}: {
  nodes: StationNodeSummary[];
  viewMode: MapViewMode;
  selectedLocationId: number | null;
  onSelectLocation: (locId: number) => void;
}) {
  const [hovered, setHovered] = useState<StationNodeSummary | null>(null);

  // Separate nodes with schematic coordinates from newly added custom nodes without coordinates
  const positionedNodes = nodes.filter((n) => n.map_x != null && n.map_y != null);
  const unpositionedNodes = nodes.filter((n) => n.map_x == null || n.map_y == null);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950">
      <svg
        viewBox="0 0 1000 520"
        className="h-auto w-full select-none"
        role="img"
        aria-label="CMRL Nandanam Head Office IT Zone Schematic Map"
      >
        <defs>
          <pattern id="hqGrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Engineering Blueprint Grid */}
        <rect width="1000" height="520" fill="url(#hqGrid)" className="text-slate-500" />

        {/* Top Title Header */}
        <text x="28" y="30" className="fill-slate-500 text-[11px] font-bold tracking-widest dark:fill-slate-400">
          CMRL HEAD OFFICE (METROS, NANDANAM) — BUILDING &amp; IT ZONE TELEMETRY SCHEMATIC
        </text>
        <text x="972" y="30" textAnchor="end" className="fill-slate-400 font-mono text-[10px] dark:fill-slate-500">
          ANNA SALAI • CHENNAI 600035
        </text>

        {/* Outer Architectural Building Shell */}
        <rect
          x="24"
          y="44"
          width="952"
          height="442"
          rx="14"
          fill="none"
          stroke="#94A3B8"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />

        {/* Floor Bands */}
        {FLOOR_BANDS.map((band) => (
          <g key={band.level}>
            <rect
              x="34"
              y={band.y}
              width="932"
              height={band.h}
              rx="10"
              fill="#FFFFFF"
              fillOpacity="0.55"
              stroke="#CBD5E1"
              strokeOpacity="0.45"
              strokeWidth="1"
              className="dark:fill-slate-900/40"
            />
            <rect x="42" y={band.y + 18} width="54" height="40" rx="6" fill="#0A192F" />
            <text x="69" y={band.y + 42} textAnchor="middle" className="fill-white font-mono text-[11px] font-bold">
              {band.level}
            </text>
          </g>
        ))}

        {/* Central Dual-Redundant Fiber Backbone Riser (Blue = Primary Core, Green = Redundant Ring) */}
        <line x1="494" y1="84" x2="494" y2="444" stroke="#0066B3" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.85" />
        <line x1="506" y1="84" x2="506" y2="444" stroke="#009E49" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.85" />
        <rect x="458" y="468" width="84" height="16" rx="4" fill="#0F172A" />
        <text x="500" y="479" textAnchor="middle" className="fill-sky-300 font-mono text-[8.5px] font-bold">
          CORE FIBER RISER
        </text>

        {/* Floor Horizontal Patch Links to Riser */}
        {positionedNodes.map((node) => {
          const x = node.map_x!;
          const y = node.map_y!;
          const isLeft = x < 500;
          const edgeX = isLeft ? x + 158 : x - 158;
          const riserX = isLeft ? 494 : 506;
          return (
            <g key={`link-${node.location_id}`}>
              <line
                x1={edgeX}
                y1={y}
                x2={riserX}
                y2={y}
                stroke={isLeft ? "#0066B3" : "#009E49"}
                strokeWidth="2.5"
                strokeDasharray="4 3"
                strokeOpacity="0.7"
              />
              <circle cx={riserX} cy={y} r="4.5" fill={isLeft ? "#0066B3" : "#009E49"} stroke="#FFFFFF" strokeWidth="1.5" />
            </g>
          );
        })}

        {/* Interactive HQ Zone Cards */}
        {positionedNodes.map((node) => {
          const x = node.map_x!;
          const y = node.map_y!;
          const cardW = 316;
          const cardH = 58;
          const left = x - cardW / 2;
          const top = y - cardH / 2;
          const color = getNodeColor(node, viewMode);
          const isSelected = selectedLocationId === node.location_id;
          const faultTotal = node.not_working_count + node.under_repair_count;

          return (
            <g
              key={node.location_id}
              transform={`translate(${left}, ${top})`}
              onClick={() => onSelectLocation(node.location_id)}
              onMouseEnter={() => setHovered(node)}
              onMouseLeave={() => setHovered((prev) => (prev?.location_id === node.location_id ? null : prev))}
              className="cursor-pointer"
            >
              {/* Selection Halo */}
              {isSelected && (
                <rect
                  x="-4"
                  y="-4"
                  width={cardW + 8}
                  height={cardH + 8}
                  rx="11"
                  fill="none"
                  stroke="#0066B3"
                  strokeWidth="2.5"
                  strokeDasharray="4 3"
                />
              )}

              {/* Card Base */}
              <rect
                width={cardW}
                height={cardH}
                rx="9"
                fill="#FFFFFF"
                stroke={isSelected ? "#0066B3" : color.border}
                strokeWidth={isSelected ? "2.5" : "1.8"}
                className="dark:fill-slate-900"
              />

              {/* Left Status Accent Bar */}
              <rect width="8" height={cardH} rx="4" fill={color.fill} />

              {/* Critical Alert Pulse Dot */}
              {node.health_status === "RED" && viewMode === "HEALTH" && (
                <circle cx="24" cy="18" r="7" fill="#DC2626" fillOpacity="0.25" className="animate-ping" />
              )}
              <circle cx="24" cy="18" r="4.5" fill={color.fill} />

              {/* Zone Code & Facility Type */}
              <text x="35" y="21" className="fill-[#0066B3] font-mono text-[10.5px] font-bold dark:fill-sky-400">
                {node.location_code}
              </text>
              <rect x="132" y="10" width="62" height="15" rx="4" fill="#F1F5F9" className="dark:fill-slate-800" />
              <text x="163" y="20.5" textAnchor="middle" className="fill-slate-600 text-[8.5px] font-bold dark:fill-slate-300">
                {getFacilityBadge(node.location_type)}
              </text>

              {/* Zone Name */}
              <text x="19" y="42" className="fill-slate-900 text-[11.5px] font-bold dark:fill-slate-100">
                {node.name.length > 30 ? `${node.name.slice(0, 29)}…` : node.name}
              </text>

              {/* Right Telemetry Metrics Box */}
              <g transform={`translate(${cardW - 86}, 9)`}>
                <rect width="76" height="40" rx="6" fill={color.softBg} stroke={color.border} strokeWidth="1" />
                {color.badgeText ? (
                  <>
                    <text x="38" y="18" textAnchor="middle" fill={color.fill} className="font-mono text-[11px] font-bold">
                      {color.badgeText}
                    </text>
                    <text x="38" y="32" textAnchor="middle" className="fill-slate-500 text-[8.5px] font-semibold">
                      {node.total_assets} assets
                    </text>
                  </>
                ) : (
                  <>
                    <text x="38" y="18" textAnchor="middle" className="fill-slate-900 font-mono text-[11px] font-bold">
                      {node.working_count}/{node.total_assets} OK
                    </text>
                    <text
                      x="38"
                      y="32"
                      textAnchor="middle"
                      fill={faultTotal > 0 ? "#DC2626" : "#64748B"}
                      className="text-[8.5px] font-semibold"
                    >
                      {faultTotal > 0 ? `${faultTotal} fault/rep` : `${node.in_store_count} store`}
                    </text>
                  </>
                )}
              </g>
            </g>
          );
        })}

        {/* Bottom Schematic Key */}
        <g transform="translate(24, 493)">
          <circle cx="10" cy="8" r="4.5" fill="#0066B3" />
          <text x="20" y="11" className="fill-slate-600 text-[10px] font-medium dark:fill-slate-300">
            Primary Core Fiber (B1 DC → 5F)
          </text>
          <circle cx="215" cy="8" r="4.5" fill="#009E49" />
          <text x="225" y="11" className="fill-slate-600 text-[10px] font-medium dark:fill-slate-300">
            Redundant Uplink Ring
          </text>
          <text x="952" y="11" textAnchor="end" className="fill-slate-400 text-[10px]">
            Click any HQ floor/wing card to inspect IT assets &amp; maintenance tickets
          </text>
        </g>
      </svg>

      {/* Overflow chips if custom zones were created without schematic map_x/map_y */}
      {unpositionedNodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/80 px-4 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/70">
          <span className="font-semibold text-slate-500">Additional HQ Zones:</span>
          {unpositionedNodes.map((n) => (
            <button
              key={n.location_id}
              onClick={() => onSelectLocation(n.location_id)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-semibold hover:border-[#0066B3] dark:border-slate-700 dark:bg-slate-800"
            >
              {n.location_code} — {n.name} ({n.total_assets})
            </button>
          ))}
        </div>
      )}

      {/* Hover Tooltip Overlay */}
      {hovered && (
        <div className="pointer-events-none absolute right-4 top-10 z-10 w-64 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-xs dark:border-slate-700 dark:bg-slate-900/95">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold text-[#0066B3] dark:text-sky-400">
              {hovered.location_code}
            </span>
            <span className="text-[10px] font-semibold uppercase text-slate-500">
              {hovered.location_type.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">{hovered.name}</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
            <div className="rounded bg-slate-100 p-1 dark:bg-slate-800">
              <span className="block text-[9px] text-slate-500">Total</span>
              <span className="font-bold">{hovered.total_assets}</span>
            </div>
            <div className="rounded bg-emerald-50 p-1 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <span className="block text-[9px]">Working</span>
              <span className="font-bold">{hovered.working_count}</span>
            </div>
            <div className="rounded bg-red-50 p-1 text-red-700 dark:bg-red-950/60 dark:text-red-300">
              <span className="block text-[9px]">Fault/Rep</span>
              <span className="font-bold">{hovered.not_working_count + hovered.under_repair_count}</span>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">Click zone to inspect HQ assets &amp; tickets</p>
        </div>
      )}
    </div>
  );
}
