import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorText } from '../components/ui';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/app/overview" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate('/app/overview', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-panel">
        <p className="brand-mark">MaintainAI</p>
        <h1>Sign in</h1>
        <p className="login-copy">
          Property maintenance for owners, tenants, and technicians.
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          <label className="field">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <ErrorText message={error} />
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="auth-links">
          <span />
          <Link to="/register">Create an account</Link>
        </div>
        <p className="demo-hint">
          Demo accounts (password <strong>Password123!</strong>):
          <br />
          ownera@test.com · tenanta@test.com · techa@test.com
        </p>
      </div>
    </main>
  );
}
