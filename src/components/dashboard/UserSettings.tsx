import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

interface UserSettingsProps {
  onLogout: () => void;
}

export const UserSettings = ({ onLogout }: UserSettingsProps) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>
      <div className="space-y-4">
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={onLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};