import type {
  AdminStats,
  ChartAnalysis,
  ChartMindHistoryItem,
  ChartMindResult,
  ChartMindSaved,
  Conversation,
  ForexCandlesResponse,
  ForexAnalysisResponse,
  ForexEvaluation,
  Instrument,
  MarketCategory,
  Message,
  Passcode,
  PredictionResponse,
  User,
  VerificationStatus,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const TOKEN_KEY = "trb.access_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Network error. Please check your connection.");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) ||
      (typeof data === "string" ? data : "Request failed");
    const message = Array.isArray(detail)
      ? detail.map((d: any) => d.msg || String(d)).join(", ")
      : String(detail);
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

export const api = {
  // Auth
  countries() {
    return request<{ code: string; name: string; flag: string }[]>("/auth/countries");
  },
  signup(body: {
    full_name: string;
    email: string;
    country: string;
    password: string;
    confirm_password: string;
    phone?: string;
  }) {
    return request<{ access_token: string; user: User }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  login(body: { email: string; password: string }) {
    return request<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  me() {
    return request<User>("/auth/me");
  },
  logout() {
    return request<void>("/auth/logout", { method: "POST" });
  },
  requestPasswordReset(email: string) {
    return request<{ message: string; dev_code?: string }>("/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  confirmPasswordReset(body: { email: string; code: string; new_password: string }) {
    return request<{ message: string }>("/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  // Verification
  verificationStatus() {
    return request<VerificationStatus>("/verification/status");
  },
  verify(code: string) {
    return request<{ verified: boolean; message: string }>("/verification/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  // Markets / predictions
  instruments(category?: MarketCategory) {
    const q = category ? `?category=${category}` : "";
    return request<Instrument[]>(`/predictions/instruments${q}`);
  },
  market(category: MarketCategory) {
    return request<PredictionResponse>(`/predictions/market/${category}`);
  },
  analyzeChart(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<ChartAnalysis>("/predictions/analyze-chart", {
      method: "POST",
      body: form,
    });
  },

  // Forex OHLC / trend analysis
  forexCandles(symbol: string, interval: string) {
    return request<ForexCandlesResponse>(
      `/forex/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}`
    );
  },
  forexAnalysis(symbol: string, interval: string) {
    return request<ForexAnalysisResponse>(
      `/forex/analysis?symbol=${encodeURIComponent(symbol)}&interval=${interval}`
    );
  },
  forexEvaluate(symbol: string, interval: string, trainRatio = 0.7) {
    return request<ForexEvaluation>(
      `/forex/evaluate?symbol=${encodeURIComponent(symbol)}&interval=${interval}&train_ratio=${trainRatio}`
    );
  },

  // ChartMind (AI Chart Analyzer)
  chartMindAnalyze(params: {
    symbol: string;
    interval: string;
    candles: number;
    futureCandles?: number;
    screenshot?: File | null;
    screenshotInstrument?: string;
    screenshotTimeframe?: string;
  }) {
    const form = new FormData();
    form.append("symbol", params.symbol);
    form.append("interval", params.interval);
    form.append("candles", String(params.candles));
    form.append("future_candles", String(params.futureCandles ?? 0));
    if (params.screenshot) {
      form.append("file", params.screenshot);
      if (params.screenshotInstrument) form.append("screenshot_instrument", params.screenshotInstrument);
      if (params.screenshotTimeframe) form.append("screenshot_timeframe", params.screenshotTimeframe);
    }
    return request<ChartMindResult>("/chartmind/analyze", { method: "POST", body: form });
  },
  chartMindSave(result: ChartMindResult, title?: string) {
    return request<ChartMindSaved>("/chartmind/analyses", {
      method: "POST",
      body: JSON.stringify({ title: title ?? null, result }),
    });
  },
  chartMindHistory() {
    return request<ChartMindHistoryItem[]>("/chartmind/analyses");
  },
  chartMindGet(id: number) {
    return request<ChartMindSaved>(`/chartmind/analyses/${id}`);
  },
  chartMindDelete(id: number) {
    return request<void>(`/chartmind/analyses/${id}`, { method: "DELETE" });
  },

  // Messaging
  conversation() {
    return request<Conversation>("/messages/conversation");
  },
  messages() {
    return request<Message[]>("/messages");
  },
  sendMessage(body: string) {
    return request<Message>("/messages", {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  },
  markRead() {
    return request<{ ok: boolean }>("/messages/read", { method: "POST" });
  },
  unreadCount() {
    return request<{ user: number; admin: number }>("/messages/unread-count");
  },

  // Admin
  adminStats() {
    return request<AdminStats>("/admin/stats");
  },
  adminUsers() {
    return request<User[]>("/admin/users");
  },
  adminSetUserActive(id: number, is_active: boolean) {
    return request<User>(`/admin/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ is_active }),
    });
  },
  adminApproveUser(id: number) {
    return request<User>(`/admin/users/${id}/approve`, { method: "POST" });
  },
  adminResetVerification(id: number) {
    return request<User>(`/admin/users/${id}/verification`, { method: "DELETE" });
  },
  adminPasscodes() {
    return request<Passcode[]>("/admin/passcodes");
  },
  adminCreatePasscode(body: { code: string; label: string; max_uses: number; expires_in_hours: number | null }) {
    return request<Passcode>("/admin/passcodes", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  adminRevokePasscode(id: number) {
    return request<Passcode>(`/admin/passcodes/${id}/revoke`, { method: "POST" });
  },
  adminConversations() {
    return request<Conversation[]>("/admin/conversations");
  },
  adminMessages(userId: number) {
    return request<Message[]>(`/admin/conversations/${userId}/messages`);
  },
  adminReply(userId: number, body: string) {
    return request<Message>(`/admin/conversations/${userId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  },
  adminMarkRead(userId: number) {
    return request<{ ok: boolean }>(`/admin/conversations/${userId}/read`, { method: "POST" });
  },
  adminVerificationHistory() {
    return request<
      { id: number; user_id: number; user_name: string; success: boolean; created_at: string; ip: string | null }[]
    >("/admin/verification-history");
  },
  adminModelHealth() {
    return request<{
      provider_configured: boolean;
      provider_name: string;
      model_name: string;
      model_status: string;
      last_success: string | null;
      recent_errors: number;
      prediction_count: number;
    }>("/admin/model-health");
  },
};
