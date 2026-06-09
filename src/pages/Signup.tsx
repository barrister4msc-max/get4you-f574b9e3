import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Lock, User, ArrowRight, CheckCircle2, Phone } from "lucide-react";
import { toast } from "sonner";
import { normalizePhone } from "@/lib/phone";

type Role = "client" | "tasker" | "both";

const SignupPage = () => {
  const { t } = useLanguage();
  const { signUp } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("client");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t("auth.passwordMin"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }
    setLoading(true);
    let normalizedPhone: string | undefined = undefined;
    if (phone.trim()) {
      const res = normalizePhone(phone);
      if (!res.ok) {
        toast.error(res.error || "Invalid phone number");
        setLoading(false);
        return;
      }
      normalizedPhone = res.e164;
    }
    const { error } = await signUp(email, password, name, role, normalizedPhone, whatsappOptIn);
    setLoading(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success(t("auth.checkEmail"));
      const returnTo = searchParams.get("returnTo");
      // After successful signup the user is signed in automatically — send them
      // to their personal dashboard (or the page they came from, e.g. an application).
      navigate(returnTo || "/dashboard");
    }
  };

  const roles: { value: Role; label: string }[] = [
    { value: "client", label: t("auth.role.client") },
    { value: "tasker", label: t("auth.role.tasker") },
  ];

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-emerald flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-lg">F</span>
          </div>
          <h1 className="text-2xl font-bold">{t("auth.signup")}</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t("auth.name")}</label>
            <div className="relative">
              <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t("auth.email")}</label>
            <div className="relative">
              <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Телефон</label>
            <div className="relative">
              <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder="+972501234567"
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm rounded-xl border border-border bg-card p-3">
            <input
              type="checkbox"
              checked={whatsappOptIn}
              onChange={(e) => setWhatsappOptIn(e.target.checked)}
              className="mt-1"
            />
            <span className="flex-1">
              <span className="font-medium">{t("whatsapp.optin.label")}</span>
              <span className="block text-xs text-muted-foreground mt-1">
                {t("whatsapp.optin.helper")}
              </span>
              <ul className="mt-1 ps-4 text-xs text-muted-foreground list-disc space-y-0.5">
                <li>{t("whatsapp.optin.bullet.messages")}</li>
                <li>{t("whatsapp.optin.bullet.proposals")}</li>
                <li>{t("whatsapp.optin.bullet.payments")}</li>
              </ul>
              <span className="block text-[11px] text-muted-foreground mt-1 italic">
                {t("whatsapp.no_marketing")}
              </span>
            </span>
          </label>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t("auth.password")}</label>
            <div className="relative">
              <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t("auth.confirmPassword")}</label>
            <div className="relative">
              <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t("auth.role")}</label>
            <div className="grid grid-cols-2 gap-2">
              {roles.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-medium transition-all ${
                    role === r.value
                      ? "border-primary bg-emerald-50 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {role === r.value && <CheckCircle2 className="w-3 h-3 inline me-1" />}
                  {r.label}
                </button>
              ))}
            </div>
            {(role === "tasker" || role === "both") && (
              <div className="mt-2 p-3 rounded-xl bg-emerald-50 border border-primary/30 text-center">
                <p className="text-xs font-semibold text-primary">{t("esek.promo.title")}</p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "..." : t("auth.signup")}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t("auth.hasAccount")}{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            {t("auth.login")}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignupPage;
