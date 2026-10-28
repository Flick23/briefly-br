import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { getAnthropicConfig, isMockEnabled, type Env } from "@/lib/env";
import { ConfigError, ProviderError } from "@/lib/errors";
import { BriefSchema, INPUT_SOURCE, type Brief, type BriefRequest } from "@/lib/schemas";
import type { SitePage } from "@/lib/site-fetcher";

/**
 * Cliente de LLM isolado do resto do app. O serviço só conhece a interface
 * `LlmClient`; trocar de provedor ou usar o mock não muda mais nada.
 */

export interface LlmRequest {
  system: string;
  user: string;
  /** Contexto estruturado — usado só pelo mock para montar uma resposta coerente. */
  context: { input: BriefRequest; pages: SitePage[] };
}

export interface LlmClient {
  readonly mock: boolean;
  /** Retorna o texto bruto (JSON) gerado pelo modelo. A validação fica com o serviço. */
  generate(request: LlmRequest): Promise<string>;
}

export function createLlmClient(env: Env = process.env): LlmClient {
  // O mock tem prioridade: com ele ligado, chave e modelo não são exigidos.
  if (isMockEnabled(env)) return new MockLlmClient();

  const { apiKey, model } = getAnthropicConfig(env);
  if (!apiKey) throw new ConfigError("ANTHROPIC_API_KEY não definida. Configure a variável de ambiente.");
  if (!model) throw new ConfigError("ANTHROPIC_MODEL não definida. Configure a variável de ambiente.");

  return new AnthropicLlmClient(new Anthropic({ apiKey, timeout: 50_000, maxRetries: 1 }), model);
}

const OUTPUT_FORMAT = zodOutputFormat(BriefSchema);

export class AnthropicLlmClient implements LlmClient {
  readonly mock = false;

  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
  ) {}

  async generate({ system, user }: LlmRequest): Promise<string> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 16_000,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { format: OUTPUT_FORMAT },
      });
    } catch (err) {
      throw mapProviderError(err, this.model);
    }

    if (response.stop_reason === "refusal") {
      throw new ProviderError(`O modelo recusou a solicitação (stop_reason=refusal)`);
    }

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  }
}

function mapProviderError(err: unknown, model: string): Error {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ConfigError(`ANTHROPIC_API_KEY inválida ou sem permissão (HTTP ${err.status})`, { cause: err });
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new ConfigError(`Modelo "${model}" não encontrado. Confira ANTHROPIC_MODEL.`, { cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError(`Erro da API Anthropic (HTTP ${err.status ?? "sem status"}): ${err.message}`, {
      cause: err,
    });
  }
  return new ProviderError(`Falha ao chamar a API Anthropic: ${err instanceof Error ? err.message : String(err)}`, {
    cause: err,
  });
}

/**
 * Mock determinístico, ativado com BRIEFLY_MOCK_LLM=1 (ou "true"). Usa só os dados da
 * entrada e as URLs realmente buscadas, sem inventar fatos.
 */
export class MockLlmClient implements LlmClient {
  readonly mock = true;

  async generate({ context }: LlmRequest): Promise<string> {
    const { offer, prospect } = context.input;
    const company = prospect.companyName;
    const contact = prospect.contactName ?? "o responsável";
    const firstObjection = offer.commonObjections?.[0] ?? "Já temos uma solução para isso";
    const differentiator = offer.differentiators?.[0] ?? offer.valueProposition;

    const sources: Brief["sources"] = [{ claim: `Empresa: ${company}`, url: INPUT_SOURCE }];
    if (prospect.industry) sources.push({ claim: `Segmento: ${prospect.industry}`, url: INPUT_SOURCE });
    for (const page of context.pages) {
      sources.push({ claim: `Conteúdo público consultado em ${page.url}`, url: page.url });
    }

    const brief: Brief = {
      summary: `${company}${prospect.industry ? `, do segmento ${prospect.industry},` : ""} é o prospect deste brief. [modo demonstração: resposta gerada sem IA]`,
      fitHypothesis: `Se ${company} se parece com o ICP descrito (${offer.icp}), ${offer.productName} pode ajudar: ${offer.valueProposition}`,
      angle: `Abrir pela proposta de valor de ${offer.productName} e validar se o problema existe hoje em ${company}.`,
      hooks: [
        `Como ${company} lida hoje com o problema que ${offer.productName} resolve?`,
        `Um ponto que costuma pesar para empresas no perfil de ${company}: ${differentiator}`,
        `Vale 15 minutos para comparar o cenário atual de ${company} com o que ${offer.productName} entrega?`,
      ],
      likelyObjections: [
        {
          objection: firstObjection,
          response: `Entendo. A ideia não é trocar nada agora, e sim checar se ${differentiator} faz diferença no cenário de vocês.`,
        },
      ],
      discoveryQuestions: [
        `Quem participa hoje da decisão sobre esse tema em ${company}?`,
        "Qual é a prioridade desse assunto para os próximos meses?",
        "Como vocês medem se o processo atual está funcionando?",
      ],
      nextStep: `Propor a ${contact} uma conversa de 15 minutos para diagnóstico.`,
      microScript: `Oi, ${contact}! Trabalho com ${offer.productName}. ${offer.valueProposition} Faz sentido conversarmos 15 minutos esta semana?`,
      sources,
      confidence: context.pages.length ? "media" : "baixa",
    };
    return JSON.stringify(brief);
  }
}
