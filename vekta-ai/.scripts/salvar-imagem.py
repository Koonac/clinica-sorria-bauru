#!/usr/bin/env python3
"""Copia ou decodifica imagem(ns) (ou PDF) para caminho(s) de destino no projeto.

Usado quando o usuário anexa imagem(ns) no chat e pede para salvá-las / baixá-las.
A interface já grava o anexo em materiais/anexos/ no upload; este script move ou
copia para o destino final (materiais/, .dna/logos/, marketing/…, etc.).

Aceita um ou vários pares --input/--output (flags repetíveis), para processar
várias imagens no mesmo comando sem travar no primeiro arquivo.
"""
import argparse
import base64
import sys
from pathlib import Path
from typing import Optional


EXT_OK = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf"}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Salva imagem(ns)/PDF (arquivo ou base64) em caminho(s) de destino"
    )
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument(
        "--input",
        "-i",
        action="append",
        help="Caminho do arquivo de origem. Repita a flag para várias imagens "
        "(ex.: -i a.png -o materiais/a.png -i b.png -o materiais/b.png).",
    )
    src.add_argument(
        "--base64-file",
        help="Arquivo de texto contendo o base64 puro da imagem (sem prefixo data:)",
    )
    src.add_argument(
        "--base64",
        help="Base64 puro da imagem na própria linha de comando (evite para arquivos grandes)",
    )
    parser.add_argument(
        "--output",
        "-o",
        action="append",
        required=True,
        help="Caminho de destino. Com vários --input, repita --output na mesma ordem.",
    )
    parser.add_argument(
        "--move",
        action="store_true",
        help="Com --input: move em vez de copiar (remove a origem após gravar)",
    )
    parser.add_argument(
        "--media-type",
        default="",
        help="MIME type ao gravar a partir de base64 (image/png, image/jpeg, …). "
        "Se omitido, a extensão do --output define o formato.",
    )
    args = parser.parse_args()

    if args.input:
        if len(args.input) != len(args.output):
            parser.error(
                f"Número de --input ({len(args.input)}) difere do número de "
                f"--output ({len(args.output)}) — repita -o na mesma ordem."
            )
    elif len(args.output) != 1:
        parser.error("Com --base64/--base64-file use exatamente um --output.")

    return args


def ext_de_mime(mime: str) -> str:
    mapa = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "application/pdf": ".pdf",
    }
    return mapa.get((mime or "").strip().lower(), "")


def garantir_extensao(out: Path, media_type: str) -> Path:
    if out.suffix.lower() in EXT_OK:
        return out
    ext = ext_de_mime(media_type) or ".png"
    return out.with_suffix(ext)


def ler_bytes_arquivo(src: Path) -> bytes:
    if not src.is_file():
        print(f"Error: arquivo de origem não encontrado: {src}", file=sys.stderr)
        sys.exit(1)
    if src.suffix.lower() not in EXT_OK:
        print(
            f"Error: extensão não suportada em --input ({src.suffix}). "
            f"Use: {', '.join(sorted(EXT_OK))}",
            file=sys.stderr,
        )
        sys.exit(1)
    return src.read_bytes()


def ler_bytes_base64(args) -> bytes:
    bruto = ""
    if args.base64_file:
        f = Path(args.base64_file)
        if not f.is_file():
            print(f"Error: arquivo base64 não encontrado: {f}", file=sys.stderr)
            sys.exit(1)
        bruto = f.read_text(encoding="utf-8").strip()
    else:
        bruto = (args.base64 or "").strip()

    # Aceita data-URL acidentalmente colada
    if "," in bruto and bruto.lower().startswith("data:"):
        bruto = bruto.split(",", 1)[1].strip()

    if not bruto:
        print("Error: base64 vazio.", file=sys.stderr)
        sys.exit(1)

    try:
        return base64.b64decode(bruto, validate=False)
    except Exception as exc:
        print(f"Error: base64 inválido ({exc})", file=sys.stderr)
        sys.exit(1)


def gravar(dados: bytes, out: Path, media_type: str, origem: Optional[Path], mover: bool):
    if not dados:
        print("Error: conteúdo vazio — nada a salvar.", file=sys.stderr)
        sys.exit(1)

    out = garantir_extensao(out, media_type)
    if out.suffix.lower() not in EXT_OK:
        print(
            f"Error: extensão de saída não suportada ({out.suffix}). "
            f"Use: {', '.join(sorted(EXT_OK))}",
            file=sys.stderr,
        )
        sys.exit(1)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(dados)

    if origem is not None and mover:
        try:
            origem.unlink(missing_ok=True)
        except OSError as exc:
            print(f"Aviso: gravou em {out}, mas não removeu a origem: {exc}", file=sys.stderr)

    acao = "movida" if (origem is not None and mover) else "salva"
    print(f"Imagem {acao} em: {out.resolve()}")
    return str(out).replace("\\", "/")


def salvar(args):
    caminhos = []

    if args.input:
        for origem_str, destino_str in zip(args.input, args.output):
            origem = Path(origem_str)
            dados = ler_bytes_arquivo(origem)
            caminhos.append(
                gravar(dados, Path(destino_str), args.media_type, origem, args.move)
            )
    else:
        dados = ler_bytes_base64(args)
        caminhos.append(
            gravar(dados, Path(args.output[0]), args.media_type, None, False)
        )

    if len(caminhos) > 1:
        print(f"OK: {len(caminhos)} arquivo(s) salvos.")
    return caminhos


def main():
    args = parse_args()
    salvar(args)


if __name__ == "__main__":
    main()
