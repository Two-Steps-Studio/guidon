'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { clearAllTaskDrafts } from '@/lib/work/task-drafts';
import { logoutLocalAction } from './actions';
import posthog from "posthog-js";

export function LogoutClient({ local }: { local: boolean }) {
  const t = useTranslations('auth.logout');
  const router = useRouter();

  useEffect(() => {
    const logout = async () => {
      // Unsaved task edits stay on this device only for the person who wrote them.
      clearAllTaskDrafts();
      // Reset before ending the app session so the next visitor cannot inherit
      // this person's persisted browser identity.
      posthog.capture("logout_completed");
      posthog.reset();
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
        <p className="text-muted-foreground">{t('signingOut')}</p>
      </div>
    </div>
  );
}
