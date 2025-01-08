import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

interface UserSettingsProps {
  onLogout: () => void;
}

export const UserSettings = ({ onLogout }: UserSettingsProps) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Account</h3>
        <Button 
          variant="destructive" 
          onClick={onLogout}
          className="w-full sm:w-auto flex items-center gap-2"
        >
          <LogOut size={16} />
          Log Out
        </Button>
      </div>
    </div>
  );
};