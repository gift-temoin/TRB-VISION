export function isValidPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!/^\+?[0-9\s\-()]{7,20}$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length > 255) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push("at least 8 characters");
  if (!/[A-Za-z]/.test(password)) issues.push("one letter");
  if (!/[0-9]/.test(password)) issues.push("one number");
  return issues;
}

export function passwordStrength(password: string): {
  score: number;
  label: string;
  tone: "bear" | "neutral" | "bull";
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "Weak", tone: "bear" };
  if (score <= 3) return { score, label: "Fair", tone: "neutral" };
  return { score, label: "Strong", tone: "bull" };
}
