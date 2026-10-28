# Deploy na Vercel

Passo a passo para publicar o Briefly na Vercel pelo navegador. Leva uns 10 minutos.

## Antes de começar

1. **Defina um teto de gasto na Anthropic.** No console da Anthropic, na seção de limites de gasto da organização, configure um limite mensal (ex.: US$ 10). É a proteção de custo que vale de verdade: o rate limit do app é por instância e não substitui esse teto.
2. **Crie uma chave de API** no mesmo console, na seção de chaves de API. Guarde o valor: ele só aparece uma vez.
3. **Escolha o modelo** na [lista oficial de modelos](https://docs.anthropic.com/en/docs/about-claude/models). O app precisa de um modelo com suporte a saída estruturada (structured outputs).

## 1. Importar o repositório

1. Em [vercel.com/new](https://vercel.com/new), clique em **Import** no repositório `briefly-br`.
2. A Vercel detecta Next.js sozinha. Não mude *Build Command*, *Output Directory* nem *Install Command*.
3. Antes de clicar em **Deploy**, abra **Environment Variables** e siga o passo 2.

> Importe o repositório **uma vez só**. Dois projetos ligados ao mesmo repositório geram dois deploys por commit, e o que estiver mal configurado deixa um status vermelho no PR.

## 2. Variáveis de ambiente

| Variável | Valor | Ambientes |
|---|---|---|
| `ANTHROPIC_API_KEY` | a chave criada no console | Production e Preview |
| `ANTHROPIC_MODEL` | o ID do modelo escolhido | Production e Preview |

Não configure estas na Vercel:

| Variável | Por quê |
|---|---|
| `BRIEFLY_MOCK_LLM` | Liga o modo demonstração (sem IA). Use só se quiser um preview sem custo; aceita `1` ou `true`. |
| `BRIEFLY_RATE_LIMIT_PER_HOUR` | Existe só para os testes e2e. Em produção o padrão (10 por hora por IP) deve ficar. |

Dicas:
- Variáveis marcadas como *Sensitive* funcionam normalmente, mas o valor não aparece mais no painel. O app ignora espaços e quebras de linha no começo e no fim do valor.
- **Variável nova ou alterada só vale para deploys novos.** Depois de mudar qualquer variável, vá em *Deployments*, abra o último deploy e clique em **Redeploy**.

## 3. Deploy e verificação

1. Clique em **Deploy** e espere o build terminar. O build não precisa de nenhuma variável; elas só são lidas quando a API é chamada.
2. Abra `https://SEU-DOMINIO.vercel.app/api/health`. O esperado em produção é:

   ```json
   { "ok": true, "mock": false, "hasApiKey": true, "hasModel": true, "commit": "abc1234" }
   ```

   O endpoint nunca devolve o valor das variáveis, só se elas existem.
3. Na página inicial, clique em **Preencher exemplo**, informe o site de uma empresa real e gere o brief. Confira:
   - a linha abaixo do título diz **"Site lido (N páginas)"**;
   - não aparece o selo **"Modo demonstração (sem IA)"**;
   - cada fato sobre a empresa aparece em **Fontes**, com link para a página de onde saiu.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "O servidor não está configurado corretamente" | Falta `ANTHROPIC_API_KEY` ou `ANTHROPIC_MODEL` no ambiente, ou a chave é inválida, ou o ID do modelo não existe | Veja `/api/health`; corrija a variável e faça Redeploy. O log da função (*Deployments > Logs*) diz qual variável |
| `/api/health` mostra `hasApiKey: false` logo após configurar | O deploy é anterior à variável | Redeploy |
| "O serviço de IA falhou ao gerar o brief" | Erro ou indisponibilidade da API da Anthropic, ou saída inválida duas vezes seguidas | Tente de novo; se repetir, veja o log da função |
| "Não foi possível ler o site (…)" | O site bloqueou o robô, demorou mais de 8 s, não é HTML ou depende de JavaScript para mostrar conteúdo | O brief sai mesmo assim, com confiança baixa. É uma limitação conhecida |
| "O servidor demorou demais para responder" | A função passou de 60 s (modelo lento + nova tentativa) | Tente de novo; se for frequente, use um modelo mais rápido |
| Preview pede login da Vercel | *Deployment Protection* ligada nos previews | Normal. Abra logado na Vercel, ou desligue em *Settings > Deployment Protection* |
