import { memo } from "react";

type LegacySlotProps = {
  as?: "div" | "section";
  id: string;
  className?: string;
  ariaLive?: "off" | "polite" | "assertive";
};

export const LegacySlot = memo(function LegacySlot({
  as = "div",
  id,
  className,
  ariaLive,
}: LegacySlotProps) {
  const Tag = as;
  return <Tag id={id} className={className} aria-live={ariaLive}></Tag>;
});
