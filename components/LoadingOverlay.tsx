"use client";

import React from "react";
import { C, FM, WARM_STOPS } from "@/lib/tokens";
import { CheckIcon } from "./Icons";

/** Order-create error kinds, mapped from the /api/order HTTP status. */
export type OrderErrorKind = "out_of_stock" | "busy" | "generic";

const ERROR_COPY: Record<OrderErrorKind, { lines: string[]; retryLabel: string }> = {
  // 409 — createOrderGuarded rejected: stock ran out under load.
  out_of_stock: { lines: ["OUT OF", "STOCK"], retryLabel: "BACK TO CART" },
  // 503 — order_busy: Sheets quota / mutex queue, safe to retry.
  busy: { lines: ["SYSTEM", "BUSY"], retryLabel: "TRY AGAIN" },
  // anything else / network failure.
  generic: { lines: ["SOMETHING", "WENT WRONG"], retryLabel: "TRY AGAIN" },
};

/**
 * Full-screen overlay shown the instant CHECKOUT is confirmed, while the order
 * is saved + the PromptPay QR is created (can be a few seconds under load).
 *   - error === null → loading state (animated capsule progress + "// PLEASE WAIT")
 *   - error set      → error state with message + a retry button (onRetry)
 * Design mirrors ORDER CONFIRMED (ClosingOverlay) — same icon box, big mono
 * heading, warm gradient bar — so the two screens feel like one family.
 */
export function LoadingOverlay({
  error,
  onRetry,
}: {
  error: OrderErrorKind | null;
  onRetry: () => void;
}) {
  const isError = error !== null;
  const copy = isError ? ERROR_COPY[error] : null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: C.cream,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        animation: "fadeIn 300ms ease-out",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          textAlign: "center",
          padding: "0 44px",
          width: "100%",
          maxWidth: 360,
        }}
      >
        {/* icon box — checkmark while loading, error color on failure */}
        <div
          style={{
            width: 54,
            height: 54,
            border: `1.5px solid ${isError ? C.err : C.mist}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isError ? C.err : C.mist,
          }}
        >
          {isError ? (
            <span style={{ fontFamily: FM, fontSize: 26, lineHeight: 1, fontWeight: 700 }}>!</span>
          ) : (
            <CheckIcon size={24} />
          )}
        </div>

        {/* heading */}
        <div
          style={{
            fontFamily: FM,
            fontWeight: 700,
            fontSize: 22,
            lineHeight: 1.35,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: isError ? C.err : C.mist,
          }}
        >
          {isError ? (
            copy!.lines.map((l, i) => (
              <React.Fragment key={i}>
                {l}
                {i < copy!.lines.length - 1 && <br />}
              </React.Fragment>
            ))
          ) : (
            <>
              CREATING
              <br />
              YOUR ORDER
            </>
          )}
        </div>

        {!isError && (
          <>
            {/* capsule progress — fills left→right, loops to ~92% (not real %) */}
            <div
              style={{
                width: "100%",
                height: 6,
                background: C.light,
                borderRadius: 999,
                overflow: "hidden",
                marginTop: 4,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "0%",
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${WARM_STOPS})`,
                  animation: "fillTube 2.6s ease-out infinite",
                }}
              />
            </div>
            <div
              style={{
                fontFamily: FM,
                fontSize: 11,
                letterSpacing: "0.12em",
                color: C.gris,
                textTransform: "uppercase",
                animation: "blinkWait 1.4s ease-in-out infinite",
              }}
            >
              {"// PLEASE WAIT"}
            </div>
          </>
        )}

        {isError && (
          <button
            onClick={onRetry}
            style={{
              fontFamily: FM,
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: C.mist,
              background: "none",
              border: `1px solid ${C.mist}`,
              padding: "12px 26px",
              marginTop: 4,
              cursor: "pointer",
              borderRadius: 2,
            }}
          >
            {copy!.retryLabel}
          </button>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fillTube { 0% { width: 0% } 80% { width: 92% } 100% { width: 92% } }
        @keyframes blinkWait { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }
      `}</style>
    </div>
  );
}
