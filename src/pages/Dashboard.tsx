import { Card, CardContent } from "@/components/ui/card";
import { AnalysisForm } from "@/components/dashboard/AnalysisForm";
import { AnalysisList } from "@/components/dashboard/AnalysisList";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Home, List, User, CreditCard, Settings, LogOut } from "lucide-react";
import { useState } from "react";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("home");

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
  };

  const renderContent = () => {
    switch (activeTab) {
      case "settings":
        return (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Account</h3>
                <Button 
                  variant="destructive" 
                  onClick={handleLogout}
                  className="w-full sm:w-auto flex items-center gap-2"
                >
                  <LogOut size={16} />
                  Log Out
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      default:
        return (
          <>
            <Card className="mb-8">
              <CardContent className="p-6">
                <AnalysisForm />
              </CardContent>
            </Card>

            <AnalysisList />
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-white border-r p-4">
        <div className="flex items-center gap-2 mb-8">
          <div className="text-xl font-bold">Chord Finder AI</div>
        </div>
        
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-500 mb-4">MENU</div>
          <Button 
            variant={activeTab === "home" ? "default" : "ghost"} 
            className="w-full justify-start gap-2"
            onClick={() => setActiveTab("home")}
          >
            <Home size={20} />
            Home
          </Button>
          <Button 
            variant={activeTab === "history" ? "default" : "ghost"} 
            className="w-full justify-start gap-2"
            onClick={() => setActiveTab("history")}
          >
            <List size={20} />
            Track History
          </Button>
          <Button 
            variant={activeTab === "membership" ? "default" : "ghost"} 
            className="w-full justify-start gap-2"
            onClick={() => setActiveTab("membership")}
          >
            <User size={20} />
            Manage Membership
          </Button>
          <Button 
            variant={activeTab === "billing" ? "default" : "ghost"} 
            className="w-full justify-start gap-2"
            onClick={() => setActiveTab("billing")}
          >
            <CreditCard size={20} />
            Billing
          </Button>
          <Button 
            variant={activeTab === "settings" ? "default" : "ghost"} 
            className="w-full justify-start gap-2"
            onClick={() => setActiveTab("settings")}
          >
            <Settings size={20} />
            Settings
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <div>Credits: <span className="font-semibold">5</span> Remaining</div>
            <Button>Free Plan</Button>
          </div>
        </div>

        {renderContent()}
      </div>
    </div>
  );
};

export default Dashboard;