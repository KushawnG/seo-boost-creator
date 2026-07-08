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
      <section id="about" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">About Chord Finder AI</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="p-6">
              <Music className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Accurate Detection</h3>
              <p className="text-muted-foreground">Advanced AI algorithms for precise chord recognition, key detection, and BPM analysis</p>
            </Card>
            <Card className="p-6">
              <Zap className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Lightning Fast</h3>
              <p className="text-muted-foreground">Real-time analysis with results in seconds, not minutes</p>
            </Card>
            <Card className="p-6">
              <Clock className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Beat-Synced Chords</h3>
              <p className="text-muted-foreground">Follow the chord changes in real time as the song plays</p>
            </Card>
            <Card className="p-6">
              <Lock className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Secure Storage</h3>
              <p className="text-muted-foreground">Your music files are safe with us</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-muted/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">Simple, Transparent Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="p-8">
              <h3 className="text-xl font-semibold mb-4">Free</h3>
              <div className="text-4xl font-bold mb-6">$0<span className="text-lg text-muted-foreground">/month</span></div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center">
                  <Music className="h-5 w-5 text-primary mr-2" />
                  <span>3 song analyses per month</span>
                </li>
                <li className="flex items-center">
                  <Clock className="h-5 w-5 text-primary mr-2" />
                  <span>Songs up to 5 minutes</span>
                </li>
                <li className="flex items-center">
                  <Zap className="h-5 w-5 text-primary mr-2" />
                  <span>Chords, key &amp; BPM detection</span>
                </li>
                <li className="flex items-center">
                  <Music className="h-5 w-5 text-primary mr-2" />
                  <span>Beat-synced chord player</span>
                </li>
                <li className="flex items-center">
                  <Clock className="h-5 w-5 text-primary mr-2" />
                  <span>Last 5 analyses saved</span>
                </li>
                <li className="flex items-center text-muted-foreground">
                  <span>Renews monthly for free</span>
                </li>
              </ul>
              <Link to="/auth">
                <Button className="w-full">Get Started</Button>
              </Link>
            </Card>
            
            <Card className="p-8 border-primary">
              <h3 className="text-xl font-semibold mb-4">Pro</h3>
              <div className="text-4xl font-bold mb-6">$12<span className="text-lg text-muted-foreground">/month</span></div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center">
                  <Music className="h-5 w-5 text-primary mr-2" />
                  <span>15 song analyses per month</span>
                </li>
                <li className="flex items-center">
                  <Clock className="h-5 w-5 text-primary mr-2" />
                  <span>Songs up to 5 minutes</span>
                </li>
                <li className="flex items-center">
                  <Zap className="h-5 w-5 text-primary mr-2" />
                  <span>Chords, key &amp; BPM detection</span>
                </li>
                <li className="flex items-center">
                  <Music className="h-5 w-5 text-primary mr-2" />
                  <span>Beat-synced chord player</span>
                </li>
                <li className="flex items-center">
                  <Zap className="h-5 w-5 text-primary mr-2" />
                  <span>Guitar &amp; piano chord diagrams</span>
                </li>
                <li className="flex items-center">
                  <Clock className="h-5 w-5 text-primary mr-2" />
                  <span>Unlimited song history</span>
                </li>
                <li className="flex items-center text-muted-foreground">
                  <span>Cancel or change plan anytime</span>
                </li>
              </ul>
              <Link to="/auth">
                <Button className="w-full">Subscribe to Pro</Button>
              </Link>
            </Card>
            
            <Card className="p-8">
              <h3 className="text-xl font-semibold mb-4">Premium</h3>
              <div className="text-4xl font-bold mb-6">$29<span className="text-lg text-muted-foreground">/month</span></div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center">
                  <Music className="h-5 w-5 text-primary mr-2" />
                  <span>40 song analyses per month</span>
                </li>
                <li className="flex items-center">
                  <Clock className="h-5 w-5 text-primary mr-2" />
                  <span>Songs up to 5 minutes</span>
                </li>
                <li className="flex items-center">
                  <Zap className="h-5 w-5 text-primary mr-2" />
                  <span>Chords, key &amp; BPM detection</span>
                </li>
                <li className="flex items-center">
                  <Music className="h-5 w-5 text-primary mr-2" />
                  <span>Beat-synced chord player</span>
                </li>
                <li className="flex items-center">
                  <Zap className="h-5 w-5 text-primary mr-2" />
                  <span>Guitar &amp; piano chord diagrams</span>
                </li>
                <li className="flex items-center">
                  <Clock className="h-5 w-5 text-primary mr-2" />
                  <span>Unlimited song history</span>
                </li>
                <li className="flex items-center text-muted-foreground">
                  <span>Cancel or change plan anytime</span>
                </li>
              </ul>
              <Link to="/auth">
                <Button variant="outline" className="w-full">Subscribe to Premium</Button>
              </Link>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Index;