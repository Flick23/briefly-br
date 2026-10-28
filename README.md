# briefly-br

AI outbound prospecting brief generator

> Em construção. O README completo (problema, arquitetura, decisões técnicas, como rodar) entra na Fase 4.

## Limitações conhecidas

- **Rate limit por instância.** O limite de 10 briefs por hora por IP fica em memória. Na Vercel, cada instância serverless tem a própria contagem, então o limite efetivo pode passar de 10/h. Para um projeto de portfólio isso basta; em produção com tráfego real, o caminho é um store compartilhado (ex.: Redis), mantendo a mesma interface de `src/lib/rate-limit.ts`.
- **A proteção de custo de verdade é o limite de gasto da conta na Anthropic.** Configure um teto de gasto mensal no console da Anthropic antes de publicar o app.
