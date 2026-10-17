import { Ban, CheckCircle2, Copy, KeyRound, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { formatDateTime } from "../../lib/utils";
import type { Passcode } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardHeader } from "../ui/Card";
import { Field } from "../ui/Field";
import { ErrorState, InfoBanner, InlineError } from "../ui/States";
import { LoadingState } from "../ui/Spinner";

export function AdminPasscodes() {
  const [codes, setCodes] = useState<Passcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInHours, setExpiresInHours] = useState<number | "">(24);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setCodes(await api.adminPasscodes());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load passcodes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (code.trim().length < 6) {
      setFormError("Passcode must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.adminCreatePasscode({
        code: code.trim(),
        label: label.trim() || "Verification passcode",
        max_uses: maxUses,
        expires_in_hours: expiresInHours === "" ? null : Number(expiresInHours),
      });
      setCreatedCode(code.trim());
      setCode("");
      setLabel("");
      setCodes((list) => [created, ...list]);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create passcode.");
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (p: Passcode) => {
    setBusyId(p.id);
    try {
      const updated = await api.adminRevokePasscode(p.id);
      setCodes((list) => list.map((x) => (x.id === p.id ? updated : x)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke passcode.");
    } finally {
      setBusyId(null);
    }
  };

  const generate = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setCode(out);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Create verification passcode"
          subtitle="Codes are hashed on the server — copy the plaintext now, it will not be shown again."
          icon={<KeyRound className="h-5 w-5" />}
        />
        {createdCode && (
          <div className="mb-4">
            <InfoBanner tone="warn">
              <span className="flex items-center justify-between gap-3">
                <span>
                  New passcode created — share securely:{" "}
                  <span className="font-mono font-semibold">{createdCode}</span>
                </span>
                <button
                  onClick={() => void navigator.clipboard?.writeText(createdCode)}
                  className="inline-flex items-center gap-1 text-amber-100 hover:text-white"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              </span>
            </InfoBanner>
          </div>
        )}
        <form onSubmit={create} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {formError && (
            <div className="sm:col-span-2 lg:col-span-4">
              <InlineError>{formError}</InlineError>
            </div>
          )}
          <Field
            id="label"
            label="Label"
            placeholder="e.g. Jan batch"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Field
            id="code"
            label="Passcode"
            placeholder="At least 6 characters"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rightSlot={
              <button
                type="button"
                onClick={generate}
                className="rounded-lg px-2 py-1 text-[11px] text-bullish hover:bg-bullish/10"
              >
                Generate
              </button>
            }
          />
          <Field
            id="max_uses"
            label="Max uses"
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value)))}
          />
          <Field
            id="expires"
            label="Expires in (hours)"
            type="number"
            min={1}
            placeholder="Blank = never"
            value={expiresInHours}
            onChange={(e) =>
              setExpiresInHours(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" loading={submitting} icon={<Plus className="h-4 w-4" />}>
              Create passcode
            </Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <LoadingState label="Loading passcodes…" />
      ) : error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3 font-medium">Label</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium">Expires</th>
                  <th className="px-5 py-3 font-medium">Uses</th>
                  <th className="px-5 py-3 font-medium">State</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {codes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                      No passcodes yet. Create one above.
                    </td>
                  </tr>
                ) : (
                  codes.map((p) => (
                    <tr key={p.id} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-3 text-white">{p.label}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {formatDateTime(p.created_at)}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {p.expires_at ? formatDateTime(p.expires_at) : "Never"}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-300">
                        {p.uses}/{p.max_uses}
                      </td>
                      <td className="px-5 py-3">
                        {p.active ? (
                          <Badge tone="bull" dot>
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </Badge>
                        ) : p.revoked ? (
                          <Badge tone="danger" dot>
                            Revoked
                          </Badge>
                        ) : (
                          <Badge tone="muted" dot>
                            Expired
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {p.active && (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={busyId === p.id}
                            onClick={() => void revoke(p)}
                            icon={<Ban className="h-3.5 w-3.5" />}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
