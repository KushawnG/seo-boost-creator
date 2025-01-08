import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, List, User, CreditCard, Settings, LogOut } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const Dashboard = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("home");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();

    // Check for pending analysis
    const pendingUrl = localStorage.getItem('pendingAnalysis');
    const pendingFile = localStorage.getItem('pendingAnalysisFile');
    
    if (pendingUrl || pendingFile) {
      // Clear the pending analysis
      localStorage.removeItem('pendingAnalysis');
      localStorage.removeItem('pendingAnalysisFile');
      
      // Show toast notification
      toast({
        title: "Analysis Started",
        description: pendingUrl 
          ? `Analyzing URL: ${pendingUrl}` 
          : `Analyzing file: ${pendingFile}`,
      });
      
      // Here you would trigger the actual analysis
      console.log("Starting analysis for:", pendingUrl || pendingFile);
    }
  }, [navigate, toast]);

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
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
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
                <div className="space-y-4">
                  <Input placeholder="Enter YouTube URL..." className="w-full" />
                  <div className="text-center">OR</div>
                  <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                    <p className="text-gray-500">Click to upload an audio file</p>
                  </div>
                  <div className="flex justify-center">
                    <Button size="lg">Analyze</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex items-center gap-2">
                    <List size={20} />
                    Track History
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg mb-4">
                  <div>
                    <div className="font-semibold">Title</div>
                    <div>Example Title</div>
                  </div>
                  <div>
                    <div className="font-semibold">Key</div>
                    <div>A#m</div>
                  </div>
                  <div>
                    <div className="font-semibold">BPM</div>
                    <div>120</div>
                  </div>
                  <div>
                    <div className="font-semibold">Chords</div>
                    <div>A#m-E#m-G#m-C#m</div>
                  </div>
                </div>
              </CardContent>
            </Card>
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
          <div className="text-sm font-semibold text-gray-500 mb-4">ADMIN</div>
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
          <div>
            <h1 className="text-2xl font-bold">Hi {username || "User"}</h1>
          </div>
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