export const C = {
  cream: "#FFFFFF",
  light: "#E6E0DE",
  gris: "#696969",
  oliva: "#3A3A3A",
  mist: "#191919",
  negro: "#000",
  white: "#FFF",
  orange: "#C47237",
  sienna: "#7B412E",
  mustard: "#E8AC4B",
  err: "#C44A3A",
  dis: "#B8B0AD",
  bdr: "#D8D2CF",
  idle: "#D9D9D8",
};

// Warm button/progress gradient stops (ดำ → น้ำตาล → ส้ม → เหลือง).
// Shared so the loading progress bar matches the primary-button gradient.
export const WARM_STOPS =
  "#111111 0%, #111111 18%, #42272C 38%, #824E39 54%, #D28A3E 72%, #EDBA5F 88%, #F5D280 100%";

export const FM =
  '"Magda Clean Mono", ui-monospace, Menlo, Consolas, monospace';
export const FT =
  '"IBM Plex Sans Thai", "Magda Clean Mono", -apple-system, sans-serif';

export const fmt = (n: number) => "฿" + n.toLocaleString("en-US");
