import React, { useEffect, useState, useCallback } from 'react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import BookingChat from '@/components/provider/BookingChat';
import { Phone, MapPin, Clock, Check, X, Play, CheckCircle, MessageCircle, Car, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

const sb = supabase as any; // new bridge columns not yet in generated types

const statusClasses: Record<string, string> = {
  pending: 'bg-warning/20 text-warning',
  confirmed: 'bg-primary/20 text-primary',
  in_progress: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-success/20 text-success',
  cancelled: 'bg-destructive/20 text-destructive',
};

const Bookings: React.FC = () => {
  const { provider } = useProvider();
  const { user } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<any[]>([]);
  const [tab, setTab] = useState('pending');
  const [activeChatBookingId, setActiveChatBookingId] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    if (!provider) return;
    const { data } = await sb
      .from('bookings')
      .select('*, services(name, icon, duration_minutes), profiles!bookings_user_id_fkey(display_name, phone)')
      .eq('provider_id', provider.id)
      .order('booking_date', { ascending: true });
    setBookings(data || []);
  }, [provider]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  useEffect(() => {
    if (!provider) return;
    const channel = supabase.channel('bookings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings',
          filter: `provider_id=eq.${provider.id}` }, () => fetchBookings())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [provider, fetchBookings]);

  const updateStatus = async (id: string, status: string, successMsg: string) => {
    const updateData: Record<string, any> = { status };
    if (status === 'in_progress') updateData.started_at = new Date().toISOString();
    if (status === 'completed') updateData.completed_at = new Date().toISOString();

    const { error } = await sb.from('bookings').update(updateData).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: successMsg });
      fetchBookings();

      if ((status === 'confirmed' || status === 'cancelled') && provider) {
        const { count: total } = await supabase
          .from('bookings').select('*', { count: 'exact', head: true }).eq('provider_id', provider.id);
        const { count: cancelled } = await supabase
          .from('bookings').select('*', { count: 'exact', head: true })
          .eq('provider_id', provider.id).eq('status', 'cancelled');
        const rate = total ? Math.round(((total - (cancelled || 0)) / total) * 100) : 100;
        await supabase.from('service_providers').update({ acceptance_rate: rate }).eq('id', provider.id);
      }
    }
  };

  const handleOnMyWay = async (bookingId: string) => {
    const etaMinutes = 20;
    const { error } = await sb.from('bookings').update({
      provider_departed_at: new Date().toISOString(),
      provider_eta_minutes: etaMinutes,
    }).eq('id', bookingId);

    if (!error) {
      toast({
        title: '🚗 Customer Notified!',
        description: `Customer told you'll arrive in ~${etaMinutes} mins.`,
      });
      fetchBookings();
    }
  };

  const filtered = bookings.filter(b => {
    if (tab === 'pending') return b.status === 'pending';
    if (tab === 'active') return ['confirmed', 'in_progress'].includes(b.status);
    if (tab === 'completed') return b.status === 'completed';
    if (tab === 'cancelled') return b.status === 'cancelled';
    return true;
  });

  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="pending" className="relative">
            Pending
            {pendingCount > 0 && (
              <span className="ml-1.5 bg-warning text-warning-foreground text-[9px] font-bold rounded-full px-1.5 py-0.5">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {filtered.length === 0 ? (
            <Card className="glass-card p-8 text-center text-muted-foreground">No {tab} bookings</Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((b, i) => {
                const unread = b.unread_messages_provider ?? 0;
                const ref = `#HF-${b.id.slice(0, 8).toUpperCase()}`;
                const canChat = ['confirmed', 'in_progress'].includes(b.status);
                const alreadyDeparted = !!b.provider_departed_at;
                const customerName = b.profiles?.display_name || b.customer_name || 'Customer';

                return (
                  <motion.div key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card className="glass-card p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold">{b.services?.name || 'Service'}</h4>
                          <p className="text-sm text-muted-foreground mt-0.5">{customerName}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{ref}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">₹{Number(b.total_amount || 0).toLocaleString()}</p>
                          <Badge className={statusClasses[b.status]} variant="secondary">
                            {b.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-3">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>
                            {new Date(b.booking_date).toLocaleDateString()}
                            {b.booking_time ? ` · ${b.booking_time.slice(0, 5)}` : ''}
                          </span>
                        </div>
                        {b.address && (
                          <a
                            href={`https://maps.google.com/?q=${encodeURIComponent(b.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 hover:text-primary transition-colors"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="truncate">{b.address}</span>
                          </a>
                        )}
                      </div>

                      {b.profiles?.phone && (
                        <a
                          href={`tel:${b.profiles.phone}`}
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-3"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Call Customer
                        </a>
                      )}

                      {b.notes && (
                        <p className="text-xs text-muted-foreground italic mb-3">"{b.notes}"</p>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          {b.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                className="gold-gradient text-primary-foreground font-semibold flex-1"
                                onClick={() => updateStatus(b.id, 'confirmed', 'Booking Accepted ✅')}
                              >
                                <Check className="h-4 w-4 mr-1" /> Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-destructive/50 text-destructive hover:bg-destructive/10 flex-1"
                                onClick={() => updateStatus(b.id, 'cancelled', 'Booking Declined')}
                              >
                                <X className="h-4 w-4 mr-1" /> Decline
                              </Button>
                            </>
                          )}

                          {b.status === 'confirmed' && (
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-foreground font-semibold flex-1"
                              onClick={() => updateStatus(b.id, 'in_progress', 'Job Started 🚀')}
                            >
                              <Play className="h-4 w-4 mr-1" /> Start Job
                            </Button>
                          )}

                          {b.status === 'in_progress' && (
                            <Button
                              size="sm"
                              className="bg-success hover:bg-success/90 text-success-foreground font-semibold flex-1"
                              onClick={() => updateStatus(b.id, 'completed', 'Job Completed! 💰')}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" /> Complete
                            </Button>
                          )}
                        </div>

                        {/* "I'm On My Way" button — shown for confirmed bookings */}
                        {b.status === 'confirmed' && (
                          <Button
                            size="sm"
                            className={cn(
                              "w-full font-semibold rounded-xl",
                              alreadyDeparted
                                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30 cursor-default"
                                : "bg-blue-500 hover:bg-blue-600 text-white"
                            )}
                            onClick={() => !alreadyDeparted && handleOnMyWay(b.id)}
                            disabled={alreadyDeparted}
                          >
                            <Car className="h-4 w-4 mr-1.5" />
                            {alreadyDeparted ? "Customer Notified ✓" : "I'm On My Way"}
                          </Button>
                        )}

                        {/* Chat with customer button */}
                        {canChat && user && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                              "w-full border-primary/30 text-primary hover:bg-primary/10 rounded-xl relative",
                              unread > 0 && "border-primary bg-primary/10"
                            )}
                            onClick={() => setActiveChatBookingId(b.id)}
                          >
                            <MessageCircle className="h-4 w-4 mr-1.5" />
                            Chat with Customer
                            {unread > 0 && (
                              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                                {unread}
                              </span>
                            )}
                          </Button>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Chat Dialog */}
      {activeChatBookingId && user && (
        <Dialog open={!!activeChatBookingId} onOpenChange={() => setActiveChatBookingId(null)}>
          <DialogContent className="bg-card border-border p-0 max-w-md">
            <DialogHeader className="p-4 pb-0 border-b border-border">
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Chat with Customer
              </DialogTitle>
            </DialogHeader>
            <BookingChat
              bookingId={activeChatBookingId}
              currentUserId={user.id}
              senderType="provider"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Bookings;
