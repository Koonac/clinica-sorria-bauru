#!/usr/bin/env python3
"""Renderiza um HTML animado em vídeo (MP4/WebM/GIF) usando Chromium headless + ffmpeg.

Captura frames do HTML rodando no navegador em intervalos regulares e os combina
num vídeo com ffmpeg. O HTML pode ser um arquivo (.html) ou string inline.

Exemplos:
    python html-to-video.py -f animacao.html -o output.mp4
    python html-to-video.py -f animacao.html -o output.mp4 --duration 5 --fps 60
    python html-to-video.py -f animacao.html -o output.gif --width 800 --height 600
"""
import importlib.util
import subprocess
import sys

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

import argparse
import shutil
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


def parse_args():
    parser = argparse.ArgumentParser(description="Converte HTML animado em vídeo via Chromium headless + ffmpeg")

    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--html-file", "-f", help="Caminho do arquivo .html a renderizar")
    src.add_argument("--html", help="String HTML inline a renderizar")

    parser.add_argument("--output", "-o", required=True, help="Caminho do vídeo de saída (.mp4, .webm, .gif)")
    parser.add_argument("--duration", "-d", type=float, default=3.0, help="Duração da captura em segundos (default: 3)")
    parser.add_argument("--fps", type=int, default=30, help="Frames por segundo (default: 30)")
    parser.add_argument("--width", "-w", type=int, default=1080, help="Largura do viewport em px (default: 1080)")
    parser.add_argument("--height", type=int, default=1080, help="Altura do viewport em px (default: 1080)")
    parser.add_argument("--scale", "-s", type=float, default=1.0, help="Device scale factor (default: 1.0)")
    parser.add_argument("--wait", type=int, default=500, help="Espera em ms antes de iniciar a captura (default: 500)")
    parser.add_argument("--selector", help="Seletor CSS de elemento específico a capturar")
    parser.add_argument("--quality", "-q", type=int, default=85, help="Qualidade PNG dos frames 0-100 (default: 85)")
    parser.add_argument(
        "--crf",
        type=int,
        default=18,
        help="CRF do ffmpeg para MP4/WebM — menor = maior qualidade (default: 18)",
    )
    parser.add_argument(
        "--keep-frames",
        action="store_true",
        help="Mantém a pasta de frames temporários após a renderização",
    )
    return parser.parse_args()


def check_ffmpeg():
    if shutil.which("ffmpeg") is None:
        print("Erro: ffmpeg não encontrado. Instale-o e garanta que está no PATH.", file=sys.stderr)
        sys.exit(1)


def capture_frames(args, frames_dir: Path) -> int:
    total_frames = int(args.duration * args.fps)

    print(f"Capturando {total_frames} frames a {args.fps} fps ({args.duration}s)...")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": args.width, "height": args.height},
            device_scale_factor=args.scale,
        )

        # "networkidle"/"load" podem nunca disparar se um recurso externo (CDN, font)
        # estiver inacessível — "domcontentloaded" não espera recursos de terceiros;
        # fontes e scripts de CDN têm fallback tratado logo abaixo.
        if args.html_file:
            url = Path(args.html_file).resolve().as_uri()
            page.goto(url, wait_until="domcontentloaded", timeout=15000)
        else:
            page.set_content(args.html, wait_until="domcontentloaded", timeout=15000)

        # Espera as fontes carregarem, mas nunca trava indefinidamente:
        # se document.fonts.ready não resolver em 10s, segue com fallback de fonte.
        page.evaluate("""
            Promise.race([
                document.fonts && document.fonts.ready,
                new Promise(resolve => setTimeout(resolve, 10000)),
            ])
        """)

        if args.wait:
            page.wait_for_timeout(args.wait)

        # Se o HTML expuser window.__seekTo (GSAP/Three.js), usamos essa função
        # para posicionar cada frame — ela controla a timeline diretamente.
        # Caso contrário, cai no fallback: pausa e avança as CSS Animations
        # nativas via Web Animations API (document.getAnimations()).
        has_seek_to = page.evaluate("typeof window.__seekTo === 'function'")

        if not has_seek_to:
            page.evaluate("document.getAnimations().forEach(a => a.pause())")

        for i in range(total_frames):
            t_s = i / args.fps
            t_ms = t_s * 1000

            if has_seek_to:
                # Avança a timeline JS (GSAP/Three.js) para o instante exato deste frame.
                page.evaluate(f"window.__seekTo({t_s})")
            else:
                # Avança todas as animações CSS para o instante exato deste frame.
                page.evaluate(f"document.getAnimations().forEach(a => {{ a.currentTime = {t_ms}; }})")

            frame_path = frames_dir / f"frame_{i:05d}.png"

            if args.selector:
                element = page.query_selector(args.selector)
                if element is None:
                    print(f"Erro: seletor não encontrado: {args.selector}", file=sys.stderr)
                    browser.close()
                    sys.exit(1)
                element.screenshot(path=str(frame_path))
            else:
                page.screenshot(path=str(frame_path))

            if (i + 1) % args.fps == 0 or i == total_frames - 1:
                pct = int((i + 1) / total_frames * 100)
                print(f"  {pct}% ({i + 1}/{total_frames} frames)", end="\r")

        browser.close()

    print(f"\nFrames capturados em: {frames_dir}")
    return total_frames


def build_video(args, frames_dir: Path):
    out = Path(args.output)
    ext = out.suffix.lower().lstrip(".")
    out.parent.mkdir(parents=True, exist_ok=True)

    input_pattern = str(frames_dir / "frame_%05d.png")

    if ext == "gif":
        # GIF: paleta dedicada para melhor qualidade de cores
        palette_path = frames_dir / "palette.png"

        print("Gerando paleta de cores para GIF...")
        subprocess.check_call([
            "ffmpeg", "-y",
            "-framerate", str(args.fps),
            "-i", input_pattern,
            "-vf", f"scale={args.width}:{args.height}:flags=lanczos,palettegen",
            str(palette_path),
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        print("Montando GIF...")
        subprocess.check_call([
            "ffmpeg", "-y",
            "-framerate", str(args.fps),
            "-i", input_pattern,
            "-i", str(palette_path),
            "-filter_complex", f"scale={args.width}:{args.height}:flags=lanczos[x];[x][1:v]paletteuse",
            str(out),
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    elif ext == "webm":
        print("Montando WebM...")
        subprocess.check_call([
            "ffmpeg", "-y",
            "-framerate", str(args.fps),
            "-i", input_pattern,
            "-c:v", "libvpx-vp9",
            "-crf", str(args.crf),
            "-b:v", "0",
            "-pix_fmt", "yuv420p",
            str(out),
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    else:
        # MP4 (default)
        print("Montando MP4...")
        subprocess.check_call([
            "ffmpeg", "-y",
            "-framerate", str(args.fps),
            "-i", input_pattern,
            "-c:v", "libx264",
            "-crf", str(args.crf),
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(out),
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    print(f"Vídeo salvo em: {out.resolve()}")


def main():
    args = parse_args()
    check_ffmpeg()

    if args.keep_frames:
        frames_dir = Path(args.output).parent / (Path(args.output).stem + "_frames")
        frames_dir.mkdir(parents=True, exist_ok=True)
        capture_frames(args, frames_dir)
        build_video(args, frames_dir)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            frames_dir = Path(tmp) / "frames"
            frames_dir.mkdir()
            capture_frames(args, frames_dir)
            build_video(args, frames_dir)


if __name__ == "__main__":
    main()
