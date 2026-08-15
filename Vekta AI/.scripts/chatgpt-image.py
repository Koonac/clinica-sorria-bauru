#!/usr/bin/env python3
"""Gera uma ou mais imagens no ChatGPT (sessão web já logada) via Playwright e salva os PNGs.

Reaproveita o perfil persistente (cookies/login) do Chromium para não precisar
logar de novo a cada execução. Roda headed (visível) por padrão — o Cloudflare
bloqueia Chromium headless em chatgpt.com, então --headless existe só para
depuração e não deve ser usado contra esse domínio.

Suporta lote: repita --prompt/--output para gerar várias imagens dentro de UM
único chat (uma navegação, uma sessão) em vez de abrir um chat novo por imagem.
Use isso sempre que uma demanda pedir vários criativos (ex.: os slides de um
carrossel) — mantém contexto entre as gerações e evita reabrir o navegador a
cada imagem.
"""
from __future__ import annotations

import argparse
import importlib.util
import re
import subprocess
import sys
import time
from pathlib import Path

# Auto-instala dependências faltando, no mesmo padrão dos outros scripts da pasta.
if importlib.util.find_spec("playwright") is None:
    print("Instalando dependência: playwright")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])

try:
    subprocess.check_call(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
except subprocess.CalledProcessError:
    print("Aviso: falha ao garantir o download do Chromium; tentando mesmo assim.", file=sys.stderr)

from playwright.sync_api import Response, sync_playwright

IMAGE_ENDPOINT = "/backend-api/estuary/content"
IMAGE_SELECTOR = 'img[alt^="Imagem gerada"], img[alt^="Generated image"]'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Gera imagens no ChatGPT via Playwright (sessão persistente) e salva os PNGs. "
            "Repita --prompt/--output para gerar várias imagens no mesmo chat."
        )
    )
    parser.add_argument(
        "--prompt", "-p", action="append", required=True,
        help="Prompt de geração de imagem. Repita a flag para gerar várias imagens no mesmo chat.",
    )
    parser.add_argument(
        "--output", "-o", action="append", required=True,
        help="Caminho do PNG de saída. Repita a flag na mesma ordem dos --prompt.",
    )
    parser.add_argument(
        "--profile-dir",
        default=".playwright-profile",
        help=(
            "Pasta de perfil persistente (cookies/login), default: .playwright-profile. "
            "Não é portável entre sistemas operacionais diferentes (Windows/Linux/Mac) — "
            "o Chromium criptografa cookies com o cofre de credenciais do SO onde foi "
            "logado. Um perfil precisa ser criado (login manual) na mesma família de SO "
            "de onde este script vai rodar."
        ),
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help=(
            "Roda headless de verdade. NÃO use contra chatgpt.com: o Cloudflare bloqueia "
            "Chromium headless com um desafio (Turnstile) e a geração nunca completa. "
            "Existe só para depuração/outros domínios."
        ),
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120000,
        help="Timeout de geração por imagem, em ms (default: 120000)",
    )
    args = parser.parse_args()
    if len(args.prompt) != len(args.output):
        parser.error(
            f"Número de --prompt ({len(args.prompt)}) difere do número de --output ({len(args.output)}) — "
            "cada prompt precisa de um output correspondente, na mesma ordem."
        )
    return args


