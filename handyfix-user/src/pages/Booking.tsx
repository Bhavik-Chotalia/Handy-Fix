import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { motion } from "framer-motion";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

type Service = Tables<"services">;
type Provider = Tables<"service_providers"> & {
  provider_services?: Array<{ custom_price: number | null }>;
};

const slots = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];

const Booking = () => {
  const { serviceSlug, providerId } = useParams();
  const [searchParams] = useSearchParams();
  const pincodeFromQuery = searchParams.get("pincode") ?? "";
  const subItemId = searchParams.get("sub_item") ?? null;
  const subItemName = searchParams.get("sub_name") ?? null;
  const subItemPrice = searchParams.get("sub_price") ? Number(searchParams.get("sub_price")) : null;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [service, setService] = useState<Service | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState(pincodeFromQuery);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      if (!serviceSlug || !providerId || !user) return;

      const [{ data: serviceData }, { data: providerData }, { data: profileData }] = await Promise.all([
        // Simple slug query only — no UUID fallback (avoids 22P02 uuid parse error)
        supabase.from("services")
          .select("*")
          .eq("slug", serviceSlug)
          .maybeSingle(),
        (supabase as any)
          .from("service_providers")
          .select("*")          // no !inner join — loads even without provider_services rows
          .eq("id", providerId)
          .maybeSingle(),
        supabase.from("profiles")
          .select("address, city, pincode, display_name, phone")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      setService(serviceData);
      setProvider(providerData as Provider | null);

      if (profileData) {
        setAddress(profileData.address ?? "");
        setCity(profileData.city ?? "");
        setPincode((previous) => previous || profileData.pincode || "");
      }
    };

    bootstrap();
  }, [serviceSlug, providerId, user]);

  const serviceCharge = useMemo(() => {
    if (subItemPrice) return subItemPrice;  // Use sub-item price if selected
    if (!service) return 0;
    return service.base_price ?? 0;
  }, [service, subItemPrice]);

  const platformFee = useMemo(() => Math.round(serviceCharge * 0.20), [serviceCharge]);
  const providerAmount = serviceCharge - platformFee;
  const totalAmount = serviceCharge + platformFee;

  const canGoStep2 = Boolean(selectedDate && selectedTime);
  const canGoStep3 = Boolean(address.trim() && city.trim() && /^\d{6}$/.test(pincode));

  const confirmBooking = async () => {
    if (!user || !service || !selectedDate || !selectedTime || !providerId) return;

    setSaving(true);

    try {
      // Fetch customer profile for name + phone
      const { data: profileData } = await supabase
        .from("profiles")
        .select("display_name, phone")
        .eq("id", user.id)
        .maybeSingle();

      const formattedDate = format(selectedDate, "yyyy-MM-dd");
      const formattedTime = `${selectedTime}:00`;
      const customerName = profileData?.display_name || user.email?.split("@")[0] || "Customer";

      const insertPayload: Record<string, unknown> = {
        customer_id:          user.id,
        provider_id:          providerId,
        service_id:           service.id,
        booking_date:         formattedDate,
        booking_time:         formattedTime,
        scheduled_date:       formattedDate,
        scheduled_time:       formattedTime,
        address,
        pincode,
        city,
        special_instructions: notes || null,
        description:          notes || null,
        total_amount:         serviceCharge,
        platform_fee:         platformFee,
        provider_amount:      providerAmount,
        status:               "pending",
        customer_name:        customerName,
        customer_phone:       profileData?.phone || null,
        sub_item_id:          subItemId || null,
        sub_item_name:        subItemName || null,
      };

      const { data: booking, error } = await (supabase as any)
        .from("bookings")
        .insert(insertPayload)
        .select("id")
        .single();

      if (error) {
        console.error("Booking insert error:", error);
        toast({
          title: "Booking failed",
          description: error.message,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      sessionStorage.setItem(
        "booking-toast",
        JSON.stringify({
          providerName: (provider as any)?.full_name ?? (provider as any)?.name ?? "Your Provider",
          dateTime: `${format(selectedDate, "d MMMM")}, ${selectedTime}`,
        }),
      );

      navigate(`/booking-confirmation/${booking.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("Booking error:", err);
      toast({ title: "Booking failed", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto pt-28 pb-16 px-4 max-w-3xl"
      >
        <h1 className="text-3xl font-bold mb-1">Book Service</h1>
        <p className="text-muted-foreground mb-8">
          {service?.name} · {(provider as any)?.full_name ?? (provider as any)?.name}
        </p>

        <div className="bg-card border border-border rounded-2xl p-5 md:p-8">
          {/* Step progress */}
          <div className="flex items-center gap-2 mb-8">
            {["Date & Time", "Address", "Review"].map((label, idx) => {
              const s = idx + 1;
              return (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                      s < step
                        ? "bg-green-500 text-white"
                        : s === step
                        ? "bg-primary text-primary-foreground shadow-gold"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {s < step ? "✓" : s}
                  </div>
                  <span className={`text-xs hidden sm:block ${s === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                  {s < 3 && <div className={`h-px flex-1 ${s < step ? "bg-green-500/40" : "bg-border"}`} />}
                </div>
              );
            })}
          </div>

          {step === 1 && (
            <div className="grid md:grid-cols-[auto,1fr] gap-8">
              <div>
                <h2 className="text-xl font-semibold mb-3">Select Date</h2>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date() || date > addDays(new Date(), 7)}
                  className="rounded-xl border border-border bg-secondary"
                />
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">Select Time Slot</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedTime(slot)}
                      className={`rounded-xl border px-4 py-3 text-sm transition ${
                        selectedTime === slot
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-secondary hover:border-primary/50"
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-3">Address Details</h2>
              <div>
                <label className="text-sm text-muted-foreground">Full Address</label>
                <Textarea value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 bg-secondary" />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Pincode</label>
                  <Input
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="mt-1 bg-secondary"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">City</label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 bg-secondary" />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Special Instructions (optional)</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 bg-secondary" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-3">Review & Confirm</h2>
              <div className="bg-secondary rounded-xl p-4 space-y-2 text-sm">
                <p>
                  Service: <span className="text-foreground font-medium">{service?.name}</span>
                </p>
                {subItemName && (
                  <p>
                    Sub-service: <span className="text-foreground font-medium">{subItemName}</span>
                  </p>
                )}
                <p>
                  Provider: <span className="text-foreground font-medium">{(provider as any)?.full_name ?? (provider as any)?.name}</span>
                </p>
                <p>
                  Date: <span className="text-foreground font-medium">{selectedDate ? format(selectedDate, "EEEE, d MMMM yyyy") : "-"}</span>
                </p>
                <p>
                  Time: <span className="text-foreground font-medium">{selectedTime}</span>
                </p>
                <p>
                  Address: <span className="text-foreground font-medium">{address}, {city} - {pincode}</span>
                </p>
              </div>

              <div className="bg-secondary rounded-xl p-4 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Service Charge</span>
                  <span className="text-foreground">₹{serviceCharge}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">Platform Fee</span>
                  <span className="text-foreground">₹{platformFee}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between font-bold text-primary text-base">
                  <span>Total</span>
                  <span>₹{totalAmount}</span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex gap-3">
            {step > 1 && (
              <Button
                variant="outline"
                className="border-border flex-shrink-0"
                onClick={() => setStep((value) => value - 1)}
              >
                ← Back
              </Button>
            )}

            {step === 1 && (
              <Button
                className="bg-gradient-gold text-primary-foreground font-bold flex-1 py-6 rounded-xl shadow-gold hover:opacity-90"
                disabled={!canGoStep2}
                onClick={() => setStep(2)}
              >
                Continue to Address →
              </Button>
            )}

            {step === 2 && (
              <Button
                className="bg-gradient-gold text-primary-foreground font-bold flex-1 py-6 rounded-xl shadow-gold hover:opacity-90"
                disabled={!canGoStep3}
                onClick={() => setStep(3)}
              >
                Review Booking →
              </Button>
            )}

            {step === 3 && (
              <Button
                className="bg-gradient-gold text-primary-foreground font-bold flex-1 py-6 rounded-xl shadow-gold hover:opacity-90"
                disabled={saving}
                onClick={confirmBooking}
              >
                {saving ? "Confirming..." : `Confirm Booking · ₹${totalAmount}`}
              </Button>
            )}
          </div>
        </div>
      </motion.main>
      <Footer />
    </div>
  );
};

export default Booking;
