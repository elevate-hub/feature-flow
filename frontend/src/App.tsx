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
import Dashboard from "./pages/Dashboard";
import Environments from "./pages/Environments";
import EnvironmentDetails from "./pages/EnvironmentDetails";
import Flags from "./pages/Flags";

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
            <div className="preview-card auth-feature-list">
              <div className="preview-header"><span>Release controls</span><span className="preview-live">FEATUREFLOW</span></div>
              <div className="preview-row"><div className="flag-icon purple">01</div><div className="preview-info"><strong>Environment-scoped flags</strong><small>Configure behavior for each environment</small></div></div>
              <div className="preview-row"><div className="flag-icon blue">02</div><div className="preview-info"><strong>One authenticated workspace</strong><small>Manage releases through the connected API</small></div></div>
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

function App() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : loading ? <LoadingScreen label="Loading..." /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : loading ? <LoadingScreen label="Loading..." /> : <RegisterPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/flags" element={<ProtectedRoute><Flags /></ProtectedRoute>} />
      <Route path="/environments" element={<ProtectedRoute><Environments /></ProtectedRoute>} />
      <Route path="/environments/:environmentId" element={<ProtectedRoute><EnvironmentDetails /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
