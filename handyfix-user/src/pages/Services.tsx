import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Clock, ChevronRight, Wrench, Zap, Sparkles, PaintBucket, Wind, Hammer, Bug, Thermometer, Settings, Scissors, Search } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";

type Service = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_name: string | null;
  base_price: number | null;
  duration_minutes: number | null;
  category: string | null;
  is_active: boolean | null;
};

const iconMap: Record<string, React.ReactNode> = {
  Wrench: <Wrench className="w-6 h-6" />,
  Zap: <Zap className="w-6 h-6" />,
  Sparkles: <Sparkles className="w-6 h-6" />,
  PaintBucket: <PaintBucket className="w-6 h-6" />,
  Wind: <Wind className="w-6 h-6" />,
  Hammer: <Hammer className="w-6 h-6" />,
  Bug: <Bug className="w-6 h-6" />,
  Thermometer: <Thermometer className="w-6 h-6" />,
  Settings: <Settings className="w-6 h-6" />,
  Scissors: <Scissors className="w-6 h-6" />,
};

const categories = [
  { value: "all", label: "All Services" },
  { value: "home", label: "Home" },
  { value: "appliance", label: "Appliance" },
  { value: "beauty", label: "Beauty" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const Services = () => {
  const [searchParams] = useSearchParams();
  const pincode = searchParams.get("pincode") || "";
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("services")
      .select("*")
      .eq("is_active", true)
      .then(({ data }) => {
        setServices((data as Service[]) || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Pincode banner */}
      <div className="pt-20 bg-secondary/50 border-b border-border">
        <div className="container mx-auto py-3 flex items-center gap-3 flex-wrap">
          <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
          {pincode ? (
            <span className="text-sm text-muted-foreground">
              Showing services for{" "}
              <span className="text-foreground font-semibold">{pincode}</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">All services (no pincode selected)</span>
          )}
          <button
            onClick={() => navigate("/")}
            className="text-primary text-sm hover:underline flex items-center gap-1"
          >
            <Search className="w-3 h-3" /> Change pincode
          </button>
        </div>
      </div>

      <div className="container mx-auto py-10 px-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Available Services</h1>
          <p className="text-muted-foreground">Choose a service to find verified professionals near you</p>
        </motion.div>

        <Tabs defaultValue="all">
          <div className="flex justify-center mb-8">
            <TabsList className="bg-secondary p-1">
              {categories.map((cat) => (
                <TabsTrigger
                  key={cat.value}
                  value={cat.value}
                  className="capitalize data-[state=active]:bg-gradient-gold data-[state=active]:text-primary-foreground"
                >
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {categories.map((cat) => (
            <TabsContent key={cat.value} value={cat.value}>
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="skeleton"
                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
                  >
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="bg-card border border-border rounded-2xl p-5 animate-pulse"
                      >
                        <div className="w-12 h-12 rounded-xl bg-secondary mb-4" />
                        <div className="h-4 bg-secondary rounded mb-2" />
                        <div className="h-3 bg-secondary rounded mb-3 w-3/4" />
                        <div className="h-4 bg-secondary rounded w-1/2" />
                      </div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key={cat.value}
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
                  >
                    {services
                      .filter((s) => cat.value === "all" || s.category === cat.value)
                      .map((service) => (
                        <motion.div
                          key={service.id}
                          variants={cardVariants}
                          onClick={() =>
                            navigate(`/services/${service.slug ?? service.id}?pincode=${pincode}`)
                          }
                          className="bg-card border border-border rounded-2xl p-5 cursor-pointer hover:border-primary/50 hover:shadow-gold hover:-translate-y-1 transition-all duration-300 group"
                        >
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors text-primary">
                            {service.icon_name && iconMap[service.icon_name]
                              ? iconMap[service.icon_name]
                              : <Wrench className="w-6 h-6" />}
                          </div>
                          <h3 className="font-semibold text-foreground mb-1">{service.name}</h3>
                          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                            {service.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <p className="text-primary font-bold text-sm">
                              From ₹{service.base_price}
                            </p>
                            {service.duration_minutes && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {service.duration_minutes}m
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-3 text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            View providers <ChevronRight className="w-3 h-3" />
                          </div>
                        </motion.div>
                      ))}
                    {services.filter((s) => cat.value === "all" || s.category === cat.value).length === 0 && (
                      <div className="col-span-full text-center py-16 text-muted-foreground">
                        <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-medium">No services in this category yet</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>
          ))}
        </Tabs>

        {/* Popular CTA */}
        {!loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-16 bg-card border border-border rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6"
          >
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Can't find what you need?</h2>
              <p className="text-muted-foreground">
                Our team can connect you with the right professional for any job.
              </p>
            </div>
            <Button
              className="bg-gradient-gold text-primary-foreground font-bold px-8 py-3 rounded-xl shadow-gold hover:opacity-90 transition-opacity flex-shrink-0"
              onClick={() => navigate("/")}
            >
              Contact Support
            </Button>
          </motion.div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Services;
