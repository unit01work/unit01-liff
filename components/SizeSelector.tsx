"use client";

import React from "react";
import { C, FM } from "@/lib/tokens";

interface SizeBtnProps {
  label: string;
  sel: boolean;
  dis: boolean;
  onClick: () => void;
}

export function SizeBtn({ label, sel, dis, onClick }: SizeBtnProps) {
  const arm = "7px",
    clr = dis ? C.dis : "#333333";
  const bg = sel
    ? { background: C.mist, color: C.cream, backgroundImage: "none" }
    : {
        backgroundImage: Array(8)
          .fill(`linear-gradient(${clr},${clr})`)
          .join(","),
        backgroundRepeat: "no-repeat",
        backgroundSize: `${arm} 1px,1px ${arm},${arm} 1px,1px ${arm},${arm} 1px,1px ${arm},${arm} 1px,1px ${arm}`,
        backgroundPosition:
          "top left,top left,top right,top right,bottom left,bottom left,bottom right,bottom right",
      };
  return (
    <button
      onClick={dis ? undefined : onClick}
      disabled={dis}
      style={{
        height: 28,
        border: "none",
        background: "transparent",
        color: dis ? C.dis : "#333333",
        fontFamily: FM,
        fontWeight: 700,
        fontSize: 10,
        lineHeight: "1.40",
        letterSpacing: "0.6px",
        textAlign: "center",
        padding: 0,
        cursor: dis ? "not-allowed" : "pointer",
        position: "relative",
        transition: "all 140ms ease",
        ...bg,
      }}
    >
      {label}
      {dis && !sel && (
        <span
          style={{
            position: "absolute",
            left: "15%",
            right: "15%",
            top: "50%",
            height: 1,
            background: C.gris,
            transform: "rotate(-20deg)",
          }}
        />
      )}
    </button>
  );
}
