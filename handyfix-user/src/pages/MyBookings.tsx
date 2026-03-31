import { useEffect, useMemo, useState } from "react";
import { format, isFuture, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BookingChat from "@/components/BookingChat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getServiceIcon } from "@/lib/serviceIcons";
import {
  Star, Calendar, MapPin, Clock, User, XCircle, Package,
  ChevronRight, Loader2, MessageCircle, Car
} from "lucide-react";
import { cn } from "@/lib/utils";

type BookingRow = {
  id: string;
  status: string | null;
  booking_date: string;
  booking_time: string;
  address: string;
  city: string | null;
  total_amount: number | null;
  created_at: string | null;
  service_id: string | null;
  provider_id: string | null;
  provider_departed_at: string | null;
  provider_eta_minutes: number | null;
  unread_messages_customer: number | null;
  services: { name: string; icon_name: string | null } | null;
  service_providers: { name: string; avatar_url: string | null; rating: number | null; phone: string | null } | null;
};

const tabs = ["all", "upcoming", "completed", "cancelled"] as const;

const statusClassMap: Record<string, string> = {
  pending: "status-pending",
  confirmed: "status-confirmed",
  in_progress: "status-confirmed",
  completed: "status-completed",
  cancelled: "status-cancelled",
};

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={`w-8 h-8 transition-colors ${
              star <= (hovered || value)
                ? "text-yellow-400 fill-current"
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

const MyBookings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBooking, setReviewBooking] = useState<BookingRow | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [activeChatBookingId, setActiveChatBookingId] = useState<string | null>(null);

  const loadBookings = async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("bookings")
      .select(
        "id, status, booking_date, booking_time, address, city, total_amount, created_at, service_id, provider_id, provider_departed_at, provider_eta_minutes, unread_messages_customer, services(name, icon_name), service_providers(name, avatar_url, rating, phone)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setBookings((data ?? []) as BookingRow[]);
    setLoading(false);
  };

  useEffect(() => { loadBookings(); }, [user]);

  // Real-time subscription — provider status changes update LIVE
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("my-bookings-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as BookingRow;
          // Show contextual toast based on what changed
          if (updated.status === "confirmed") {
            toast({ title: "✅ Booking Confirmed!", description: "Your provider has accepted the booking." });
          } else if (updated.status === "in_progress") {
            toast({ title: "🚀 Pro Has Arrived!", description: "Your service is now in progress." });
          } else if (updated.status === "completed") {
            toast({ title: "✅ Service Completed!", description: "Please leave a review for your provider." });
          } else if (updated.status === "cancelled") {
            toast({ title: "Booking Cancelled", description: "Your booking was cancelled.", variant: "destructive" });
          }
          // Check for "on the way"
          if (updated.provider_departed_at && !bookings.find(b => b.id === updated.id)?.provider_departed_at) {
            toast({
              title: "🚗 Provider is on the way!",
              description: updated.provider_eta_minutes ? `ETA ~${updated.provider_eta_minutes} minutes` : "They're heading to you now.",
            });
          }
          loadBookings();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, bookings]);

  const grouped = useMemo(() => ({
    all: bookings,
    upcoming: bookings.filter((b) => {
      const s = b.status ?? "";
      return ["pending", "confirmed", "in_progress"].includes(s) && isFuture(parseISO(b.booking_date));
    }),
    completed: bookings.filter((b) => b.status === "completed"),
    cancelled: bookings.filter((b) => b.status === "cancelled"),
  }), [bookings]);

  const cancelBooking = async (bookingId: string) => {
    setCancellingId(bookingId);
    const { error } = await (supabase as any).from("bookings").update({
      status: "cancelled",
      cancellation_reason: "Cancelled by customer",
      cancelled_at: new Date().toISOString(),
    }).eq("id", bookingId);
    setCancellingId(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Booking cancelled", description: "Refund will be processed in 5–7 days." });
    loadBookings();
  };

  const submitReview = async () => {
    if (!user || !reviewBooking) return;
    setSubmittingReview(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const { error } = await supabase.from("reviews").insert({
      booking_id: reviewBooking.id,
      user_id: user.id,
      provider_id: reviewBooking.provider_id,
      service_id: reviewBooking.service_id,
      rating: reviewRating,
      comment: reviewComment,
      reviewer_name: profile?.display_name || user.email,
    });
    setSubmittingReview(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Review submitted! ⭐", description: "Thanks for your feedback." });
    setReviewOpen(false);
    setReviewComment("");
    setReviewRating(5);
    setReviewBooking(null);
  };

  const tabLabels: Record<string, string> = {
    all: "All",
    upcoming: "Upcoming",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto pt-28 pb-16 px-4"
      >
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Bookings</h1>
            <p className="text-muted-foreground mt-1">Manage and track all your service bookings</p>
          </div>
          <Button
            onClick={() => navigate("/services")}
            className="bg-gradient-gold text-primary-foreground font-semibold hover:opacity-90"
          >
            Book a Service
          </Button>
        </div>

        <Tabs defaultValue="all">
          <TabsList className="mb-6 bg-secondary p-1">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="capitalize relative data-[state=active]:bg-gradient-gold data-[state=active]:text-primary-foreground"
              >
                {tabLabels[tab]}
                {grouped[tab].length > 0 && (
                  <span className="ml-1.5 bg-primary/20 text-primary text-xs rounded-full px-1.5 py-0.5 font-bold">
                    {grouped[tab].length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent key={tab} value={tab}>
              <AnimatePresence mode="wait">
                {loading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse">
                        <div className="flex gap-4">
                          <div className="w-12 h-12 rounded-xl bg-secondary flex-shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-secondary rounded w-1/3" />
                            <div className="h-3 bg-secondary rounded w-1/2" />
                            <div className="h-3 bg-secondary rounded w-2/3" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : grouped[tab].length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-20 bg-card border border-border rounded-2xl"
                  >
                    <Package className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-foreground font-medium mb-2">No bookings here</p>
                    <p className="text-muted-foreground text-sm mb-6">
                      {tab === "all" ? "You haven't made any bookings yet." : `No ${tab} bookings found.`}
                    </p>
                    <Button
                      onClick={() => navigate("/services")}
                      className="bg-gradient-gold text-primary-foreground"
                    >
                      Explore Services
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                  >
                    {grouped[tab].map((booking, i) => {
                      const Icon = getServiceIcon(booking.services?.icon_name);
                      const status = booking.status ?? "pending";
                      const canCancel =
                        ["pending", "confirmed"].includes(status) &&
                        isFuture(parseISO(booking.booking_date));
                      const canChat = ["confirmed", "in_progress"].includes(status);
                      const unread = booking.unread_messages_customer ?? 0;
                      const ref = `#HF-${booking.id.slice(0, 8).toUpperCase()}`;

                      return (
                        <motion.div
                          key={booking.id}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="bg-card border border-border rounded-2xl p-5 hover:border-primary/20 transition-colors"
                        >
                          {/* "On the way" banner */}
                          {booking.provider_departed_at && status !== "completed" && status !== "cancelled" && (
                            <div className="mb-3 flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2.5">
                              <Car className="w-4 h-4 text-blue-400 flex-shrink-0" />
                              <span className="text-blue-300 text-sm font-medium">
                                Your provider is on the way!
                                {booking.provider_eta_minutes && ` ETA ~${booking.provider_eta_minutes} mins`}
                              </span>
                            </div>
                          )}

                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                            {/* Left — info */}
                            <div className="flex gap-4">
                              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Icon className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <p className="font-semibold text-foreground">{booking.services?.name}</p>
                                  <Badge className={statusClassMap[status] ?? "status-pending"}>
                                    {status.replace("_", " ")}
                                  </Badge>
                                </div>

                                <p className="text-xs text-muted-foreground font-mono mb-1">{ref}</p>

                                <div className="flex items-center gap-2 mb-2">
                                  <Avatar className="w-5 h-5">
                                    <AvatarFallback className="bg-gradient-gold text-primary-foreground text-[10px] font-bold">
                                      {(booking.service_providers?.name ?? "P")[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm text-muted-foreground">
                                    {booking.service_providers?.name}
                                  </span>
                                  {booking.service_providers?.rating && (
                                    <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                                      <Star className="w-3 h-3 fill-current" />
                                      {booking.service_providers.rating}
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {format(parseISO(booking.booking_date), "d MMM yyyy")}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {booking.booking_time.slice(0, 5)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {booking.address}, {booking.city}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Right — actions */}
                            <div className="flex flex-col items-start md:items-end gap-3">
                              {booking.total_amount && (
                                <p className="text-primary font-bold">₹{booking.total_amount}</p>
                              )}
                              <div className="flex flex-wrap gap-2">
                                {booking.provider_id && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-border"
                                    onClick={() => navigate(`/provider/${booking.provider_id}`)}
                                  >
                                    <User className="w-3 h-3 mr-1" /> Provider
                                  </Button>
                                )}
                                {/* Chat button */}
                                {canChat && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                      "border-primary/30 text-primary hover:bg-primary/10 relative",
                                      unread > 0 && "border-primary bg-primary/10"
                                    )}
                                    onClick={() => setActiveChatBookingId(booking.id)}
                                  >
                                    <MessageCircle className="w-3 h-3 mr-1" /> Chat
                                    {unread > 0 && (
                                      <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                        {unread}
                                      </span>
                                    )}
                                  </Button>
                                )}
                                {canCancel && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                                    onClick={() => cancelBooking(booking.id)}
                                    disabled={cancellingId === booking.id}
                                  >
                                    {cancellingId === booking.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    ) : (
                                      <XCircle className="w-3 h-3 mr-1" />
                                    )}
                                    Cancel
                                  </Button>
                                )}
                                {status === "completed" && (
                                  <Button
                                    size="sm"
                                    className="bg-gradient-gold text-primary-foreground font-semibold hover:opacity-90"
                                    onClick={() => {
                                      setReviewBooking(booking);
                                      setReviewRating(5);
                                      setReviewComment("");
                                      setReviewOpen(true);
                                    }}
                                  >
                                    <Star className="w-3 h-3 mr-1" /> Rate & Review
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>
          ))}
        </Tabs>
      </motion.main>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Rate your experience</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="text-center">
              <p className="text-muted-foreground text-sm mb-1">
                {reviewBooking?.services?.name} with {reviewBooking?.service_providers?.name}
              </p>
              <div className="flex justify-center mt-3">
                <StarPicker value={reviewRating} onChange={setReviewRating} />
              </div>
              <p className="text-muted-foreground text-xs mt-2">
                {["", "Poor", "Fair", "Good", "Great", "Excellent!"][reviewRating]}
              </p>
            </div>

            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Comment (optional)
              </label>
              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your experience..."
                className="bg-secondary border-border"
                rows={3}
              />
            </div>

            <Button
              onClick={submitReview}
              disabled={submittingReview}
              className="w-full bg-gradient-gold text-primary-foreground font-bold hover:opacity-90"
            >
              {submittingReview ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-2" />
              )}
              {submittingReview ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat Dialog */}
      {activeChatBookingId && user && (
        <Dialog open={!!activeChatBookingId} onOpenChange={() => setActiveChatBookingId(null)}>
          <DialogContent className="bg-card border-border p-0 max-w-md">
            <DialogHeader className="p-4 pb-0 border-b border-border">
              <DialogTitle className="text-foreground flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Chat with{" "}
                {bookings.find((b) => b.id === activeChatBookingId)?.service_providers?.name || "Provider"}
              </DialogTitle>
            </DialogHeader>
            <BookingChat
              bookingId={activeChatBookingId}
              currentUserId={user.id}
              senderType="customer"
            />
          </DialogContent>
        </Dialog>
      )}

      <Footer />
    </div>
  );
};

export default MyBookings;
