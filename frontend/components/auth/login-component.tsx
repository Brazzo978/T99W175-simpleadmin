"use client";

import { useCallback, useState } from "react";
import { motion } from "motion/react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
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

export default function LoginComponent() {
  const { status, login } = useLogin();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
          setError(result.error || "Invalid username or password.");
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
                alt="Simple T99 Logo"
                className="size-full"
              />
            </div>
            <h1 className="text-xl font-bold">Sign in to Simple T99</h1>
            <FieldDescription>
              Enter your SimpleAdmin credentials to continue.
            </FieldDescription>
          </div>

          <Field>
            <FieldLabel htmlFor="username">Username</FieldLabel>
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
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
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
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </Button>
            </div>
          </Field>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
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
                  Logging in...
                </>
              ) : (
                "Login"
              )}
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        Simple T99 — Foxconn T99W175 Management
      </FieldDescription>
    </motion.div>
  );
}
