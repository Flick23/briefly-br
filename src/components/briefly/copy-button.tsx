"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback para contextos sem a Clipboard API (ex.: http, permissões negadas).
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({
  getText,
  label,
  children,
  variant = "ghost",
}: {
  getText: () => string;
  label: string;
  children?: React.ReactNode;
  variant?: "ghost" | "outline" | "default";
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const text = state === "copied" ? "Copiado" : state === "failed" ? "Falhou" : (children ?? "Copiar");

  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      aria-label={state === "copied" ? `${label} copiado` : `Copiar ${label}`}
      onClick={async () => setState((await copyText(getText())) ? "copied" : "failed")}
    >
      {state === "copied" ? <CheckIcon /> : <CopyIcon />}
      <span aria-live="polite">{text}</span>
    </Button>
  );
}
