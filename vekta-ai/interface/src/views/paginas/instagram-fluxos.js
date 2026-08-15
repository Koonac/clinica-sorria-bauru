/* Página exclusiva: builder de fluxos Instagram (tela cheia + zoom). */
import { carregarPaginaFluxos } from "./instagram-automacao.js";

export async function iniciar() {
  await carregarPaginaFluxos();
}

export async function atualizar() {
  return iniciar();
}
