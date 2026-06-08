import React from "react";
import { BookOpen, BookMarked, AlignLeft, ChevronUp } from "lucide-react";

// ── Shared Description Toggle Components ────────────────────────────────────
// Used across Quotation, Sales Orders, Sales Invoices, Purchase Invoices, LPO

interface DescTogglePillProps {
  allExpanded: boolean;
  partialExpanded: boolean;
  descCount: number;
  onToggle: () => void;
}

/** Gold pill button placed in the column header – toggles ALL description rows */
export function DescTogglePill({
  allExpanded,
  partialExpanded,
  descCount,
  onToggle,
}: DescTogglePillProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={
        allExpanded ? "Collapse all descriptions" : "Expand all descriptions"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 7px 2px 5px",
        borderRadius: "999px",
        fontSize: "9px",
        fontWeight: 600,
        letterSpacing: "0.04em",
        cursor: "pointer",
        transition: "background 0.18s, box-shadow 0.18s, color 0.18s",
        border: allExpanded
          ? "1.5px solid #F5C742"
          : partialExpanded
          ? "1.5px solid #e6a817"
          : "1.5px solid rgba(245,199,66,0.55)",
        background: allExpanded
          ? "linear-gradient(135deg,#F5C742 0%,#e6a817 100%)"
          : partialExpanded
          ? "rgba(245,199,66,0.12)"
          : "transparent",
        color: allExpanded ? "#3d2f00" : "#b8922a",
        boxShadow: allExpanded
          ? "0 0 0 3px rgba(245,199,66,0.22), 0 1px 4px rgba(245,199,66,0.3)"
          : "none",
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          transform: allExpanded ? "scale(1.1)" : "scale(1)",
          transition: "transform 0.2s",
        }}
      >
        {allExpanded ? (
          <BookMarked style={{ width: 10, height: 10 }} />
        ) : (
          <BookOpen style={{ width: 10, height: 10 }} />
        )}
      </span>

      <span>{allExpanded ? "Hide All" : "Show All"}</span>

      {descCount > 0 && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "14px",
            height: "14px",
            padding: "0 3px",
            borderRadius: "999px",
            fontSize: "8px",
            fontWeight: 700,
            lineHeight: "1",
            background: allExpanded
              ? "rgba(61,47,0,0.18)"
              : "rgba(245,199,66,0.22)",
            color: allExpanded ? "#3d2f00" : "#b8922a",
          }}
        >
          {descCount}
        </span>
      )}

      {partialExpanded && (
        <span
          style={{
            display: "inline-block",
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: "#F5C742",
            flexShrink: 0,
          }}
        />
      )}
    </button>
  );
}

interface DescRowBtnProps {
  expanded: boolean;
  onToggle: (e: React.MouseEvent) => void;
}

/** Small per-row icon button (AlignLeft ↔ ChevronUp) to toggle one row */
export function DescRowBtn({ expanded, onToggle }: DescRowBtnProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={expanded ? "Hide description" : "Show description"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "22px",
        height: "22px",
        borderRadius: "4px",
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.15s, color 0.15s",
        background: expanded ? "rgba(245,199,66,0.15)" : "transparent",
        color: expanded ? "#F5C742" : "#94a3b8",
      }}
    >
      {expanded ? (
        <ChevronUp style={{ width: 12, height: 12 }} />
      ) : (
        <AlignLeft style={{ width: 12, height: 12 }} />
      )}
    </button>
  );
}

interface DescriptionRowProps {
  /** Number of table columns to span */
  colSpan: number;
  value: string;
  onChange: (val: string) => void;
  /** Optional left indent in px (default 12) for the outer td padding-left */
  paddingLeft?: number;
}

/**
 * A full-width `<tr>` containing the premium description textarea.
 * Drop it directly after a normal `<tr>` inside a `<tbody>`.
 */
export function DescriptionRow({
  colSpan,
  value,
  onChange,
  paddingLeft = 12,
}: DescriptionRowProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          padding: `0 12px 8px ${paddingLeft}px`,
          background:
            "linear-gradient(to bottom, rgba(255,251,235,0.6), rgba(255,248,220,0.3))",
        }}
      >
        <div
          style={{
            position: "relative",
            borderRadius: "6px",
            overflow: "hidden",
            background:
              "linear-gradient(135deg, #fffbf0 0%, #fef3c7 50%, rgba(253,230,138,0.13) 100%)",
            border: "1px solid rgba(245,199,66,0.25)",
            boxShadow:
              "0 1px 4px rgba(245,199,66,0.08), inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        >
          {/* Gold accent left bar */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "3px",
              background:
                "linear-gradient(to bottom, #F5C742, #e6a817, #d4900a)",
            }}
          />
          {/* Gold shimmer bottom line */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "1px",
              background:
                "linear-gradient(to right, transparent 0%, #F5C742 40%, #e6a817 60%, transparent 100%)",
            }}
          />
          <div style={{ padding: "6px 10px 6px 14px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "4px",
              }}
            >
              <span
                style={{
                  fontSize: "8px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "#b8922a",
                  textTransform: "uppercase",
                }}
              >
                PRODUCT DESCRIPTION
              </span>
              <span
                style={{ fontSize: "8px", color: "#d4900a", fontWeight: 500 }}
              >
                {(value || "").length} chars
              </span>
            </div>
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Enter detailed product description, specifications, or notes…"
              style={{
                width: "100%",
                fontSize: "9px",
                lineHeight: "1.5",
                color: "#44403c",
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                padding: 0,
                minHeight: "40px",
                maxHeight: "96px",
                overflowY: "auto",
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>
      </td>
    </tr>
  );
}

/**
 * Hook encapsulating the expand/collapse state for description rows.
 * Pass `items` as the array of items (each with an `id: string`).
 */
export function useDescToggle(items: { id: string; description?: string }[]) {
  const [expandedDescriptions, setExpandedDescriptions] = React.useState<
    Set<string>
  >(new Set());

  const toggleDescription = React.useCallback((itemId: string) => {
    setExpandedDescriptions((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const itemsWithDesc = React.useMemo(
    () => items.filter((it) => (it.description ?? "").trim().length > 0),
    [items]
  );

  const allDescExpanded =
    items.length > 0 && items.every((it) => expandedDescriptions.has(it.id));
  const anyDescExpanded = items.some((it) => expandedDescriptions.has(it.id));
  const partialDescExpanded = anyDescExpanded && !allDescExpanded;

  const toggleAllDescriptions = React.useCallback(() => {
    if (allDescExpanded) {
      setExpandedDescriptions(new Set());
    } else {
      setExpandedDescriptions(new Set(items.map((it) => it.id)));
    }
  }, [allDescExpanded, items]);

  return {
    expandedDescriptions,
    toggleDescription,
    itemsWithDesc,
    allDescExpanded,
    partialDescExpanded,
    toggleAllDescriptions,
  };
}
