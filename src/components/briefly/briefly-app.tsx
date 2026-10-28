"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, WandSparklesIcon } from "lucide-react";

import { BriefResult, BriefSkeleton } from "@/components/briefly/brief-result";
import { OfferPanel } from "@/components/briefly/offer-panel";
import { ProspectForm } from "@/components/briefly/prospect-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, requestBrief } from "@/lib/api-client";
import { EXAMPLE_OFFER, EXAMPLE_PROSPECT } from "@/lib/examples";
import { saveProfile, useOfferProfiles } from "@/lib/offer-profiles";
import {
  OfferSchema,
  ProspectSchema,
  type BriefRequestInput,
  type BriefResponse,
  type Prospect,
  type ProspectInput,
} from "@/lib/schemas";

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: BriefResponse; companyName: string }
  | { status: "error"; title: string; message: string };

const EMPTY_PROSPECT: ProspectInput = {
  companyName: "",
  website: "",
  contactName: "",
  contactRole: "",
  industry: "",
  notes: "",
};

const PROSPECT_FIELDS = new Set(Object.keys(EMPTY_PROSPECT));

export function BrieflyApp() {
  const { profiles, active } = useOfferProfiles();
  const [editingOffer, setEditingOffer] = useState(false);
  const [view, setView] = useState<ViewState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const prospectForm = useForm<ProspectInput, unknown, Prospect>({
    resolver: zodResolver(ProspectSchema),
    defaultValues: EMPTY_PROSPECT,
  });

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (view.status === "success" || view.status === "error") {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [view.status]);

  const fillExample = () => {
    const existing = profiles.find((profile) => profile.offer.productName === EXAMPLE_OFFER.productName);
    saveProfile(EXAMPLE_OFFER, existing?.id);
    setEditingOffer(false);
    prospectForm.reset(EXAMPLE_PROSPECT);
    setView({ status: "idle" });
  };

  const generate = async (prospect: Prospect) => {
    const offer = active ? OfferSchema.safeParse(active.offer) : null;
    if (!offer?.success) {
      setEditingOffer(true);
      setView({
        status: "error",
        title: "Falta a sua oferta",
        message: "Preencha e salve o painel \"Minha oferta\" antes de gerar o brief.",
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setView({ status: "loading" });

    const body: BriefRequestInput = { offer: offer.data, prospect };
    try {
      const result = await requestBrief(body, controller.signal);
      setView({ status: "success", result, companyName: prospect.companyName });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError) {
        let message = err.message;
        for (const detail of err.details ?? []) {
          const [scope, field] = detail.path.split(".");
          if (scope === "prospect" && PROSPECT_FIELDS.has(field)) {
            prospectForm.setError(field as keyof ProspectInput, { message: detail.message });
          } else if (scope === "offer") {
            setEditingOffer(true);
            message = "Revise os campos do painel \"Minha oferta\".";
          }
        }
        setView({ status: "error", title: "Não foi possível gerar o brief", message });
      } else {
        setView({ status: "error", title: "Erro inesperado", message: "Tente de novo em instantes." });
      }
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Briefly</h1>
          <p className="text-muted-foreground max-w-xl text-sm sm:text-base">
            Brief de abordagem para SDRs em segundos: ângulo, ganchos, objeções, perguntas e script, só com fatos que
            você informou ou que estão no site do prospect.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={fillExample} className="self-start sm:self-auto">
          <WandSparklesIcon />
          Preencher exemplo
        </Button>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="grid gap-6">
          <OfferPanel editing={editingOffer} onEditingChange={setEditingOffer} />
          <ProspectForm form={prospectForm} loading={view.status === "loading"} onSubmit={generate} />
        </div>

        <div ref={resultRef} className="grid scroll-mt-4 gap-4">
          {view.status === "idle" ? <EmptyState /> : null}
          {view.status === "loading" ? <BriefSkeleton /> : null}
          {view.status === "error" ? (
            <Alert variant="destructive" data-testid="brief-error">
              <AlertCircleIcon />
              <AlertTitle>{view.title}</AlertTitle>
              <AlertDescription>{view.message}</AlertDescription>
            </Alert>
          ) : null}
          {view.status === "success" ? <BriefResult result={view.result} companyName={view.companyName} /> : null}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm sm:p-10">
      <p className="text-foreground font-medium">Como funciona</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>Cadastre sua oferta uma vez (fica salva neste navegador).</li>
        <li>Informe o prospect e, se tiver, o site dele.</li>
        <li>Receba ângulo, ganchos, objeções, perguntas e um microscript, com as fontes de cada fato.</li>
      </ol>
    </div>
  );
}
