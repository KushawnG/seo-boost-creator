import { Hero } from "@/components/Hero";
import { Navigation } from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music, Zap, Clock, Lock } from "lucide-react";
import { Link } from "react-router-dom";

const Index = () => {
  return (
    <main className="relative">
      <Navigation />
      <Hero />
      
      {/* About Section */}
      <section id="about" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">About Chord Finder AI</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="p-6">
              <Music className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Accurate Detection</h3>
              <p className="text-gray-600">Advanced AI algorithms for precise chord recognition</p>
            </Card>
            <Card className="p-6">
              <Zap className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Lightning Fast</h3>
              <p className="text-gray-600">Get results in seconds, not minutes</p>
            </Card>
            <Card className="p-6">
              <Clock className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Real-Time Analysis</h3>
              <p className="text-gray-600">Instant feedback as you play or upload</p>
            </Card>
            <Card className="p-6">
              <Lock className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Secure Storage</h3>
              <p className="text-gray-600">Your music files are safe with us</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">Simple, Transparent Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="p-8">
              <h3 className="text-xl font-semibold mb-4">Free</h3>
              <div className="text-4xl font-bold mb-6">$0<span className="text-lg text-gray-500">/month</span></div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center">
                  <Zap className="h-5 w-5 text-primary mr-2" />
                  <span>5 songs per day</span>
                </li>
                <li className="flex items-center">
                  <Music className="h-5 w-5 text-primary mr-2" />
                  <span>Basic chord detection</span>
                </li>
              </ul>
              <Link to="/auth">
                <Button className="w-full">Get Started</Button>
              </Link>
            </Card>
            
            <Card className="p-8 border-primary">
              <h3 className="text-xl font-semibold mb-4">Pro</h3>
              <div className="text-4xl font-bold mb-6">$9<span className="text-lg text-gray-500">/month</span></div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center">
                  <Zap className="h-5 w-5 text-primary mr-2" />
                  <span>Unlimited songs</span>
                </li>
                <li className="flex items-center">
                  <Music className="h-5 w-5 text-primary mr-2" />
                  <span>Advanced chord detection</span>
                </li>
                <li className="flex items-center">
                  <Clock className="h-5 w-5 text-primary mr-2" />
                  <span>Priority processing</span>
                </li>
              </ul>
              <Link to="/auth">
                <Button className="w-full">Start Pro Trial</Button>
              </Link>
            </Card>
            
            <Card className="p-8">
              <h3 className="text-xl font-semibold mb-4">Enterprise</h3>
              <div className="text-4xl font-bold mb-6">Custom</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center">
                  <Zap className="h-5 w-5 text-primary mr-2" />
                  <span>Custom integration</span>
                </li>
                <li className="flex items-center">
                  <Music className="h-5 w-5 text-primary mr-2" />
                  <span>Dedicated support</span>
                </li>
                <li className="flex items-center">
                  <Lock className="h-5 w-5 text-primary mr-2" />
                  <span>SLA guarantee</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full">Contact Sales</Button>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Index;
