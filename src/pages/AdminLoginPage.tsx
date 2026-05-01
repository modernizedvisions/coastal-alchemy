import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type LoginResponse = {
  ok?: boolean;
  code?: string;
  expiresAt?: string;
};

export function AdminLoginPage() {
  const navigate = useNavigate();
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void fetch('/api/admin/auth/me', { credentials: 'include' })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as LoginResponse | null;
        console.debug('[admin login] /me check', { status: response.status, payload });
      })
      .catch((fetchError) => {
        console.debug('[admin login] /me check failed', fetchError);
      });
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json().catch(() => null)) as LoginResponse | null;

      if (response.ok && payload?.ok) {
        setPassword('');
        navigate('/admin/customers', { replace: true });
        return;
      }

      if (response.status === 401 && payload?.code === 'BAD_PASSWORD') {
        setError('Incorrect password. Please try again.');
        passwordInputRef.current?.focus();
        return;
      }

      if (response.status === 500) {
        setError('Unable to sign in right now. Please try again.');
        return;
      }

      setError('Unable to sign in. Please verify your input and try again.');
    } catch {
      setError('Unable to sign in right now. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ca-admin-shell flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="ca-admin-card w-full max-w-md p-8 text-[var(--ca-ink)]">
        <div className="mb-7 text-center">
          <p className="ca-admin-eyebrow mb-2">Coastal Alchemy</p>
          <h2 className="ca-admin-heading text-4xl leading-tight">Studio Admin</h2>
          <p className="ca-admin-subheading mt-2 text-sm">Sign in to manage the shop, orders, images, and custom requests.</p>
        </div>
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label htmlFor="admin-password" className="ca-admin-eyebrow mb-2 block">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              ref={passwordInputRef}
              className="ca-admin-input w-full px-4 py-3"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? (
            <div className="mb-4 rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          <button type="submit" disabled={isLoading} className="ca-admin-button-primary inline-flex w-full items-center justify-center px-5 py-3 text-[11px] uppercase disabled:opacity-50">
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
