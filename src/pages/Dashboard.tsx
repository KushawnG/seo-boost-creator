import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, List, User, CreditCard, Settings } from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-white border-r p-4">
        <div className="flex items-center gap-2 mb-8">
          <div className="text-xl font-bold">Chord Finder AI</div>
        </div>
        
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-500 mb-4">ADMIN</div>
          <Button variant="ghost" className="w-full justify-start gap-2">
            <Home size={20} />
            Home
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2">
            <List size={20} />
            Track History
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2">
            <User size={20} />
            Manage Membership
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2">
            <CreditCard size={20} />
            Billing
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2">
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
      </div>
    </div>
  );
};

export default Dashboard;