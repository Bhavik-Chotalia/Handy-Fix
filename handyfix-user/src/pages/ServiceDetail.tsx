import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Star, MapPin, Briefcase, CheckCircle2, ArrowLeft, User,
  SortAsc, Filter, ChevronRight, AlertCircle, Clock
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

type ServiceInfo = {
  id: string;
  name: string;
  description: string | null;
  base_price: number | null;
  duration_minutes: number | null;
  slug: string | null;
};

type Provider = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  experience_years: number | null;
  rating: number | null;
  total_reviews: number | null;
  total_jobs: number | null;
  is_verified: boolean | null;
  is_online: boolean | null;
  pincodes: string[] | null;
  service_ids: string[] | null;
};

type SortOption = "rating" | "price_asc" | "reviews";

const ServiceDetail = () => {
  const { serviceSlug } = useParams<{ serviceSlug: string }>();
  const [searchParams] = useSearchParams();
  const pincode = searchParams.get("pincode") || "";
  const navigate = useNavigate();
  const { user } = useAuth();

  const [service, setService] = useState<ServiceInfo | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("rating");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // Guard against undefined slug
      if (!serviceSlug || serviceSlug === "undefined" || serviceSlug === "null") {
        setError("Invalid service URL. Please go back and select a service.");
        setLoading(false);
        return;
      }

      try {
        // Step 1: Fetch service — try slug first, fall back to id
        // (fallback needed before SLUGS_MIGRATION.sql is run)
        let svcData: ServiceInfo | null = null;

        const { data: bySlug } = await supabase
          .from("services")
          .select("id, name, description, base_price, duration_minutes, slug")
          .eq("slug", serviceSlug)
          .maybeSingle();

        if (bySlug) {
          svcData = bySlug;
        } else {
          // Try by id (used when slugs haven't been seeded yet)
          const { data: byId } = await supabase
            .from("services")
            .select("id, name, description, base_price, duration_minutes, slug")
            .eq("id", serviceSlug)
            .maybeSingle();
          svcData = byId;
        }

        if (!svcData) {
          setError(`Service not found. Please go back and choose a service.`);
          setLoading(false);
          return;
        }
        setService(svcData);

        // Step 2: Fetch providers using service_ids array — THE CORRECT QUERY
        // Providers appear only if they:
        //   - Have this service in service_ids (they selected it in Profile)
        //   - Serve this pincode (they added it in Profile)
        //   - Are online right now
        //   - Have active status
        const query = (supabase as any)
          .from("service_providers")
          .select("id, full_name, bio, rating, total_reviews, total_jobs, experience_years, avatar_url, is_online, is_verified, pincodes, service_ids")
          .contains("service_ids", [svcData.id])   // provider selected this service
          .eq("is_online", true)
          .eq("status", "active");

        // Only filter by pincode if one was provided
        const finalQuery = pincode
          ? query.contains("pincodes", [pincode])
          : query;

        const { data: pvdData } = await finalQuery.order("rating", { ascending: false });

        setProviders(pvdData || []);
      } catch {
        setError("Something went wrong. Please try again.");
      }
      setLoading(false);
    };

    fetchData();
  }, [serviceSlug, pincode]);

  const sorted = [...providers]
    .filter((p) => !verifiedOnly || p.is_verified)
    .sort((a, b) => {
      if (sortBy === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      if (sortBy === "reviews") return (b.total_reviews ?? 0) - (a.total_reviews ?? 0);
      return 0;
    });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-20 bg-secondary/50 border-b border-border">
        <div className="container mx-auto py-3 flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <button onClick={() => navigate("/services?pincode=" + pincode)} className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Services
          </button>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground">{service?.name ?? serviceSlug}</span>
          {pincode && (
            <>
              <ChevronRight className="w-4 h-4" />
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-primary" />{pincode}</span>
            </>
          )}
        </div>
      </div>

      <div className="container mx-auto py-10 px-4">
        {service && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">{service.name}</h1>
            <p className="text-muted-foreground mb-4">{service.description}</p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="text-primary font-semibold">Starts from ₹{service.base_price}</span>
              {service.duration_minutes && (
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> ~{service.duration_minutes} min</span>
              )}
            </div>
          </motion.div>
        )}

        {/* Sort & filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-8 pb-6 border-b border-border">
          <div className="flex items-center gap-2">
            <SortAsc className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Sort:</span>
          </div>
          {[
            { value: "rating", label: "Top Rated" },
            { value: "reviews", label: "Most Reviews" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value as SortOption)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortBy === opt.value
                  ? "bg-gradient-gold text-primary-foreground shadow-gold"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <button
              onClick={() => setVerifiedOnly(!verifiedOnly)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                verifiedOnly
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              ✅ Verified Only
            </button>
          </div>
        </div>

        {!loading && !error && (
          <p className="text-sm text-muted-foreground mb-6">
            {sorted.length} professional{sorted.length !== 1 ? "s" : ""} found
            {pincode && ` in ${pincode}`}
          </p>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-6 animate-pulse">
                <div className="flex gap-4">
                  <div className="w-16 h-16 rounded-full bg-secondary flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-secondary rounded w-1/3" />
                    <div className="h-4 bg-secondary rounded w-1/2" />
                    <div className="h-3 bg-secondary rounded w-3/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-20">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <p className="text-foreground font-medium mb-2">{error}</p>
            <Button onClick={() => navigate(`/services?pincode=${pincode}`)} variant="outline" className="border-border mt-4">
              ← Back to Services
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && sorted.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
            <User className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No professionals available</h3>
            <p className="text-muted-foreground mb-2">
              {pincode
                ? `No ${service?.name} professionals are online in ${pincode} right now.`
                : `No ${service?.name} professionals are online right now.`}
            </p>
            <p className="text-sm text-muted-foreground mb-6">Try a nearby pincode or check back later.</p>
            <Button onClick={() => navigate(`/services?pincode=${pincode}`)} variant="outline" className="border-border">
              Browse other services
            </Button>
          </motion.div>
        )}

        {/* Provider cards */}
        {!loading && !error && sorted.length > 0 && (
          <div className="space-y-4">
            {sorted.map((provider, i) => (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="bg-card border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-gold transition-all duration-300"
              >
                <div className="flex flex-col md:flex-row gap-4">
                  <Avatar className="w-16 h-16 flex-shrink-0">
                    <AvatarFallback className="bg-gradient-gold text-primary-foreground text-xl font-bold">
                      {(provider.full_name || "P")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-foreground">{provider.full_name}</h3>
                      {provider.is_verified && (
                        <Badge className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Verified Pro
                        </Badge>
                      )}
                      <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
                        🟢 Online
                      </Badge>
                    </div>

                    {provider.bio && (
                      <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{provider.bio}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1 text-yellow-400">
                        <Star className="w-4 h-4 fill-current" />
                        <span className="font-semibold">{Number(provider.rating ?? 0).toFixed(1)}</span>
                        <span className="text-muted-foreground">({provider.total_reviews ?? 0} reviews)</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-4 h-4" />
                        {provider.total_jobs ?? 0} jobs
                      </span>
                      {provider.experience_years && (
                        <span>{provider.experience_years} yrs exp</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-start md:items-end justify-between gap-3">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">₹{service?.base_price}</p>
                      <p className="text-xs text-muted-foreground">per visit</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!user) {
                            navigate(`/auth?redirect=/book/${serviceSlug}/${provider.id}?pincode=${pincode}`);
                          } else {
                            navigate(`/book/${serviceSlug}/${provider.id}?pincode=${pincode}`);
                          }
                        }}
                        className="bg-gradient-gold text-primary-foreground font-semibold hover:opacity-90 shadow-gold"
                      >
                        Book Now
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default ServiceDetail;
