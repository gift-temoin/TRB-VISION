import type { CountryCode } from "../types";

export interface CountryOption {
  code: CountryCode;
  name: string;
  flag: string;
}

// Keep in sync with backend/app/countries.py — the server validates the value.
export const COUNTRIES: CountryOption[] = [
  { code: "RW", name: "Rwanda", flag: "\u{1F1F7}\u{1F1FC}" },
  { code: "BI", name: "Burundi", flag: "\u{1F1E7}\u{1F1EE}" },
  { code: "UG", name: "Uganda", flag: "\u{1F1FA}\u{1F1EC}" },
  { code: "TZ", name: "Tanzania", flag: "\u{1F1F9}\u{1F1FF}" },
  { code: "KE", name: "Kenya", flag: "\u{1F1F0}\u{1F1EA}" },
];

export function countryFlag(code: string | null | undefined): string {
  const found = COUNTRIES.find((c) => c.code === code);
  if (found) return found.flag;
  const code2 = (code ?? "").toUpperCase();
  if (code2.length !== 2 || !/^[A-Z]{2}$/.test(code2)) return "";
  return String.fromCodePoint(
    ...[...code2].map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 65))
  );
}

export function countryName(code: string | null | undefined): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? "";
}
