"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/features/auth/components/field";
import { messageForAuthError } from "@/features/auth/core/messages";
import { AUTH_PATHS } from "@/features/auth/core/policy";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | undefined>();

  async function onClick() {
    if (pending) return;
    setServerError(undefined);
    setPending(true);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setServerError(messageForAuthError(error));
        setPending(false);
        return;
      }
      router.push(AUTH_PATHS.signIn);
      router.refresh();
    } catch {
      setServerError(messageForAuthError({}));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <FormAlert message={serverError} />
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={onClick}
      >
        Se déconnecter
      </Button>
    </div>
  );
}
