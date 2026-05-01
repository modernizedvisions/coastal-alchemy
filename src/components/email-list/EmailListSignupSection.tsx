import { FormEvent, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { subscribeToEmailList } from '../../lib/emailListApi';
import { trackEmailSignup } from '../../lib/analytics';

type SignupState = 'idle' | 'submitting' | 'success' | 'duplicate' | 'error';

type EmailListSignupSectionProps = {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  className?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailListSignupSection({
  title = 'Join the Email List',
  subtitle = 'Early access to new drops, restocks, and studio updates.',
  compact = false,
  className = '',
}: EmailListSignupSectionProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SignupState>('idle');
  const [message, setMessage] = useState('');
  const inputId = useId();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim();
    if (!normalized) {
      setState('error');
      setMessage('Please enter an email address.');
      return;
    }
    if (!EMAIL_REGEX.test(normalized)) {
      setState('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    setState('submitting');
    setMessage('');
    try {
      const result = await subscribeToEmailList(normalized);
      if (result.alreadySubscribed) {
        setState('duplicate');
        setMessage("You're already on the list. You're all set.");
      } else {
        const formLocation = typeof window !== 'undefined' ? window.location.pathname : undefined;
        trackEmailSignup({ form_location: formLocation });
        setState('success');
        setMessage('We got it! You are now on the list.');
      }
      setEmail('');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Unable to subscribe right now.');
    }
  };

  return (
    <section className={`lux-card ${compact ? 'p-5 sm:p-6' : 'p-6 sm:p-8'} ${className}`}>
      <div className="space-y-3 text-center">
        <h2 className={`lux-heading ${compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'}`}>{title}</h2>
        <p className="lux-label text-[10px] mx-auto max-w-2xl">{subtitle}</p>
      </div>

      <form className={`${compact ? 'mt-5' : 'mt-6'} mx-auto w-full max-w-2xl`} onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="sr-only">
          Email address
        </label>
        <div className="relative">
          <input
            id={inputId}
            type="email"
            required
            autoComplete="email"
            value={email}
            disabled={state === 'submitting'}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="lux-input h-11 w-full pr-28 text-sm placeholder:font-serif placeholder:tracking-[0.03em] placeholder:text-charcoal/60 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={state === 'submitting'}
            className="lux-button absolute inset-y-1 right-1 h-auto px-5 text-[11px] disabled:opacity-60"
          >
            {state === 'submitting' ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Subscribing...
              </span>
            ) : (
              'Join'
            )}
          </button>
        </div>
      </form>

      <div aria-live="polite" className="mx-auto mt-3 w-full max-w-2xl text-center">
        {state === 'success' && <p className="lux-label text-[10px] text-emerald-700">{message}</p>}
        {state === 'duplicate' && <p className="lux-label text-[10px] text-deep-ocean/80">{message}</p>}
        {state === 'error' && <p className="lux-label text-[10px] text-rose-700">{message}</p>}
      </div>
    </section>
  );
}
