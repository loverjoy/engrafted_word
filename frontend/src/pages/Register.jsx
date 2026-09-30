import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/pages/Login";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(name, email, password);
      toast.success("Account created");
      navigate("/");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create host account" subtitle="Free forever. Host unlimited meetings.">
      <form onSubmit={submit} className="space-y-4" data-testid="register-form">
        <div>
          <Label className="text-slate-400 text-xs font-mono uppercase tracking-widest">Name</Label>
          <Input
            data-testid="register-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Ada Lovelace"
            className="mt-2 h-12 bg-[#090A0F] border-[#262A38] text-white focus-visible:ring-[#E07A5F]"
          />
        </div>
        <div>
          <Label className="text-slate-400 text-xs font-mono uppercase tracking-widest">Email</Label>
          <Input
            data-testid="register-email-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@studio.com"
            className="mt-2 h-12 bg-[#090A0F] border-[#262A38] text-white focus-visible:ring-[#E07A5F]"
          />
        </div>
        <div>
          <Label className="text-slate-400 text-xs font-mono uppercase tracking-widest">
            Password
          </Label>
          <Input
            data-testid="register-password-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="min. 6 characters"
            className="mt-2 h-12 bg-[#090A0F] border-[#262A38] text-white focus-visible:ring-[#E07A5F]"
          />
        </div>
        <Button
          data-testid="register-submit-btn"
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-[#E07A5F] hover:bg-[#D06348] text-[#090A0F] font-semibold rounded-xl"
        >
          {loading ? "Creating…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link to="/login" className="text-[#E07A5F] hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
