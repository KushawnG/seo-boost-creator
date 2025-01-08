import { Button } from "@/components/ui/button";
import { Music } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const Navigation = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-b z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <Music className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold">Chord Finder AI</span>
            </Link>
          </div>
          
          <div className="hidden md:flex items-center space-x-4">
            <Link to="/" className="text-gray-700 hover:text-gray-900 px-3 py-2">
              Home
            </Link>
            <Link to="/about" className="text-gray-700 hover:text-gray-900 px-3 py-2">
              About
            </Link>
            <Link to="/pricing" className="text-gray-700 hover:text-gray-900 px-3 py-2">
              Pricing
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={handleLogout}>
              Log Out
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};