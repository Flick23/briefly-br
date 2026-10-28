import { connection } from "next/server";

import { getHealth } from "@/lib/env";

/**
 * Diagnóstico de configuração. Retorna só booleanos e o commit curto.
 * `connection()` impede que o Next pré-renderize a rota no build, o que
 * congelaria as variáveis de ambiente do momento do build.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(getHealth(), { headers: { "Cache-Control": "no-store" } });
}
