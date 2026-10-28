"use client";

import type { UseFormReturn } from "react-hook-form";
import { Loader2Icon, SparklesIcon } from "lucide-react";

import { Field, fieldA11y } from "@/components/briefly/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS, type Prospect, type ProspectInput } from "@/lib/schemas";

export type ProspectFormApi = UseFormReturn<ProspectInput, unknown, Prospect>;

/** Formulário do prospect. O `useForm` vive no componente pai (para o "preencher exemplo"). */
export function ProspectForm({
  form,
  loading,
  onSubmit,
}: {
  form: ProspectFormApi;
  loading: boolean;
  onSubmit: (prospect: Prospect) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  return (
    <Card aria-labelledby="prospect-title">
      <CardHeader>
        <CardTitle id="prospect-title" className="text-lg">
          Prospect
        </CardTitle>
        <CardDescription>Para quem é a abordagem. Só o nome da empresa é obrigatório.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Formulário do prospect">
          <Field id="prospect-companyName" label="Empresa" required error={errors.companyName?.message}>
            <Input
              {...fieldA11y("prospect-companyName", errors.companyName?.message)}
              maxLength={LIMITS.shortText}
              autoComplete="organization"
              {...register("companyName")}
            />
          </Field>

          <Field
            id="prospect-website"
            label="Site"
            hint="Com ou sem https://. Sem site, o brief usa só os seus dados."
            error={errors.website?.message}
          >
            <Input
              {...fieldA11y("prospect-website", errors.website?.message, "hint")}
              inputMode="url"
              autoComplete="url"
              placeholder="empresa.com.br"
              {...register("website")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="prospect-contactName" label="Nome do contato" error={errors.contactName?.message}>
              <Input
                {...fieldA11y("prospect-contactName", errors.contactName?.message)}
                maxLength={LIMITS.shortText}
                {...register("contactName")}
              />
            </Field>
            <Field id="prospect-contactRole" label="Cargo do contato" error={errors.contactRole?.message}>
              <Input
                {...fieldA11y("prospect-contactRole", errors.contactRole?.message)}
                maxLength={LIMITS.shortText}
                {...register("contactRole")}
              />
            </Field>
          </div>

          <Field id="prospect-industry" label="Segmento" error={errors.industry?.message}>
            <Input
              {...fieldA11y("prospect-industry", errors.industry?.message)}
              maxLength={LIMITS.shortText}
              {...register("industry")}
            />
          </Field>

          <Field
            id="prospect-notes"
            label="Observações"
            hint="O que você já sabe: gatilho, contexto, conversa anterior."
            error={errors.notes?.message}
          >
            <Textarea
              {...fieldA11y("prospect-notes", errors.notes?.message, "hint")}
              rows={3}
              maxLength={LIMITS.notes}
              {...register("notes")}
            />
          </Field>

          <Button type="submit" size="lg" disabled={loading} className="w-full sm:w-auto">
            {loading ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {loading ? "Gerando brief…" : "Gerar brief"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
