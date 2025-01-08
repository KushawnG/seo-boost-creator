import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

      {/* Delete Account section moved to bottom with more spacing */}
      <div className="flex justify-center mt-24">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="outline" 
              className="bg-white text-[#1A1F2C] hover:bg-gray-50 text-sm px-6"
            >
              Delete Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your
                account and remove your data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Delete Account</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};