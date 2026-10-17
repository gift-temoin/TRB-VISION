import { Lock, Mail, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/layout/AuthShell";
import { Button } from "../components/ui/Button";
import { CountrySelect } from "../components/ui/CountrySelect";
import { Field } from "../components/ui/Field";
import { InlineError } from "../components/ui/States";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";
import { cn } from "../lib/utils";
import { isValidEmail, passwordIssues, passwordStrength } from "../lib/validation";
import type { CountryCode } from "../types";

export function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    country: "" as CountryCode | "",
    password: "",
    confirm_password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = passwordStrength(form.password);

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.full_name.trim().length < 2) next.full_name = "Enter your full name.";
    if (!form.email.trim()) next.email = "Email address is required.";
    else if (!isValidEmail(form.email)) next.email = "Enter a valid email address.";
    if (!form.country) next.country = "Please select your country.";
    const issues = passwordIssues(form.password);
    if (issues.length) next.password = `Password needs ${issues.join(", ")}.`;
    if (form.password !== form.confirm_password)
      next.confirm_password = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    setServerError(null);
    try {
      await signup({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        country: form.country as CountryCode,
        password: form.password,
        confirm_password: form.confirm_password,
      });
      navigate("/verify", { replace: true });
    } catch (err) {
      setServerError(
        err instanceof ApiError ? err.message : "Unable to create your account."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join to receive verified market direction predictions."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-bullish hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {serverError && <InlineError>{serverError}</InlineError>}

        <Field
          id="full_name"
          label="Full name"
          autoComplete="name"
          placeholder="Jane Doe"
          icon={<User className="h-4 w-4" />}
          value={form.full_name}
          onChange={set("full_name")}
          error={errors.full_name}
        />

        <Field
          id="email"
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="jane@example.com"
          icon={<Mail className="h-4 w-4" />}
          value={form.email}
          onChange={set("email")}
          error={errors.email}
        />

        <CountrySelect
          value={form.country}
          onChange={(code) => setForm((f) => ({ ...f, country: code }))}
          error={errors.country}
        />

        <div>
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a strong password"
            icon={<Lock className="h-4 w-4" />}
            value={form.password}
            onChange={set("password")}
            error={errors.password}
          />
          {form.password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      i <= strength.score
                        ? strength.tone === "bull"
                          ? "bg-bullish"
                          : strength.tone === "neutral"
                            ? "bg-neutral"
                            : "bg-bearish"
                        : "bg-white/10"
                    )}
                  />
                ))}
              </div>
              <span className="text-[11px] text-slate-400">{strength.label}</span>
            </div>
          )}
        </div>

        <Field
          id="confirm_password"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          icon={<Lock className="h-4 w-4" />}
          value={form.confirm_password}
          onChange={set("confirm_password")}
          error={errors.confirm_password}
        />

        <Button type="submit" size="lg" loading={loading} className="w-full">
          Create account
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-slate-500">
          By creating an account you agree that predictions are probabilistic and not financial
          advice.
        </p>
      </form>
    </AuthShell>
  );
}
