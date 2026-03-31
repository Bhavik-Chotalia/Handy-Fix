import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Star, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useApp } from "@/contexts/AppContext";
import heroImg from "@/assets/hero-handyman.jpg";

const HeroSection = () => {
  const { pincode, setPincode } = useApp();
  const [localPincode, setLocalPincode] = useState(pincode);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleGo = () => {
    const trimmed = localPincode.trim();
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      toast({ title: "Invalid pincode", description: "Please enter a valid 6-digit pincode.", variant: "destructive" });
      return;
    }
    setPincode(trimmed);
    navigate(`/services?pincode=${trimmed}`);
  };

  return (
    <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
      <div className="container mx-auto grid md:grid-cols-2 gap-12 items-center">
        <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <p className="text-sm font-semibold text-primary tracking-wide uppercase mb-4">#1 Home Services Marketplace</p>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6">
            Your Home,{" "}
            <span className="text-gradient-gold">Fixed Fast.</span>
            <br />
            <span className="text-gradient-gold">Guaranteed.</span>
          </h1>
          <p className="text-muted-foreground text-lg mb-8 max-w-lg">
            Book verified professionals for any home service. From plumbing to painting — done right, on time, every time.
          </p>

          <div className="flex items-center gap-2 bg-secondary rounded-xl p-2 mb-4 max-w-lg border border-border focus-within:border-primary/50 transition-colors">
            <MapPin className="w-5 h-5 text-muted-foreground ml-3 flex-shrink-0" />
            <input
              type="text"
              placeholder="Enter your pincode (e.g. 380001)"
              maxLength={6}
              value={localPincode}
              onChange={(e) => setLocalPincode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && handleGo()}
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none py-3 px-2 text-sm"
            />
            <Button onClick={handleGo} className="bg-gradient-gold text-primary-foreground font-bold px-6 rounded-lg hover:opacity-90 transition-opacity">
              Go
            </Button>
          </div>

          <div className="flex items-center gap-6 mt-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Shield className="w-4 h-4 text-primary" /> Verified Pros</span>
            <span className="flex items-center gap-1"><Star className="w-4 h-4 text-primary" /> 4.9 Avg Rating</span>
            <span className="flex items-center gap-1 text-primary font-medium">50,000+ bookings</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }} className="relative hidden md:block">
          <div className="relative rounded-2xl overflow-hidden glow-gold">
            <img src={heroImg} alt="Professional handyman at work" width={800} height={800} className="w-full h-auto object-cover rounded-2xl" />
            <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
                <Star className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">4.9 Rating</p>
                <p className="text-xs text-muted-foreground">25,000+ reviews</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
