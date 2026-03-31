import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo.png';

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // If already logged in, skip this page and go straight to the panel
  useEffect(() => {
    if (!loading && user) {
      navigate('/provider-panel', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) return null; // Splash is already covering the screen

  return (
    <div className="dark min-h-screen bg-background flex items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at center, #1a1400 0%, #0a0a0a 70%)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="text-center max-w-md"
      >
        {/* Glow ring */}
        <motion.div
          animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.55, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-48 h-48 rounded-full left-1/2 -translate-x-1/2"
          style={{ background: 'radial-gradient(circle, rgba(240,165,0,0.22) 0%, transparent 70%)' }}
        />

        {/* Real logo */}
        <motion.img
          src={logo}
          alt="HandyFix"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          className="w-24 h-24 rounded-3xl object-cover mx-auto mb-6 shadow-2xl relative z-10"
          style={{ boxShadow: '0 0 40px 6px rgba(240,165,0,0.35)' }}
        />

        <h1
          className="text-3xl font-extrabold mb-1 tracking-tight relative z-10"
          style={{ background: 'linear-gradient(90deg, #f0a500, #ffd666, #f0a500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          HandyFix
        </h1>
        <p className="text-muted-foreground mb-8 tracking-widest uppercase text-sm">Provider Portal</p>

        <Button
          onClick={() => navigate('/provider-login')}
          className="gold-gradient text-primary-foreground font-semibold h-12 px-8 text-base"
        >
          Provider Login <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </motion.div>
    </div>
  );
};

export default Index;
