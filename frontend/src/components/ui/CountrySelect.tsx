import { Check, ChevronDown, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COUNTRIES } from "../../lib/countries";
import { cn } from "../../lib/utils";
import type { CountryCode } from "../../types";

export function CountrySelect({
  value,
  onChange,
  error,
  id = "country",
}: {
  value: CountryCode | "";
  onChange: (code: CountryCode) => void;
  error?: string | null;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = COUNTRIES.find((c) => c.code === value);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="w-full" ref={ref}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-300">
        Country
      </label>
      <div className="relative">
        <button
          id={id}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex h-11 w-full items-center gap-2.5 rounded-xl border bg-navy-900/80 pl-3.5 pr-10 text-left text-sm transition-colors",
            "focus:border-bullish/60 focus:bg-navy-900",
            error ? "border-bearish/60" : "border-line",
            selected ? "text-white" : "text-slate-500"
          )}
        >
          <span className="text-base leading-none">
            {selected ? selected.flag : <Globe className="h-4 w-4 text-slate-500" />}
          </span>
          <span className="truncate">
            {selected ? selected.name : "Select your country"}
          </span>
          <ChevronDown
            className={cn(
              "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1.5 w-full animate-fade-in overflow-hidden rounded-xl border border-line bg-navy-800 p-1 shadow-card"
          >
            {COUNTRIES.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === c.code}
                  onClick={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    value === c.code
                      ? "bg-bullish/12 text-white"
                      : "text-slate-300 hover:bg-white/5"
                  )}
                >
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="flex-1">{c.name}</span>
                  {value === c.code && <Check className="h-4 w-4 text-bullish" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-bearish">{error}</p>}
    </div>
  );
}
