import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ArrowRight, UserPlus } from 'lucide-react';

export default function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await signup(name.trim(), email.trim(), password);
      nav('/');
    } catch (e) {
      setErr(e.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md card-muted p-8">
        <div className="h-12 w-12 rounded-md bg-secondary text-secondary-foreground
          flex items-center justify-center mb-5">
          <UserPlus size={22} strokeWidth={2.5} />
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight leading-none mb-2">
          Create account
        </h1>
        <p className="text-muted-foreground font-medium mb-8">
          Save more on every quick-commerce order.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label block mb-1.5">Full name</label>
            <input
              className="input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </div>
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
          <div>
            <label className="label block mb-1.5">Password</label>
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
          {err && (
            <div className="card-accent p-3 text-sm font-medium text-accent-hover">{err}</div>
          )}
          <button className="btn-accent w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Create account'} <ArrowRight size={16} strokeWidth={2.5} />
          </button>
        </form>

        <p className="text-sm font-medium text-muted-foreground text-center mt-8">
          Already a member?{' '}
          <Link to="/login" className="text-primary font-semibold hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
