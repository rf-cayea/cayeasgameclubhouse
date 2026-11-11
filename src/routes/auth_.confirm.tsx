import { createFileRoute, Link, Navigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { HubNav } from '@/components/HubNav';
import { supabase } from '@/integrations/supabase/client';
import { authErrorMessage, clearEmailReturnUrl, completeEmailConfirmation, incomingEmailReturn, readEmailReturn } from '@/lib/email-confirmation';
export const Route = createFileRoute('/auth_/confirm')({ component: EmailConfirmationPage });
function EmailConfirmationPage() {
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [message, setMessage] = useState('Completing your email confirmation…');
  const job = useRef<Promise<{ email: string }> | null>(null);
  useEffect(() => {
    let active = true;
    if(incomingEmailReturn?.type==='recovery')return;
    if (!supabase) { clearEmailReturnUrl(); setStatus('error'); setMessage('Member services are not connected yet. Please try again later.'); return; }
    if (!job.current) job.current = completeEmailConfirmation(supabase, incomingEmailReturn ?? readEmailReturn(window.location.href));
    void job.current.then(() => {
      if (active) { clearEmailReturnUrl(); setStatus('success'); setMessage('Your account is confirmed and you’re signed in. Welcome to the Clubhouse.'); }
    }).catch(cause => {
      if (active) { clearEmailReturnUrl(); setStatus('error'); setMessage(authErrorMessage(cause)); }
    });
    return () => { active = false; };
  }, []);
  if(incomingEmailReturn?.type==='recovery')return <Navigate to="/auth/reset" hash={window.location.hash.slice(1)} replace/>;
  return <><HubNav/><main className="mx-auto max-w-lg px-4 py-12"><div className="card-hub"><h1 className="font-display text-3xl text-gold">{status === 'success' ? 'Email confirmed' : status === 'error' ? 'Confirmation needs attention' : 'Confirming your email'}</h1><p className="mt-4" role={status === 'error' ? 'alert' : 'status'}>{message}</p>{status === 'success' ? <Link to="/clubhouse" className="btn-gold mt-6">Visit the Clubhouse</Link> : status === 'error' ? <Link to="/auth" className="btn-ghost-gold mt-6">Sign in or request a new email</Link> : null}</div></main></>;
}
