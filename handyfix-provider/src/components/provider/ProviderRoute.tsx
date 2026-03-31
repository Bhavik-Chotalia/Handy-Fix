import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProvider } from '@/contexts/ProviderContext';
import { Loader2 } from 'lucide-react';

const ProviderRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const { provider, loading: providerLoading } = useProvider();

  if (authLoading || providerLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/provider-login" replace />;
  if (!provider) return <Navigate to="/provider-login" replace />;

  return <>{children}</>;
};

export default ProviderRoute;
