"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Returns a copy of `list` with item `index` moved by `delta` (−1 up, +1 down). */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

/** Up/down buttons for ordered lists. */
export function OrderButtons({
  index,
  count,
  onMove,
  disabled,
  label,
}: {
  index: number;
  count: number;
  onMove: (delta: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const t = useTranslations("cms.site");
  return (
    <div className="flex flex-col">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-6"
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
        aria-label={t("moveUp", { name: label })}
        title={t("moveUp", { name: label })}
      >
        <ArrowUp aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-6"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
        aria-label={t("moveDown", { name: label })}
        title={t("moveDown", { name: label })}
      >
        <ArrowDown aria-hidden />
      </Button>
    </div>
  );
}
