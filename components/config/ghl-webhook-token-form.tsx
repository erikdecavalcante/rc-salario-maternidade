"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SetWebhookTokenState } from "@/app/(dashboard)/configuracoes/actions";

type Action = (prev: SetWebhookTokenState, formData: FormData) => Promise<SetWebhookTokenState>;

/** Genérico pra qualquer token de webhook por etapa do GHL — recebe a action
 * certa via prop em vez de importar uma fixa, pra não duplicar este arquivo
 * pra cada etapa (lead_qualificado, contrato_assinado). */
export function GhlWebhookTokenForm({ action, idSuffix }: { action: Action; idSuffix: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const inputId = `ghl-token-${idSuffix}`;

  return (
    <form action={formAction} className="space-y-2">
      <Label htmlFor={inputId}>Definir token manualmente</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          name="token"
          placeholder="Cole um token customizado (mín. 16 caracteres)"
          className="flex-1 font-mono text-xs"
          autoComplete="off"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending} className="shrink-0">
          {pending ? "Salvando..." : "Salvar token"}
        </Button>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
