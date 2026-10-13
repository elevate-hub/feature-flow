import { useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { ApiError, api } from "./api/client";
import { useAuth } from "./auth/AuthContext";

function Brand() {
  return (
    <Link className="brand" to="/login" aria-label="FeatureFlow home">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>feature<span className="brand-light">flow</span></span>
    </Link>
  );
}

function AuthLayout({
  children,
  mode,
}: {
  children: ReactNode;
  mode: "login" | "register";
}) {
  return (
    <main className="auth-shell">
      <section className="visual-panel" aria-label="FeatureFlow overview">
        <div className="visual-inner">
          <Brand />
          <div className="visual-copy">
            <div className="eyebrow"><span className="status-dot" /> CONTROL THE RELEASE</div>
            <h1>Ship confidently.<br /><em>Change everything.</em></h1>
            <p>One place to manage feature flags, target experiences, and move at the speed of your team.</p>
            <div className="preview-card" aria-hidden="true">
              <div className="preview-header"><span>Environment overview</span><span className="preview-live"><i /> LIVE</span></div>
              <div className="preview-row"><div className="flag-icon purple">N</div><div className="preview-info"><strong>new_dashboard</strong><small>Development · Updated just now</small></div><span className="toggle on"><i /></span></div>
              <div className="preview-row"><div className="flag-icon blue">C</div><div className="preview-info"><strong>checkout_v2</strong><small>Production · Updated 2h ago</small></div><span className="toggle"><i /></span></div>
              <div className="preview-footer"><span><b>12</b> active flags</span><span><b>3</b> environments</span><span><b>99.9%</b> uptime</span></div>
            </div>
          </div>
          <div className="visual-bottom"><span>BUILT FOR TEAMS THAT SHIP</span><span>SECURE · RELIABLE · SIMPLE</span></div>
        </div>
      </section>
      <section className="form-panel">
        <div className="form-top"><span className="mobile-brand"><Brand /></span><span>{mode === "login" ? "New to FeatureFlow?" : "Already have an account?"} <Link to={mode === "login" ? "/register" : "/login"}>{mode === "login" ? "Create account" : "Sign in"}</Link></span></div>
        <div className="form-wrap">{children}</div>
        <div className="form-legal">By continuing, you agree to our <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.</div>
      </section>
    </main>
  );
}

function FormError({ children }: { children: string }) {
  return <div className="form-error" role="alert"><span aria-hidden="true">!</span>{children}</div>;
}

function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  minLength,
  maxLength,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
      />
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn({ email: email.trim().toLowerCase(), password });
      navigate("/dashboard", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout mode="login">
      <div className="form-heading">
        <div className="form-kicker">WELCOME BACK</div>
        <h2>Sign in to your workspace</h2>
        <p>Enter your details to pick up where you left off.</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && <FormError>{error}</FormError>}
        <Field id="email" label="Work email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" maxLength={255} />
        <Field id="password" label="Password" type="password" value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" maxLength={128} />
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? <><span className="spinner" />Signing in...</> : <>Sign in <span aria-hidden="true">→</span></>}
        </button>
      </form>
      <div className="form-divider"><span /> <span>SECURE ACCESS</span> <span /></div>
      <p className="form-note">Your workspace is protected with encrypted authentication.</p>
    </AuthLayout>
  );
}

function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (password.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await api.register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      setCreated(true);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? "An account with this email already exists. Sign in instead."
          : cause instanceof Error
            ? cause.message
            : "Unable to create your account.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout mode="register">
      {created ? (
        <div className="success-state">
          <span className="success-icon" aria-hidden="true">✓</span>
          <div className="form-kicker">YOU’RE ALL SET</div>
          <h2>Account created</h2>
          <p>Your workspace is ready. Sign in to get started.</p>
          <button className="primary-button" onClick={() => navigate("/login", { replace: true })}>Continue to sign in <span aria-hidden="true">→</span></button>
        </div>
      ) : (
        <>
          <div className="form-heading">
            <div className="form-kicker">GET STARTED</div>
            <h2>Create your account</h2>
            <p>Start managing feature releases with confidence.</p>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <FormError>{error}</FormError>}
            <Field id="name" label="Full name" value={name} onChange={setName} placeholder="Alex Morgan" autoComplete="name" minLength={1} maxLength={150} />
            <Field id="email" label="Work email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" maxLength={255} />
            <Field id="password" label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" minLength={8} maxLength={128} />
            <p className="field-hint">Use at least 8 characters.</p>
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? <><span className="spinner" />Creating account...</> : <>Create account <span aria-hidden="true">→</span></>}
            </button>
          </form>
          <p className="form-note signup-note">Your account information is encrypted and kept private.</p>
        </>
      )}
    </AuthLayout>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen label="Checking your session..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoadingScreen({ label }: { label: string }) {
  return <main className="loading-screen"><span className="spinner dark" />{label}</main>;
}

function DashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    signOut();
    navigate("/login", { replace: true });
  }

  if (!user) return <Navigate to="/login" replace />;
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main className="dashboard">
      <header className="dash-header">
        <Brand />
        <button className="logout-button" onClick={handleLogout}>Sign out <span aria-hidden="true">↗</span></button>
      </header>
      <section className="dash-content">
        <div className="dash-breadcrumb"><span className="crumb-dot" /> ACCOUNT OVERVIEW</div>
        <div className="dash-title-row">
          <div><h1>Welcome, {user.name.split(" ")[0]}</h1><p>You’re signed in and ready to manage your workspace.</p></div>
          <div className="user-avatar" aria-hidden="true">{initials}</div>
        </div>
        <section className="account-card" aria-labelledby="account-title">
          <div className="card-heading"><div><div className="form-kicker">YOUR PROFILE</div><h2 id="account-title">Account details</h2></div><span className="active-badge"><i /> Active</span></div>
          <dl className="profile-list">
            <div><dt>Full name</dt><dd>{user.name}</dd></div>
            <div><dt>Email address</dt><dd>{user.email}</dd></div>
            <div><dt>Account role</dt><dd><span className="role-pill">{user.role}</span></dd></div>
            <div><dt>Account status</dt><dd>{user.is_active ? "Active" : "Inactive"}</dd></div>
            <div><dt>User ID</dt><dd className="id-value">#{user.id}</dd></div>
          </dl>
        </section>
        <div className="coming-soon"><span className="coming-icon">✳</span><div><strong>Your feature workspace is next</strong><p>Authentication is connected. Flag and environment management can be added here next.</p></div><span className="coming-tag">COMING UP</span></div>
      </section>
      <footer className="dash-footer"><span>FEATUREFLOW · FEATURE FLAG MANAGEMENT</span><span>YOUR WORKSPACE, SECURED</span></footer>
    </main>
  );
}

function App() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : loading ? <LoadingScreen label="Loading..." /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : loading ? <LoadingScreen label="Loading..." /> : <RegisterPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
