"use client";

import { useCallback, useState } from "react";
import { motion } from "motion/react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLogin } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

// =============================================================================
// LoginComponent
// =============================================================================

/** The fixed messages of cgi-bin/authenticate and useLogin, translated:
 *  `common:login.errors.<key>`. Anything else is shown as it comes. */
const LOGIN_ERRORS: Record<string, string> = {
  "Invalid username or password": "invalid_credentials",
  "Missing credentials": "missing_credentials",
  "GUI locked": "gui_locked",
  "Login failed": "failed",
  "Connection failed": "connection_failed",
};

export default function LoginComponent() {
  const { t } = useTranslation("common");
  const { status, login } = useLogin();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  /** A message from the CGI, or "" */
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setIsSubmitting(true);
      try {
        const result = await login(username, password);
        if (!result.success) {
          setError(result.error || "Invalid username or password");
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [username, password, login]
  );

  // Show spinner while checking for an existing session
  if (status === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-16 p-1 items-center justify-center rounded-md">
              <img
                src="/simple-t99-icon.png"
                alt={t("login.logo_alt")}
                className="size-full"
              />
            </div>
            <h1 className="text-xl font-bold">{t("login.title")}</h1>
            <FieldDescription>
              {t("login.description")}
            </FieldDescription>
          </div>

          <Field>
            <FieldLabel htmlFor="username">{t("login.username")}</FieldLabel>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">{t("login.password")}</FieldLabel>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={t("login.password_placeholder")}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? t("login.hide_password") : t("login.show_password")}
              >
                {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </Button>
            </div>
          </Field>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {LOGIN_ERRORS[error] ? t(`login.errors.${LOGIN_ERRORS[error]}`) : error}
            </p>
          )}

          <Field>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner className="mr-2" />
                  {t("login.submitting")}
                </>
              ) : (
                t("login.submit")
              )}
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        {t("login.footer")}
      </FieldDescription>
    </motion.div>
  );
}
