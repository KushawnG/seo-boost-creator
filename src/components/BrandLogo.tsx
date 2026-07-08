import { cn } from "@/lib/utils";

/** The logo, swapping to the light-on-dark variant in dark mode. */
export const BrandLogo = ({ className }: { className?: string }) => (
  <>
    <img
      src="/Chord-Finder-Ai-Logo-Icon-Only.png"
      alt="Chord Finder AI"
      className={cn(className, "dark:hidden")}
    />
    <img
      src="/Chord-Finder-Ai-Logo-Dark.png"
      alt="Chord Finder AI"
      className={cn(className, "hidden dark:block")}
    />
  </>
);
