#!/usr/bin/env python3
"""Renderiza um HTML em imagem (PNG/JPEG) usando Chromium headless via Playwright.

Aceita o HTML como arquivo (--html-file) ou como string inline (--html). O formato
de saída é inferido pela extensão do --output (.png ou .jpg/.jpeg). É possível
capturar a página inteira, um elemento específico (--selector) ou um viewport fixo.
"""
import importlib.util
import subprocess
import sys

# Auto-instala dependências faltando, no mesmo padrão dos outros scripts da pasta.
if importlib.util.find_spec("playwright") is None:
    print("Installing missing package: playwright")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])

# Garante que o navegador Chromium do Playwright esteja baixado.
try:
    subprocess.check_call(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
except subprocess.CalledProcessError:
    print("Aviso: falha ao garantir o download do Chromium; tentando mesmo assim.", file=sys.stderr)

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright


def parse_args():
    parser = argparse.ArgumentParser(description="Transforma um HTML em imagem (PNG/JPEG) via Chromium headless")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--html-file", "-f", help="Caminho do arquivo .html a renderizar")
    src.add_argument("--html", help="String HTML inline a renderizar")
    parser.add_argument("--output", "-o", required=True, help="Caminho da imagem de saída (.png, .jpg)")
    parser.add_argument("--width", "-w", type=int, default=1080, help="Largura do viewport em px (default: 1080)")
    parser.add_argument("--height", type=int, default=1080, help="Altura do viewport em px (default: 1080)")
    parser.add_argument(
        "--scale",
        "-s",
        type=float,
        default=2.0,
        help="Device scale factor para imagens nítidas/retina (default: 2.0)",
    )
    parser.add_argument(
        "--selector",
        help="Seletor CSS de um elemento específico a capturar (em vez do viewport/página inteira)",
    )
    parser.add_argument(
        "--full-page",
        action="store_true",
        help="Captura a página inteira (rolagem completa) em vez de só o viewport",
    )
    parser.add_argument(
        "--quality",
        "-q",
        type=int,
        default=None,
        help="Qualidade JPEG 0-100 (ignorado para PNG)",
    )
    parser.add_argument(
        "--transparent",
        action="store_true",
        help="Fundo transparente (apenas PNG)",
    )
    parser.add_argument(
        "--wait",
        type=int,
        default=0,
        help="Tempo extra de espera em ms após o load, para animações/fontes (default: 0)",
    )
    return parser.parse_args()


def html_to_image(args):
    out = Path(args.output)
    ext = out.suffix.lower().lstrip(".")
    img_type = "jpeg" if ext in ("jpg", "jpeg") else "png"

    if args.transparent and img_type != "png":
        print("Aviso: --transparent só vale para PNG; ignorando.", file=sys.stderr)

    out.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": args.width, "height": args.height},
            device_scale_factor=args.scale,
        )

        # "networkidle"/"load" podem nunca disparar se um recurso externo (CDN, font)
        # estiver inacessível — "domcontentloaded" não espera recursos de terceiros,
        # e o fallback de fontes abaixo cobre o caso de web font indisponível.
        if args.html_file:
            url = Path(args.html_file).resolve().as_uri()
            page.goto(url, wait_until="domcontentloaded", timeout=15000)
        else:
            page.set_content(args.html, wait_until="domcontentloaded", timeout=15000)

        # Aguarda as fontes terminarem de carregar, mas nunca trava indefinidamente:
        # se não resolver em 10s, segue com fallback de fonte.
        page.evaluate("""
            Promise.race([
                document.fonts && document.fonts.ready,
                new Promise(resolve => setTimeout(resolve, 10000)),
            ])
        """)
        if args.wait:
            page.wait_for_timeout(args.wait)

        shot_kwargs = {"path": str(out), "type": img_type}
        if img_type == "jpeg" and args.quality is not None:
            shot_kwargs["quality"] = args.quality
        if img_type == "png" and args.transparent:
            shot_kwargs["omit_background"] = True

        if args.selector:
            element = page.query_selector(args.selector)
            if element is None:
                print(f"Error: seletor não encontrado: {args.selector}", file=sys.stderr)
                browser.close()
                sys.exit(1)
            element.screenshot(**shot_kwargs)
        else:
            shot_kwargs["full_page"] = args.full_page
            page.screenshot(**shot_kwargs)

        browser.close()

    print(f"Imagem salva em: {out.resolve()}")


def main():
    args = parse_args()
    html_to_image(args)


if __name__ == "__main__":
    main()
