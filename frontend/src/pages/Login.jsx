import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Video } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectTo = location.state?.from || "/";

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate(redirectTo);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Host sign in" subtitle="Sign in to start hosting meetings.">
      <form onSubmit={submit} className="space-y-4" data-testid="login-form">
        <div>
          <Label className="text-slate-400 text-xs font-mono uppercase tracking-widest">Email</Label>
          <Input
            data-testid="login-email-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@studio.com"
            className="mt-2 h-12 bg-[#090A0F] border-[#262A38] text-white focus-visible:ring-[#E07A5F]"
          />
        </div>
        <div>
          <Label className="text-slate-400 text-xs font-mono uppercase tracking-widest">Password</Label>
          <Input
            data-testid="login-password-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="mt-2 h-12 bg-[#090A0F] border-[#262A38] text-white focus-visible:ring-[#E07A5F]"
          />
        </div>
        <Button
          data-testid="login-submit-btn"
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-[#E07A5F] hover:bg-[#D06348] text-[#090A0F] font-semibold rounded-xl"
        >
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        No account?{" "}
        <Link to="/register" className="text-[#E07A5F] hover:underline font-medium">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-[#090A0F] flex items-center justify-center px-6 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 right-0 w-[30rem] h-[30rem] rounded-full bg-[#E07A5F]/10 blur-[120px]" />
      <div className="relative z-10 w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-[#E07A5F] flex items-center justify-center">
            <Video className="w-5 h-5 text-[#090A0F]" strokeWidth={2.5} />
          </div>
          <span className="font-heading font-bold text-lg tracking-tight text-white">Engraved Word</span>
        </Link>
        <div className="rounded-2xl border border-[#262A38] bg-[#12151E] p-8 animate-fade-up">
          <h1 className="font-heading text-2xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-slate-400 mt-1.5 mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
