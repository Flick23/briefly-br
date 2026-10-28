"use client";

import { ExternalLinkIcon } from "lucide-react";

import { CopyButton } from "@/components/briefly/copy-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  briefToText,
  CONFIDENCE_LABELS,
  SECTION_KEYS,
  SECTION_TITLES,
  sectionToText,
  SITE_ERROR_LABELS,
  sourceLabel,
  type SectionKey,
} from "@/lib/brief-format";
import type { Brief, BriefResponse, Confidence } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  alta: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  media: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  baixa: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
};

function siteStatusText(meta: BriefResponse["meta"]): string {
  if (meta.site === "ok") {
    const count = meta.pages.length;
    return `Site lido (${count} ${count === 1 ? "página" : "páginas"}).`;
  }
  if (meta.site === "skipped") return "Sem site informado: o brief usa só os seus dados.";
  const reason = meta.siteError ? SITE_ERROR_LABELS[meta.siteError] : "motivo desconhecido";
  return `Não foi possível ler o site (${reason}). O brief usa só os seus dados.`;
}

function SectionBody({ brief, section }: { brief: Brief; section: SectionKey }) {
  switch (section) {
    case "hooks":
    case "discoveryQuestions":
      return (
        <ol className="list-decimal space-y-1.5 pl-5">
          {brief[section].map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      );
    case "likelyObjections":
      return (
        <ul className="space-y-3">
          {brief.likelyObjections.map((item, index) => (
            <li key={index}>
              <p className="font-medium">{item.objection}</p>
              <p className="text-muted-foreground">{item.response}</p>
            </li>
          ))}
        </ul>
      );
    case "sources":
      if (!brief.sources.length) return <p className="text-muted-foreground">Nenhuma fonte citada.</p>;
      return (
        <ul className="space-y-2">
          {brief.sources.map((source, index) => (
            <li key={index} className="break-words">
              <span>{source.claim}</span>{" "}
              {/^https?:\/\//.test(source.url) ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-primary inline-flex items-center gap-1 underline underline-offset-2"
                >
                  {source.url}
                  <ExternalLinkIcon className="size-3" aria-hidden="true" />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
              ) : (
                <span className="text-muted-foreground">({sourceLabel(source.url)})</span>
              )}
            </li>
          ))}
        </ul>
      );
    case "microScript":
      return <p className="bg-muted rounded-md p-3 whitespace-pre-line">{brief.microScript}</p>;
    default:
      return <p className="whitespace-pre-line">{brief[section]}</p>;
  }
}

const WIDE_SECTIONS: SectionKey[] = ["summary", "microScript", "sources"];

export function BriefResult({ result, companyName }: { result: BriefResponse; companyName: string }) {
  const { brief, meta } = result;

  return (
    <section aria-labelledby="brief-title" className="grid gap-4" data-testid="brief-result">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id="brief-title" className="text-xl">
              Brief: {companyName}
            </h2>
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <Badge className={cn("border-transparent", CONFIDENCE_STYLES[brief.confidence])} data-testid="confidence">
              {CONFIDENCE_LABELS[brief.confidence]}
            </Badge>
            {meta.mock ? <Badge variant="outline">Modo demonstração (sem IA)</Badge> : null}
            <span data-testid="site-status">{siteStatusText(meta)}</span>
          </CardDescription>
          <CardAction>
            <CopyButton variant="default" label="brief completo" getText={() => briefToText(brief, companyName)}>
              Copiar tudo
            </CopyButton>
          </CardAction>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTION_KEYS.map((section) => (
          <Card
            key={section}
            className={cn("gap-3", WIDE_SECTIONS.includes(section) && "md:col-span-2")}
            aria-labelledby={`section-${section}`}
          >
            <CardHeader>
              <CardTitle>
                <h3 id={`section-${section}`} className="text-base">
                  {SECTION_TITLES[section]}
                </h3>
              </CardTitle>
              <CardAction>
                <CopyButton
                  label={SECTION_TITLES[section].toLowerCase()}
                  getText={() => sectionToText(brief, section)}
                />
              </CardAction>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed">
              <SectionBody brief={brief} section={section} />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function BriefSkeleton() {
  return (
    <section aria-busy="true" aria-live="polite" className="grid gap-4" data-testid="brief-loading">
      <p className="text-muted-foreground text-sm">Lendo o site e gerando o brief. Pode levar até um minuto.</p>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardContent className="grid gap-2">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
