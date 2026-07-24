import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { KeyRound, ArrowRight } from 'lucide-react';
import { useToast } from '../context/ToastContext.jsx';

export default function ResetPassword() {
  const { toast } = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.resetPassword(token.trim(), password);
      toast('Password updated. Please log in.');
      nav('/login');
    } catch (e) {
      setErr(e.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md card-muted p-8">
        <div className="h-12 w-12 rounded-md bg-secondary text-secondary-foreground flex items-center justify-center mb-5">
          <KeyRound size={22} strokeWidth={2.5} />
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight leading-none mb-2">
          Set new password
        </h1>
        <p className="text-muted-foreground font-medium mb-8">
          Paste your reset token and choose a new password.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label block mb-1.5">Reset token</label>
            <input
              className="input"
              placeholder="Token from your email"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label block mb-1.5">New password</label>
            <input
              className="input"
              type="password"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          {err && <div className="card-accent p-3 text-sm font-medium text-accent-hover">{err}</div>}
          <button className="btn-accent w-full" disabled={loading}>
            {loading ? 'Updating…' : 'Update password'} <ArrowRight size={16} strokeWidth={2.5} />
          </button>
        </form>

        <p className="text-sm font-medium text-muted-foreground text-center mt-8">
          <Link to="/login" className="text-primary font-semibold hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
