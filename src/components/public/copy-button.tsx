"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Copies `value` to the clipboard, with a textarea fallback for old browsers. */
export function CopyButton({ value, label, ...props }: { value: string; label?: string } & Omit<ButtonProps, "onClick" | "value">) {
  const t = useTranslations("public.common");
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 2000);
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} {...props}>
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{done ? t("copied") : (label ?? t("copy"))}</span>
    </Button>
  );
}
