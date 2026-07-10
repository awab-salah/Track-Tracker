import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { MobileLayout } from "@/layouts/MobileLayout";
import { SegmentedControl } from "@/components/SegmentedControl";
import { AppInput } from "@/components/AppInput";
import { AppButton } from "@/components/AppButton";
import { Logo } from "@/components/Logo";
import { driverSignIn, driverSignUp, sendPasswordReset } from "@/lib/auth";

interface LoginFormValues {
  email: string;
  password: string;
}

interface RegisterFormValues {
  fullName: string;
  email: string;
  password: string;
  vehicleNumber: string;
  joinCode: string;
}

interface ForgotFormValues {
  email: string;
}

type Mode = "login" | "register" | "forgot";

export default function DriverAuth() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const loginForm = useForm<LoginFormValues>();
  const registerForm = useForm<RegisterFormValues>();
  const forgotForm = useForm<ForgotFormValues>();

  const onLogin = loginForm.handleSubmit(async (data) => {
    setFormError("");
    setIsSubmitting(true);
    const result = await driverSignIn(data.email, data.password);
    setIsSubmitting(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setLocation("/driver-dashboard");
  });

  const onRegister = registerForm.handleSubmit(async (data) => {
    setFormError("");
    setIsSubmitting(true);
    const result = await driverSignUp(
      data.email,
      data.password,
      data.fullName,
      data.vehicleNumber,
      data.joinCode
    );
    setIsSubmitting(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setLocation("/driver-dashboard");
  });

  const onForgot = forgotForm.handleSubmit(async (data) => {
    setFormError("");
    setIsSubmitting(true);
    const result = await sendPasswordReset(data.email);
    setIsSubmitting(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setForgotSent(true);
  });

  const handleModeChange = (val: string) => {
    setMode(val as Mode);
    setFormError("");
    setForgotSent(false);
  };

  return (
    <MobileLayout>
      <div className="flex flex-col flex-1 p-6 relative z-10">

        {/* ── Header ── */}
        <header className="flex items-center justify-between mb-8">
          <button
            onClick={() => (mode === "forgot" ? setMode("login") : setLocation("/"))}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            data-testid="btn-back"
          >
            <ArrowRight size={24} className="text-foreground" />
          </button>

          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xl tracking-tight leading-none">
              <span style={{ color: "#0D3B4A" }}>Track</span>
              <span style={{ color: "#C97A56" }}>Tracker</span>
            </span>
            <Logo size="xs" showText={false} />
          </div>
        </header>

        {/* Page title */}
        <h2 className="text-3xl font-extrabold text-foreground mb-6">
          {mode === "forgot" ? "استعادة كلمة المرور" : "أهلاً بك سائقنا"}
        </h2>

        {/* Segmented control — only for login / register */}
        {mode !== "forgot" && (
          <div className="mb-8">
            <SegmentedControl
              options={[
                { label: "تسجيل الدخول", value: "login" },
                { label: "إنشاء حساب", value: "register" },
              ]}
              value={mode}
              onChange={handleModeChange}
            />
          </div>
        )}

        {/* Form area */}
        <div className="flex-1 relative">
          <AnimatePresence mode="wait">

            {/* ── Login ── */}
            {mode === "login" && (
              <motion.div
                key="login"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full flex flex-col gap-6"
              >
                <form onSubmit={onLogin} className="flex flex-col gap-5 w-full">
                  <AppInput
                    {...loginForm.register("email", { required: true })}
                    type="email"
                    placeholder="البريد الإلكتروني"
                    data-testid="input-login-email"
                  />
                  <AppInput
                    {...loginForm.register("password", { required: true })}
                    type="password"
                    placeholder="كلمة المرور"
                    data-testid="input-login-password"
                  />

                  <AnimatePresence>
                    {formError && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-sm text-red-500 font-medium text-center"
                        data-testid="text-login-error"
                      >
                        {formError}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <AppButton
                    type="submit"
                    className="mt-2"
                    disabled={isSubmitting}
                    data-testid="btn-login-submit"
                  >
                    {isSubmitting ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
                  </AppButton>
                </form>

                {/* Forgot password link */}
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setFormError(""); }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center mt-1"
                  data-testid="btn-forgot-password"
                >
                  نسيت كلمة المرور؟
                </button>
              </motion.div>
            )}

            {/* ── Register ── */}
            {mode === "register" && (
              <motion.div
                key="register"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full flex flex-col gap-6"
              >
                <form onSubmit={onRegister} className="flex flex-col gap-5 w-full">
                  <AppInput
                    {...registerForm.register("fullName", { required: true })}
                    type="text"
                    placeholder="الاسم الكامل"
                    data-testid="input-register-name"
                  />
                  <AppInput
                    {...registerForm.register("email", { required: true })}
                    type="email"
                    placeholder="البريد الإلكتروني"
                    data-testid="input-register-email"
                  />
                  <AppInput
                    {...registerForm.register("password", { required: true, minLength: 6 })}
                    type="password"
                    placeholder="كلمة المرور"
                    hint="6 أحرف على الأقل"
                    data-testid="input-register-password"
                  />
                  <AppInput
                    {...registerForm.register("vehicleNumber", { required: true })}
                    type="text"
                    placeholder="رقم السيارة"
                    data-testid="input-register-vehicle-number"
                  />
                  <AppInput
                    {...registerForm.register("joinCode", { required: true })}
                    type="text"
                    placeholder="رمز الانضمام"
                    hint="يتم توفيره من قبل صاحب الشركة"
                    data-testid="input-register-joincode"
                  />

                  <AnimatePresence>
                    {formError && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-sm text-red-500 font-medium text-center"
                        data-testid="text-register-error"
                      >
                        {formError}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <AppButton
                    type="submit"
                    className="mt-2"
                    disabled={isSubmitting}
                    data-testid="btn-register-submit"
                  >
                    {isSubmitting ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
                  </AppButton>
                </form>
              </motion.div>
            )}

            {/* ── Forgot Password ── */}
            {mode === "forgot" && (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full flex flex-col gap-6"
              >
                {forgotSent ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-4 py-8 text-center"
                  >
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
                      style={{ background: 'rgba(13,59,74,0.08)' }}>
                      ✉️
                    </div>
                    <p className="text-foreground font-bold text-lg">تم الإرسال!</p>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.
                      يرجى التحقق من صندوق الوارد.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setMode("login"); setForgotSent(false); }}
                      className="text-sm font-semibold mt-2"
                      style={{ color: '#0D3B4A' }}
                    >
                      العودة لتسجيل الدخول
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={onForgot} className="flex flex-col gap-5 w-full">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      أدخل بريدك الإلكتروني وسنرسل لك رابطاً لاستعادة كلمة المرور.
                    </p>
                    <AppInput
                      {...forgotForm.register("email", { required: true })}
                      type="email"
                      placeholder="البريد الإلكتروني"
                      data-testid="input-forgot-email"
                    />

                    <AnimatePresence>
                      {formError && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-sm text-red-500 font-medium text-center"
                        >
                          {formError}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <AppButton
                      type="submit"
                      className="mt-2"
                      disabled={isSubmitting}
                      data-testid="btn-forgot-submit"
                    >
                      {isSubmitting ? "جارٍ الإرسال..." : "إرسال رابط الاستعادة"}
                    </AppButton>
                  </form>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </MobileLayout>
  );
}
