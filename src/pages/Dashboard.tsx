import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Home, List, User, CreditCard, Settings, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { UserSettings } from "@/components/dashboard/UserSettings";
import { HomeTab } from "@/components/dashboard/tabs/HomeTab";
import { TrackHistoryTab } from "@/components/dashboard/tabs/TrackHistoryTab";
import { MembershipTab } from "@/components/dashboard/tabs/MembershipTab";
import { BillingTab } from "@/components/dashboard/tabs/BillingTab";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("home");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
      case "history":
        return <TrackHistoryTab />;
      case "membership":
        return <MembershipTab />;
      case "billing":
        return <BillingTab />;
      case "settings":
        return (
          <Card>
            <CardContent className="p-6">
              <UserSettings onLogout={handleLogout} />
            </CardContent>
          </Card>
        );
      default:
        return <HomeTab />;
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-full w-64 bg-white border-r p-4 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 z-30`}>
        <div className="flex items-center gap-2 mb-8">
          <img 
            src="/Chord-Finder-Ai-Logo-Icon-Only.png" 
            alt="Chord Finder AI" 
            className="h-8 w-8"
          />
          <div className="text-xl font-bold">Chord Finder AI</div>
        </div>
        
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-500 mb-4">MENU</div>
          <Button 
            variant={activeTab === "home" ? "default" : "ghost"} 
            className="w-full justify-start gap-2"
            onClick={() => {
              setActiveTab("home");
              setIsSidebarOpen(false);
            }}
          >
            <Home size={20} />
            Home
          </Button>
          <Button 
            variant={activeTab === "history" ? "default" : "ghost"} 
            className="w-full justify-start gap-2"
            onClick={() => {
              setActiveTab("history");
              setIsSidebarOpen(false);
            }}
          >
            <List size={20} />
            Track History
          </Button>
          <Button 
            variant={activeTab === "membership" ? "default" : "ghost"} 
            className="w-full justify-start gap-2"
            onClick={() => {
              setActiveTab("membership");
              setIsSidebarOpen(false);
            }}
          >
            <User size={20} />
            Manage Membership
          </Button>
          <Button 
            variant={activeTab === "billing" ? "default" : "ghost"} 
            className="w-full justify-start gap-2"
            onClick={() => {
              setActiveTab("billing");
              setIsSidebarOpen(false);
            }}
          >
            <CreditCard size={20} />
            Billing
          </Button>
          <Button 
            variant={activeTab === "settings" ? "default" : "ghost"} 
            className="w-full justify-start gap-2"
            onClick={() => {
              setActiveTab("settings");
              setIsSidebarOpen(false);
            }}
          >
            <Settings size={20} />
            Settings
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="md:ml-64 min-h-screen">
        {/* Mobile Header */}
        <div className="fixed top-0 left-0 right-0 h-16 bg-white border-b z-20 md:hidden">
          <div className="flex items-center justify-between px-4 h-full">
            <button
              onClick={toggleSidebar}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div className="text-lg font-semibold">Dashboard</div>
            <div className="w-10"></div> {/* Spacer for alignment */}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 md:p-8 mt-16 md:mt-0">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full md:w-auto">
              <div className="text-sm md:text-base">Credits: <span className="font-semibold">5</span> Remaining</div>
              <Button 
                onClick={() => setActiveTab("membership")}
                className="w-full md:w-auto"
              >
                Free Plan
              </Button>
            </div>
          </div>

          {renderContent()}
        </div>
      </div>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;