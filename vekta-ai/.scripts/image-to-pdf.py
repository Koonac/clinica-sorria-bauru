#!/usr/bin/env python3
"""Junta uma ou mais imagens (PNG/JPEG) em um único PDF, uma imagem por página.

Usa o img2pdf, que embute as imagens sem recompressão — preservando a qualidade
original. Aceita os arquivos em ordem explícita (--input) ou via padrão glob
(--glob), e ordena alfabeticamente por padrão para manter a sequência de slides.
"""
import importlib.util
import subprocess
import sys

# Auto-instala dependências faltando, no mesmo padrão dos outros scripts da pasta.
if importlib.util.find_spec("img2pdf") is None:
    print("Installing missing package: img2pdf")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "img2pdf"])

import argparse
import glob as globlib
from pathlib import Path

import img2pdf


def parse_args():
    parser = argparse.ArgumentParser(description="Junta imagens (PNG/JPEG) em um único PDF, uma por página")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument(
        "--input",
        "-i",
        nargs="+",
        help="Caminhos das imagens, na ordem desejada (uma página por imagem)",
    )
    src.add_argument(
        "--glob",
        "-g",
        help='Padrão glob das imagens, ex.: "saida/apresentacao/*.png"',
    )
    parser.add_argument("--output", "-o", required=True, help="Caminho do PDF de saída (.pdf)")
    parser.add_argument(
        "--no-sort",
        action="store_true",
        help="Não ordenar; preserva a ordem dada em --input ou a ordem natural do glob",
    )
    return parser.parse_args()


def collect_files(args):
    if args.input:
        files = list(args.input)
    else:
        files = globlib.glob(args.glob)

    if not args.no_sort:
        files = sorted(files)

    missing = [f for f in files if not Path(f).is_file()]
    if missing:
        print("Error: arquivo(s) não encontrado(s): " + ", ".join(missing), file=sys.stderr)
        sys.exit(1)

    if not files:
        print("Error: nenhuma imagem encontrada para juntar.", file=sys.stderr)
        sys.exit(1)

    return files


def images_to_pdf(args):
    files = collect_files(args)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)

    with open(out, "wb") as f:
        f.write(img2pdf.convert(files))

    print(f"PDF salvo em: {out.resolve()} ({len(files)} página(s))")


def main():
    args = parse_args()
    images_to_pdf(args)


if __name__ == "__main__":
    main()
