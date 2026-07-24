import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { KeyRound, ArrowRight } from 'lucide-react';
import { useToast } from '../context/ToastContext.jsx';

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await api.forgotPassword(email.trim());
      setSent(true);
      if (res.devToken) setDevToken(res.devToken);
      toast('If that email exists, a reset link was sent');
    } catch (e) {
      setErr(e.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md card-muted p-8">
        <div className="h-12 w-12 rounded-md bg-primary text-primary-foreground flex items-center justify-center mb-5">
          <KeyRound size={22} strokeWidth={2.5} />
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight leading-none mb-2">
          Reset password
        </h1>
        <p className="text-muted-foreground font-medium mb-8">
          Enter your email and we'll send a reset link.
        </p>

        {sent ? (
          <div className="space-y-4">
            <div className="card-secondary p-4 text-sm font-medium">
              If an account exists for <span className="font-bold">{email}</span>, a reset link is on its way.
            </div>
            {devToken && (
              <div className="card-accent p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent-hover mb-1">
                  Dev mode — no mailer configured
                </p>
                <p className="text-sm font-medium mb-2">Use this token on the reset page:</p>
                <Link
                  to={`/reset-password?token=${devToken}`}
                  className="text-primary font-semibold break-all underline underline-offset-4"
                >
                  {devToken}
                </Link>
              </div>
            )}
            <Link to="/login" className="btn-secondary w-full">Back to login</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label block mb-1.5">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {err && <div className="card-accent p-3 text-sm font-medium text-accent-hover">{err}</div>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'} <ArrowRight size={16} strokeWidth={2.5} />
            </button>
          </form>
        )}

        <p className="text-sm font-medium text-muted-foreground text-center mt-8">
          Remembered it?{' '}
          <Link to="/login" className="text-primary font-semibold hover:underline">Login</Link>
        </p>
      </div>
    </div>
  );
}
