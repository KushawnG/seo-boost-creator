import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  withLabel?: boolean;
}

export const ThemeToggle = ({ className, withLabel = false }: ThemeToggleProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size={withLabel ? "default" : "icon"}
      className={cn(withLabel && "justify-start gap-2", className)}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
      {withLabel && <span>{isDark ? "Light mode" : "Dark mode"}</span>}
    </Button>
  );
};