def main() -> None:
    args = parse_args()
    pairs = list(zip(args.prompt, args.output))
    for _, output in pairs:
        Path(output).parent.mkdir(parents=True, exist_ok=True)
    profile_dir = Path(args.profile_dir)
    profile_dir.mkdir(parents=True, exist_ok=True)

    # Bytes das imagens capturadas via rede, na ordem de chegada. Como as gerações
    # rodam uma de cada vez (só avançamos pro próximo prompt depois que a atual
    # termina), a ordem de chegada corresponde 1:1 à ordem dos prompts.
    captured: list[bytes] = []

    print(f"Gerando {len(pairs)} imagem(ns) via ChatGPT em um único chat (headless={args.headless})…")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=args.headless,
            viewport={"width": 1280, "height": 900},
            locale="pt-BR",
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.set_default_timeout(args.timeout)

        def on_response(response: Response) -> None:
            if IMAGE_ENDPOINT not in response.url:
                return
            ctype = (response.headers.get("content-type") or "").lower()
            if response.status == 200 and "image" in ctype:
                try:
                    captured.append(response.body())
                except Exception:
                    pass

        page.on("response", on_response)

        page.goto("https://chatgpt.com/", wait_until="domcontentloaded")
        page.wait_for_timeout(2000)

        titulo = page.title().lower()
        if "moment" in titulo or "momento" in titulo:
            context.close()
            dica = (
                " (esperado com --headless contra chatgpt.com — rode sem essa flag)"
                if args.headless
                else ""
            )
            raise SystemExit(f"Bloqueado pelo desafio do Cloudflare (Turnstile){dica}.")

        if page.get_by_role("button", name=re.compile("^(Entrar|Log in)$")).first.count():
            context.close()
            raise SystemExit(
                "Sessão não autenticada nesse perfil. Rode este script sem --headless (headed é "
                f"o default) e faça login manualmente na janela que abrir (perfil salvo em: {profile_dir})."
            )

        def get_textbox():
            return page.get_by_role(
                "textbox",
                name=re.compile("Converse com o ChatGPT|Pergunte ao ChatGPT|Chat with ChatGPT|Ask anything"),
            ).first

        def get_send_button():
            # testid estável da UI do ChatGPT — mais confiável que Enter, que às
            # vezes não submete (o texto fica parado na caixa) a partir da 2ª
            # mensagem de uma mesma sessão.
            return page.locator('button[data-testid="send-button"]').first

        def send_message(prompt: str) -> None:
            textbox = get_textbox()
            textbox.wait_for(state="visible")
            page.wait_for_timeout(1500)
            textbox.click()
            textbox.fill(prompt)

            send_btn = get_send_button()
            if send_btn.count():
                send_btn.wait_for(state="visible")
                send_btn.click()
            else:
                textbox.press("Enter")

            # Confirma que a mensagem realmente saiu da caixa (texto voltou a
            # ficar vazio) — se não, tenta de novo (clique + Enter) antes de
            # seguir para a espera da imagem, evitando ficar esperando por uma
            # mensagem que nunca foi enviada.
            try:
                page.wait_for_function(
                    """() => {
                        const el = document.querySelector('#prompt-textarea');
                        return !el || el.innerText.trim().length === 0;
                    }""",
                    timeout=5000,
                )
            except Exception:
                textbox2 = get_textbox()
                textbox2.click()
                textbox2.press("Enter")
                send_btn2 = get_send_button()
                if send_btn2.count():
                    send_btn2.click()

        for i, (prompt, output) in enumerate(pairs, start=1):
            print(f"[{i}/{len(pairs)}] Enviando prompt…")
            prev_dom_count = page.locator(IMAGE_SELECTOR).count()
            prev_captured_count = len(captured)

            send_message(prompt)

            # Espera uma NOVA imagem aparecer no DOM (contagem acima da anterior) —
            # não basta esperar o seletor existir, pois a partir da 2ª imagem ele já
            # existe no histórico do chat.
            deadline = time.time() + (args.timeout / 1000)
            while page.locator(IMAGE_SELECTOR).count() <= prev_dom_count:
                if time.time() > deadline:
                    try:
                        page.screenshot(path="/tmp/debug-chatgpt-timeout.png", full_page=False)
                        Path("/tmp/debug-chatgpt-timeout.txt").write_text(page.inner_text("body"))
                    except Exception as e:
                        print(f"debug capture failed: {e}")
                    context.close()
                    raise SystemExit(
                        f"[{i}/{len(pairs)}] Timeout esperando a imagem aparecer no DOM."
                    )
                page.wait_for_timeout(500)

            # ...e a resposta de rede com os bytes reais (o listener acima já deve ter capturado).
            while len(captured) <= prev_captured_count:
                if time.time() > deadline:
                    context.close()
                    raise SystemExit(
                        f"[{i}/{len(pairs)}] Timeout esperando os bytes da imagem via rede."
                    )
                page.wait_for_timeout(500)

            out_path = Path(output)
            out_path.write_bytes(captured[prev_captured_count])
            print(f"[{i}/{len(pairs)}] Imagem salva em {out_path} ({len(captured[prev_captured_count])} bytes)")

        context.close()


if __name__ == "__main__":
    main()
