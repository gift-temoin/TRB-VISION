import { KeyRound, LogOut, Mail, MessageCircle, ShieldCheck, User as UserIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { InfoBanner, InlineError } from "../components/ui/States";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import { countryFlag, countryName } from "../lib/countries";
import { formatDateTime } from "../lib/utils";
import { passwordIssues } from "../lib/validation";

export function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const issues = passwordIssues(newPassword);
    if (issues.length) {
      setError(`Password needs ${issues.join(", ")}.`);
      return;
    }
    if (!user?.email) return;
    setLoading(true);
    try {
      await api.confirmPasswordReset({
        email: user.email,
        code: code.trim(),
        new_password: newPassword,
      });
      setSuccess("Password updated successfully.");
      setCode("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update password.");
    } finally {
      setLoading(false);
    }
  };

  const startReset = async () => {
    setError(null);
    setSuccess(null);
    if (!user?.email) return;
    try {
      const res = await api.requestPasswordReset(user.email);
      setSuccess(res.dev_code ? `${res.message} Dev code: ${res.dev_code}` : res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to start password reset.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white sm:text-2xl">Account settings</h1>
        <p className="mt-1 text-sm text-slate-400">Manage your profile, security and access.</p>
      </div>

      <Card>
        <CardHeader title="Profile" subtitle="Your registered account details" icon={<UserIcon className="h-5 w-5" />} />
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-500">Full name</dt>
            <dd className="mt-1 text-sm text-white">{user?.full_name}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-500">Email address</dt>
            <dd className="mt-1 flex items-center gap-2 text-sm text-white">
              <Mail className="h-3.5 w-3.5 text-slate-500" />
              {user?.email}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-500">Country</dt>
            <dd className="mt-1 flex items-center gap-2 text-sm text-white">
              <span aria-hidden>{user?.country_flag || countryFlag(user?.country)}</span>
              {user?.country_name ?? countryName(user?.country)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-500">Account status</dt>
            <dd className="mt-1">
              {user?.is_active ? <Badge tone="bull" dot>Active</Badge> : <Badge tone="danger" dot>Disabled</Badge>}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-500">Verification</dt>
            <dd className="mt-1">
              {user?.is_verified ? (
                <Badge tone="bull"><ShieldCheck className="h-3 w-3" /> Verified</Badge>
              ) : (
                <Badge tone="neutral" dot>Unverified</Badge>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-500">Member since</dt>
            <dd className="mt-1 text-sm text-white">{formatDateTime(user?.created_at)}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Change password"
          subtitle="Request a reset code, then set a new password"
          icon={<KeyRound className="h-5 w-5" />}
        />
        <form onSubmit={changePassword} className="space-y-4">
          {error && <InlineError>{error}</InlineError>}
          {success && <InfoBanner>{success}</InfoBanner>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field
              id="reset_code"
              label="Reset code"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={() => void startReset()} className="sm:mb-[1px]">
              Send code
            </Button>
          </div>
          <Field
            id="new_password"
            label="New password"
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Button type="submit" loading={loading}>
            Update password
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Administrator messaging"
          subtitle="Reach the administrator through the in-app portal"
          icon={<MessageCircle className="h-5 w-5" />}
        />
        <p className="text-sm text-slate-400">
          Use the green chat button at the bottom-right of any page to send a message. This is an
          internal portal — it does not send WhatsApp messages.
        </p>
      </Card>

      <Card className="border-bearish/20">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-semibold text-white">Sign out</h3>
            <p className="text-xs text-slate-400">End your current session on this device.</p>
          </div>
          <Button
            variant="danger"
            icon={<LogOut className="h-4 w-4" />}
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
