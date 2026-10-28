"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Field, fieldA11y } from "@/components/briefly/field";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteProfile,
  saveProfile,
  setActiveProfile,
  useOfferProfiles,
  type OfferProfile,
} from "@/lib/offer-profiles";
import { LIMITS, OfferSchema, type Offer, type OfferInput } from "@/lib/schemas";

const LANGUAGE_LABELS: Record<NonNullable<OfferInput["language"]>, string> = {
  "pt-BR": "Português (Brasil)",
  en: "Inglês",
  es: "Espanhol",
};

const EMPTY_OFFER: OfferInput = {
  productName: "",
  valueProposition: "",
  icp: "",
  differentiators: [],
  commonObjections: [],
  language: "pt-BR",
};

/** Painel "Minha oferta": o SDR cadastra a oferta uma vez e alterna entre perfis. */
export function OfferPanel({
  editing,
  onEditingChange,
}: {
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const { profiles, active } = useOfferProfiles();
  // Sem nenhum perfil, o formulário fica sempre aberto.
  const showForm = editing || !active;

  return (
    <Card aria-labelledby="offer-title">
      <CardHeader>
        <CardTitle id="offer-title" className="text-lg">
          Minha oferta
        </CardTitle>
        <CardDescription>O que você vende. Preencha uma vez; fica salvo neste navegador.</CardDescription>
        {active && !showForm ? (
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={() => onEditingChange(true)}>
              <PencilIcon />
              Editar
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {profiles.length > 0 ? (
          <ProfilePicker
            profiles={profiles}
            activeId={active?.id ?? null}
            onSelect={(id) => {
              setActiveProfile(id);
              onEditingChange(false);
            }}
            onNew={() => {
              setActiveProfile(null);
              onEditingChange(true);
            }}
          />
        ) : null}

        {showForm ? (
          <OfferForm
            // Remonta o formulário ao trocar de perfil, carregando os valores certos.
            key={editing && active ? active.id : "new"}
            profile={editing ? active : null}
            onSaved={() => onEditingChange(false)}
            onCancel={active ? () => onEditingChange(false) : undefined}
          />
        ) : active ? (
          <OfferSummary profile={active} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProfilePicker({
  profiles,
  activeId,
  onSelect,
  onNew,
}: {
  profiles: OfferProfile[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="grid flex-1 gap-1.5">
        <label htmlFor="offer-profile" className="text-sm font-medium">
          Perfil ativo
        </label>
        <NativeSelect id="offer-profile" value={activeId ?? ""} onChange={(event) => onSelect(event.target.value)}>
          {activeId === null ? <option value="">Nova oferta (não salva)</option> : null}
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.offer.productName || "Sem nome"}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={onNew}>
          <PlusIcon />
          Nova oferta
        </Button>
        {activeId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            aria-label="Excluir perfil ativo"
            onClick={() => {
              if (window.confirm("Excluir este perfil de oferta?")) deleteProfile(activeId);
            }}
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function OfferSummary({ profile }: { profile: OfferProfile }) {
  const { offer } = profile;
  return (
    <dl className="grid gap-2 text-sm" data-testid="offer-summary">
      <div>
        <dt className="text-muted-foreground text-xs">Produto ou serviço</dt>
        <dd className="font-medium">{offer.productName}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Proposta de valor</dt>
        <dd className="line-clamp-2">{offer.valueProposition}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Idioma do brief</dt>
        <dd>{LANGUAGE_LABELS[offer.language ?? "pt-BR"]}</dd>
      </div>
    </dl>
  );
}

/** Lista editada como uma linha por item; o schema descarta linhas vazias. */
function LinesTextarea({
  value,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value: string[] | undefined;
  onChange: (value: string[]) => void;
}) {
  return (
    <Textarea
      {...props}
      value={(value ?? []).join("\n")}
      onChange={(event) => onChange(event.target.value.split("\n"))}
    />
  );
}

function OfferForm({
  profile,
  onSaved,
  onCancel,
}: {
  profile: OfferProfile | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<OfferInput, unknown, Offer>({
    resolver: zodResolver(OfferSchema),
    defaultValues: profile?.offer ?? EMPTY_OFFER,
  });

  const listError = (field: "differentiators" | "commonObjections") => {
    const error = errors[field];
    if (!error) return undefined;
    if (error.message) return error.message;
    return Array.isArray(error) ? error.find(Boolean)?.message : undefined;
  };

  const onSubmit = (offer: Offer) => {
    saveProfile(offer, profile?.id);
    onSaved();
  };

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Formulário da oferta">
      <Field id="offer-productName" label="Produto ou serviço" required error={errors.productName?.message}>
        <Input
          {...fieldA11y("offer-productName", errors.productName?.message)}
          placeholder="Ex.: Plataforma de agendamento"
          maxLength={LIMITS.shortText}
          {...register("productName")}
        />
      </Field>

      <Field
        id="offer-valueProposition"
        label="Proposta de valor"
        required
        hint="Que resultado o cliente tem, em uma ou duas frases."
        error={errors.valueProposition?.message}
      >
        <Textarea
          {...fieldA11y("offer-valueProposition", errors.valueProposition?.message, "hint")}
          rows={2}
          maxLength={LIMITS.longText}
          {...register("valueProposition")}
        />
      </Field>

      <Field
        id="offer-icp"
        label="ICP (cliente ideal)"
        required
        hint="Porte, segmento, cargo de quem compra, contexto típico."
        error={errors.icp?.message}
      >
        <Textarea
          {...fieldA11y("offer-icp", errors.icp?.message, "hint")}
          rows={2}
          maxLength={LIMITS.longText}
          {...register("icp")}
        />
      </Field>

      <Field
        id="offer-differentiators"
        label="Diferenciais"
        hint="Um por linha."
        error={listError("differentiators")}
      >
        <Controller
          control={control}
          name="differentiators"
          render={({ field }) => (
            <LinesTextarea
              {...fieldA11y("offer-differentiators", listError("differentiators"), "hint")}
              rows={3}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
            />
          )}
        />
      </Field>

      <Field
        id="offer-commonObjections"
        label="Objeções comuns"
        hint="Uma por linha."
        error={listError("commonObjections")}
      >
        <Controller
          control={control}
          name="commonObjections"
          render={({ field }) => (
            <LinesTextarea
              {...fieldA11y("offer-commonObjections", listError("commonObjections"), "hint")}
              rows={3}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
            />
          )}
        />
      </Field>

      <Field id="offer-language" label="Idioma do brief" error={errors.language?.message}>
        <NativeSelect {...fieldA11y("offer-language", errors.language?.message)} {...register("language")}>
          {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="submit">Salvar oferta</Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
