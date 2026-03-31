import React, { useEffect, useState } from 'react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { Save, Plus, X, Loader2, Building2, CreditCard, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';

// Emoji map for service display
const SERVICE_ICONS: Record<string, string> = {
  'Plumbing': '🔧', 'Electrical': '⚡', 'House Cleaning': '🧹',
  'Painting': '🖌️', 'AC Service': '❄️', 'Carpentry': '🪚',
  'Pest Control': '🐛', 'Appliance Repair': '⚙️', 'Home Salon': '💇', 'HVAC': '🌡️',
};

const Profile: React.FC = () => {
  const { provider, refreshProvider } = useProvider();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [newPincode, setNewPincode] = useState('');
  const [allServices, setAllServices] = useState<any[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', bio: '', experience_years: 0,
    bank_account_name: '', bank_account_number: '', bank_ifsc: '', upi_id: '',
  });

  // Load all available services from DB
  useEffect(() => {
    supabase
      .from('services')
      .select('id, name, base_price, category')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => { if (data) setAllServices(data); });
  }, []);

  // Sync form + selected services when provider loads
  useEffect(() => {
    if (provider) {
      setForm({
        full_name: provider.full_name || '',
        phone: provider.phone || '',
        email: provider.email || '',
        bio: provider.bio || '',
        experience_years: provider.experience_years || 0,
        bank_account_name: provider.bank_account_name || '',
        bank_account_number: provider.bank_account_number || '',
        bank_ifsc: provider.bank_ifsc || '',
        upi_id: provider.upi_id || '',
      });
      setSelectedServiceIds((provider as any).service_ids || []);
    }
  }, [provider]);

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleSave = async () => {
    if (!provider) return;

    if (selectedServiceIds.length === 0) {
      toast({ title: 'Select at least one service', description: 'Customers need to know what you offer.', variant: 'destructive' });
      return;
    }

    setSaving(true);

    // Completion: name + phone + bio + experience + pincodes + services + bank
    const filled = [
      form.full_name, form.phone, form.bio,
      Number(form.experience_years) > 0,
      (provider.pincodes && provider.pincodes.length > 0),
      selectedServiceIds.length > 0,
      (form.bank_account_number || form.upi_id),
    ];
    const completion = Math.round((filled.filter(Boolean).length / filled.length) * 100);

    const { error } = await supabase.from('service_providers').update({
      full_name: form.full_name,
      phone: form.phone,
      email: form.email,
      bio: form.bio,
      experience_years: Number(form.experience_years),
      service_ids: selectedServiceIds,         // ← THE KEY SAVE
      bank_account_name: form.bank_account_name || null,
      bank_account_number: form.bank_account_number || null,
      bank_ifsc: form.bank_ifsc || null,
      upi_id: form.upi_id || null,
      profile_completion: completion,
    } as any).eq('id', provider.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Profile saved ✅', description: 'You are now discoverable in customer search for your selected services.' });
      refreshProvider();
    }
    setSaving(false);
  };

  const addPincode = async () => {
    if (!provider) return;
    if (!/^\d{6}$/.test(newPincode)) {
      toast({ title: 'Invalid pincode', description: 'Enter a valid 6-digit pincode.', variant: 'destructive' });
      return;
    }
    if (provider.pincodes?.includes(newPincode)) {
      toast({ title: 'Already added', variant: 'destructive' }); return;
    }
    const updated = [...(provider.pincodes || []), newPincode];
    await supabase.from('service_providers').update({ pincodes: updated }).eq('id', provider.id);
    setNewPincode('');
    refreshProvider();
    toast({ title: `Pincode ${newPincode} added ✅` });
  };

  const removePincode = async (pin: string) => {
    if (!provider) return;
    const updated = (provider.pincodes || []).filter(p => p !== pin);
    await supabase.from('service_providers').update({ pincodes: updated }).eq('id', provider.id);
    refreshProvider();
  };

  const update = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile completion */}
      {provider && (
        <Card className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Profile Completion</span>
            <span className="text-sm text-primary font-semibold">{provider.profile_completion || 0}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full gold-gradient rounded-full transition-all" style={{ width: `${provider.profile_completion || 0}%` }} />
          </div>
          {selectedServiceIds.length === 0 && (
            <p className="text-xs text-warning mt-2">⚠️ Select services below to appear in customer search</p>
          )}
        </Card>
      )}

      {/* Basic Info */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass-card p-4 space-y-4">
          <h3 className="font-semibold">Basic Information</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Full Name</label>
              <Input value={form.full_name} onChange={e => update('full_name', e.target.value)} className="glass-input" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Phone</label>
              <Input value={form.phone} onChange={e => update('phone', e.target.value)} className="glass-input" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Email</label>
              <Input value={form.email} onChange={e => update('email', e.target.value)} className="glass-input" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Experience (years)</label>
              <Input type="number" value={form.experience_years} onChange={e => update('experience_years', e.target.value)} className="glass-input" />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Bio</label>
            <Textarea value={form.bio} onChange={e => update('bio', e.target.value)} className="glass-input min-h-[80px]"
              placeholder="Tell customers about your expertise..." />
          </div>
        </Card>
      </motion.div>

      {/* ══ SERVICES YOU OFFER ══════════════════════════════
          This is what makes the provider appear in customer search.
          service_ids[] is saved to the DB on profile save.
          ═══════════════════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card className="glass-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Services You Offer</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Select every service you provide. You will <strong>only appear in customer search</strong> for selected services.
          </p>

          {allServices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading services...</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {allServices.map(service => {
                const isSelected = selectedServiceIds.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => toggleService(service.id)}
                    className={cn(
                      'flex items-center gap-2 p-3 rounded-xl border text-left transition-all duration-200',
                      isSelected
                        ? 'border-primary/60 bg-primary/10 text-foreground'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/30 hover:bg-secondary/60'
                    )}
                  >
                    <span className="text-lg shrink-0">
                      {SERVICE_ICONS[service.name] || '🔧'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-semibold truncate', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                        {service.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">₹{service.base_price}</p>
                    </div>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <p className={cn('text-xs mt-3', selectedServiceIds.length > 0 ? 'text-success' : 'text-warning')}>
            {selectedServiceIds.length > 0
              ? `✅ ${selectedServiceIds.length} service${selectedServiceIds.length > 1 ? 's' : ''} selected`
              : '⚠️ No services selected — customers cannot find you'}
          </p>
        </Card>
      </motion.div>

      {/* Service Pincodes */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card className="glass-card p-4">
          <h3 className="font-semibold mb-1">Service Areas (Pincodes)</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Customers search by pincode. Add every area you serve.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {(provider?.pincodes || []).map(pin => (
              <span key={pin} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary font-semibold">
                {pin}
                <button onClick={() => removePincode(pin)} className="text-primary/50 hover:text-destructive transition-colors ml-1">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {(!provider?.pincodes || provider.pincodes.length === 0) && (
              <p className="text-sm text-muted-foreground">No pincodes added yet</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newPincode}
              onChange={e => setNewPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && addPincode()}
              className="glass-input flex-1"
              placeholder="Enter 6-digit pincode (e.g. 361006)"
              maxLength={6}
            />
            <Button variant="outline" size="sm" onClick={addPincode}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </motion.div>

      {/* Bank Details */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
        <Card className="glass-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Bank Details</h3>
          </div>
          <p className="text-xs text-muted-foreground">Used for weekly payouts. Securely stored.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Account Holder Name</label>
              <Input value={form.bank_account_name} onChange={e => update('bank_account_name', e.target.value)} className="glass-input" placeholder="As on bank account" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Account Number</label>
              <Input value={form.bank_account_number} onChange={e => update('bank_account_number', e.target.value)} className="glass-input" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">IFSC Code</label>
              <Input value={form.bank_ifsc} onChange={e => update('bank_ifsc', e.target.value.toUpperCase())} className="glass-input" placeholder="e.g. HDFC0001234" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">UPI ID (Optional)</label>
              <Input value={form.upi_id} onChange={e => update('upi_id', e.target.value)} className="glass-input" placeholder="name@upi" />
            </div>
          </div>
          {provider?.bank_account_number && (
            <div className="flex items-center gap-2 text-xs text-success">
              <CreditCard className="h-3.5 w-3.5" />
              Bank details saved · **** {provider.bank_account_number.slice(-4)}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Save */}
      <Button className="gold-gradient text-primary-foreground font-semibold w-full h-11" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Save Profile
      </Button>
    </div>
  );
};

export default Profile;
