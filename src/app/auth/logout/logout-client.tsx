'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { logoutLocalAction } from './actions';

export function LogoutClient({ local }: { local: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const logout = async () => {
      try {
        if (local) {
          await logoutLocalAction();
        } else {
          const supabase = createClient();
          await supabase.auth.signOut();
        }
        router.push('/');
      } catch (error) {
        console.error('Logout error:', error);
        router.push('/');
      }
    };

    logout();
  }, [local, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Signing out...</p>
      </div>
    </div>
  );
}
