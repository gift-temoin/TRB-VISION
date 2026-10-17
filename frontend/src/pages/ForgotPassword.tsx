import { KeyRound, Lock, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/layout/AuthShell";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { InfoBanner, InlineError } from "../components/ui/States";
import { api, ApiError } from "../lib/api";
import { isValidEmail } from "../lib/validation";

export function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.requestPasswordReset(email.trim());
      setInfo(res.message);
      setDevCode(res.dev_code ?? null);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to start reset.");
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.trim().length < 4) {
      setError("Enter the reset code.");
      return;
    }
    setLoading(true);
    try {
      await api.confirmPasswordReset({
        email: email.trim(),
        code: code.trim(),
        new_password: newPassword,
      });
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle={
        step === "request"
          ? "We'll send a reset code to your registered email address."
          : "Enter the code and choose a new password."
      }
      footer={
        <Link to="/login" className="font-semibold text-bullish hover:underline">
          Back to sign in
        </Link>
      }
    >
      {step === "request" ? (
        <form onSubmit={requestCode} className="space-y-4">
          {error && <InlineError>{error}</InlineError>}
          <Field
            id="email"
            label="Email address"
            type="email"
            placeholder="jane@example.com"
            icon={<Mail className="h-4 w-4" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" size="lg" loading={loading} className="w-full">
            Send reset code
          </Button>
        </form>
      ) : (
        <form onSubmit={confirmReset} className="space-y-4">
          {info && <InfoBanner>{info}</InfoBanner>}
          {devCode && <InfoBanner tone="warn">Dev reset code: {devCode}</InfoBanner>}
          {error && <InlineError>{error}</InlineError>}
          <Field
            id="code"
            label="Reset code"
            placeholder="6-digit code"
            icon={<KeyRound className="h-4 w-4" />}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Field
            id="new_password"
            label="New password"
            type="password"
            placeholder="New password"
            icon={<Lock className="h-4 w-4" />}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Button type="submit" size="lg" loading={loading} className="w-full">
            Reset password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
