#!/usr/bin/env python3
"""Coleta dados públicos de um perfil do Instagram via Playwright (Chromium).

Abre o perfil na web, intercepta respostas JSON das APIs públicas do Instagram
e, se necessário, rola a grade e visita posts/reels individuais para completar
métricas. Grava perfil.json, posts.json e reels.json no diretório de saída.

Não acessa Insights / Meta Business Suite — só dado público visível sem login
(ou com sessão limitada que o Instagram servir ao navegador).
"""
from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

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

import argparse

from playwright.sync_api import Page, Response, sync_playwright

IG_APP_ID = "936619743392459"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scraper público de perfil Instagram via Playwright → JSON"
    )
    parser.add_argument("--username", "-u", required=True, help="Username do Instagram (sem @)")
    parser.add_argument(
        "--output-dir",
        "-o",
        required=True,
        help="Pasta de saída (ex.: saidas/analises/instagram/user/dados-brutos-2026-07-14)",
    )
    parser.add_argument(
        "--posts",
        type=int,
        default=30,
        help="Máximo de posts estáticos/carrossel recentes (default: 30)",
    )
    parser.add_argument(
        "--reels",
        type=int,
        default=30,
        help="Máximo de reels recentes (default: 30)",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Abre o Chromium visível (útil se o Instagram bloquear headless)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=45000,
        help="Timeout de navegação em ms (default: 45000)",
    )
    return parser.parse_args()


def limpar_username(raw: str) -> str:
    raw = raw.strip()
    if "instagram.com" in raw:
        path = urlparse(raw if "://" in raw else f"https://{raw}").path
        parts = [p for p in path.split("/") if p and p not in ("reels", "p", "reel", "stories")]
        if not parts:
            raise SystemExit(f"Não foi possível extrair username de: {raw}")
        return parts[0].lstrip("@")
    return raw.lstrip("@").split("/")[0]


def safe_int(valor: Any) -> int | None:
    if valor is None or valor == "":
        return None
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


def shortcode_de_url(url: str | None) -> str | None:
    if not url:
        return None
    m = re.search(r"/(?:p|reel|tv)/([^/?#]+)", url)
    return m.group(1) if m else None


def url_de_shortcode(short_code: str, tipo: str) -> str:
    if tipo == "reel":
        return f"https://www.instagram.com/reel/{short_code}/"
    return f"https://www.instagram.com/p/{short_code}/"


def parse_json_response(response: Response) -> Any | None:
    try:
        ctype = (response.headers.get("content-type") or "").lower()
        if "json" not in ctype and "javascript" not in ctype:
            # Algumas respostas IG vêm sem content-type útil; tenta mesmo assim.
            text = response.text()
            if not text or text[0] not in "{[":
                return None
            return json.loads(text)
        return response.json()
    except Exception:
        return None


def extrair_user_de_payload(payload: Any) -> dict | None:
    if not isinstance(payload, dict):
        return None
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    user = data.get("user") if isinstance(data, dict) else None
    if isinstance(user, dict) and (
        "edge_followed_by" in user
        or "follower_count" in user
        or "username" in user
        and ("biography" in user or "full_name" in user)
    ):
        return user
    # GraphQL aninhado: data.user / data.xdt_api__v1__...
    if isinstance(data, dict):
        for chave, valor in data.items():
            if isinstance(valor, dict) and "user" in valor:
                u = valor.get("user")
                if isinstance(u, dict) and "username" in u:
                    return u
            if isinstance(valor, dict) and "username" in valor and (
                "edge_followed_by" in valor or "follower_count" in valor
            ):
                return valor
    return None


def normalizar_perfil(user: dict) -> dict:
    followers = user.get("edge_followed_by") or {}
    follows = user.get("edge_follow") or {}
    posts = user.get("edge_owner_to_timeline_media") or {}
    return {
        "username": user.get("username"),
        "fullName": user.get("full_name") or user.get("fullName"),
        "biography": user.get("biography"),
        "profilePicUrlHD": user.get("profile_pic_url_hd")
        or user.get("profile_pic_url")
        or user.get("profilePicUrlHD"),
        "followersCount": safe_int(
            followers.get("count") if isinstance(followers, dict) else user.get("follower_count")
        ),
        "followsCount": safe_int(
            follows.get("count") if isinstance(follows, dict) else user.get("following_count")
        ),
        "postsCount": safe_int(
            posts.get("count") if isinstance(posts, dict) else user.get("media_count")
        ),
        "verified": bool(user.get("is_verified") or user.get("verified")),
        "isBusinessAccount": bool(
            user.get("is_business_account") or user.get("is_professional_account")
        ),
        "private": bool(user.get("is_private") or user.get("private")),
        "externalUrl": user.get("external_url") or user.get("externalUrl"),
        "id": str(user.get("id") or user.get("pk") or "") or None,
        "coletadoEm": datetime.now(timezone.utc).isoformat(),
        "fonte": "playwright",
    }


def node_para_item(node: dict) -> dict | None:
    if not isinstance(node, dict):
        return None
    # Alguns payloads vêm envelopeados em { node: {...} }
    if "node" in node and isinstance(node["node"], dict):
        node = node["node"]

    short_code = (
        node.get("shortcode")
        or node.get("code")
        or node.get("shortCode")
        or shortcode_de_url(node.get("url") or node.get("permalink"))
    )
    if not short_code:
        return None

    product = (node.get("product_type") or node.get("media_type") or "").lower()
    is_video = bool(node.get("is_video") or node.get("media_type") in (2, "2", "VIDEO", "video"))
    is_reel = product in ("clips", "reel", "reels") or (
        is_video and ("clips" in str(node.get("__typename", "")).lower() or node.get("product_type") == "clips")
    )
    tipo = "reel" if is_reel or (is_video and product == "clips") else ("video" if is_video else "image")
    if node.get("__typename") == "GraphSidecar" or node.get("media_type") in (8, "8", "CAROUSEL_ALBUM"):
        tipo = "carousel"

    # Reels: treat GraphVideo with clips as reel
    if is_video and tipo == "video" and node.get("product_type") == "clips":
        tipo = "reel"

    caption = None
    edge_caption = node.get("edge_media_to_caption") or {}
    if isinstance(edge_caption, dict):
        edges = edge_caption.get("edges") or []
        if edges and isinstance(edges[0], dict):
            caption = (edges[0].get("node") or {}).get("text")
    if caption is None:
        caption = node.get("caption")
        if isinstance(caption, dict):
            caption = caption.get("text")

    likes = (
        (node.get("edge_liked_by") or {}).get("count")
        if isinstance(node.get("edge_liked_by"), dict)
        else node.get("like_count") or node.get("likesCount")
    )
    comments = (
        (node.get("edge_media_to_comment") or {}).get("count")
        if isinstance(node.get("edge_media_to_comment"), dict)
        else (node.get("edge_media_to_parent_comment") or {}).get("count")
        if isinstance(node.get("edge_media_to_parent_comment"), dict)
        else node.get("comment_count") or node.get("commentsCount")
    )

    ts = node.get("taken_at_timestamp") or node.get("taken_at") or node.get("timestamp")
    if isinstance(ts, str) and ts.isdigit():
        ts = int(ts)

    item = {
        "shortCode": short_code,
        "url": url_de_shortcode(short_code, "reel" if tipo == "reel" else "post"),
        "type": "reel" if tipo == "reel" else tipo,
        "likesCount": safe_int(likes),
        "commentsCount": safe_int(comments),
        "videoPlayCount": safe_int(
            node.get("video_play_count")
            or node.get("play_count")
            or node.get("videoPlayCount")
        ),
        "videoViewCount": safe_int(
            node.get("video_view_count")
            or node.get("view_count")
            or node.get("videoViewCount")
        ),
        "videoDuration": node.get("video_duration") or node.get("videoDuration"),
        "timestamp": ts,
        "caption": (caption[:200] if isinstance(caption, str) else caption),
    }
    return item


def coletar_nodes_de_payload(payload: Any, acumulado: dict[str, dict]) -> None:
    """Varre recursivamente um JSON da IG e acumula mídias por shortcode."""

    def walk(obj: Any) -> None:
        if isinstance(obj, dict):
            if any(k in obj for k in ("shortcode", "code", "edge_liked_by", "is_video", "product_type")):
                item = node_para_item(obj)
                if item and item["shortCode"] not in acumulado:
                    acumulado[item["shortCode"]] = item
                elif item and item["shortCode"] in acumulado:
                    # Mescla campos faltantes
                    base = acumulado[item["shortCode"]]
                    for k, v in item.items():
                        if base.get(k) in (None, "", []) and v not in (None, "", []):
                            base[k] = v
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(payload)


def dismiss_overlays(page: Page) -> None:
    """Tenta fechar cookie/login modal que bloqueia a grade pública."""
    seletores = [
        'button:has-text("Decline optional cookies")',
        'button:has-text("Recusar cookies opcionais")',
        'button:has-text("Allow all cookies")',
        'button:has-text("Permitir todos os cookies")',
        'button:has-text("Not Now")',
        'button:has-text("Agora não")',
        'button:has-text("Not now")',
        'div[role="dialog"] button svg[aria-label="Close"]',
        'div[role="dialog"] [aria-label="Close"]',
        'div[role="dialog"] [aria-label="Fechar"]',
    ]
    for sel in seletores:
        try:
            loc = page.locator(sel).first
            if loc.count() and loc.is_visible(timeout=800):
                loc.click(timeout=1500)
                page.wait_for_timeout(400)
        except Exception:
            pass


def fetch_web_profile_info(page: Page, username: str) -> dict | None:
    url = f"https://www.instagram.com/api/v1/users/web_profile_info/?username={username}"
    try:
        resp = page.request.get(
            url,
            headers={
                "X-IG-App-ID": IG_APP_ID,
                "X-Requested-With": "XMLHttpRequest",
                "Referer": f"https://www.instagram.com/{username}/",
                "Accept": "*/*",
            },
        )
        if not resp.ok:
            print(f"Aviso: web_profile_info HTTP {resp.status}", file=sys.stderr)
            return None
        payload = resp.json()
        user = extrair_user_de_payload(payload)
        return user
    except Exception as exc:
        print(f"Aviso: falha em web_profile_info: {exc}", file=sys.stderr)
        return None


def extrair_links_da_grade(page: Page) -> list[str]:
    hrefs = page.eval_on_selector_all(
        'a[href*="/p/"], a[href*="/reel/"]',
        "els => els.map(e => e.href)",
    )
    vistos: list[str] = []
    for h in hrefs:
        if h and h not in vistos:
            vistos.append(h)
    return vistos


def rolar_grade(page: Page, alvo_links: int, max_rolagens: int = 25) -> list[str]:
    links: list[str] = []
    estagnado = 0
    for _ in range(max_rolagens):
        dismiss_overlays(page)
        links = extrair_links_da_grade(page)
        if len(links) >= alvo_links:
            break
        antes = len(links)
        page.mouse.wheel(0, 3200)
        page.wait_for_timeout(1200)
        links = extrair_links_da_grade(page)
        if len(links) <= antes:
            estagnado += 1
            if estagnado >= 4:
                break
        else:
            estagnado = 0
    return links


def enriquecer_item_na_pagina(page: Page, url: str, item: dict) -> dict:
    """Abre um post/reel e tenta completar likes/comments/views do DOM/meta."""
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        dismiss_overlays(page)
        page.wait_for_timeout(1500)

        # meta og:description costuma trazer "X likes, Y comments - caption"
        desc = page.locator('meta[property="og:description"]').get_attribute("content") or ""
        m_likes = re.search(r"([\d.,]+)\s+[Ll]ikes?", desc)
        m_comments = re.search(r"([\d.,]+)\s+[Cc]omments?", desc)
        if item.get("likesCount") is None and m_likes:
            item["likesCount"] = safe_int(m_likes.group(1).replace(".", "").replace(",", ""))
        if item.get("commentsCount") is None and m_comments:
            item["commentsCount"] = safe_int(m_comments.group(1).replace(".", "").replace(",", ""))

        # Tenta spans com aria-labels (pt/en)
        for label in ("likes", "curtidas", "like", "curtida"):
            loc = page.locator(f'[aria-label*="{label}" i]').first
            try:
                if loc.count():
                    texto = loc.inner_text(timeout=500)
                    nums = re.findall(r"[\d.,]+", texto)
                    if nums and item.get("likesCount") is None:
                        item["likesCount"] = safe_int(nums[0].replace(".", "").replace(",", ""))
            except Exception:
                pass

        # Views em reels às vezes aparecem como "X views" / "X visualizações"
        body_text = ""
        try:
            body_text = page.locator("main").inner_text(timeout=2000)
        except Exception:
            pass
        if item.get("type") == "reel" and item.get("videoPlayCount") is None and item.get("videoViewCount") is None:
            m_views = re.search(
                r"([\d.,]+)\s*(?:views|visualiza[cç][oõ]es|reprodu[cç][oõ]es|plays)",
                body_text,
                re.I,
            )
            if m_views:
                n = safe_int(m_views.group(1).replace(".", "").replace(",", ""))
                item["videoViewCount"] = n
                item["videoPlayCount"] = n
    except Exception as exc:
        print(f"Aviso: falha ao enriquecer {url}: {exc}", file=sys.stderr)
    return item


def classificar_e_limitar(
    midias: dict[str, dict], posts_limite: int, reels_limite: int
) -> tuple[list[dict], list[dict]]:
    reels: list[dict] = []
    posts: list[dict] = []
    # Ordena por timestamp desc quando disponível
    ordenados = sorted(
        midias.values(),
        key=lambda x: x.get("timestamp") or 0,
        reverse=True,
    )
    for item in ordenados:
        if item.get("type") == "reel":
            if len(reels) < reels_limite:
                reels.append(item)
        else:
            if len(posts) < posts_limite:
                posts.append(item)
    return posts, reels


def main() -> None:
    args = parse_args()
    username = limpar_username(args.username)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    midias: dict[str, dict] = {}
    perfil_user: dict | None = None
    payloads_interceptados = 0

    print(f"Coletando @{username} via Playwright…")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=not args.headed,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1280, "height": 900},
            locale="pt-BR",
        )
        # Reduz detecção trivial de webdriver
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )
        page = context.new_page()
        page.set_default_timeout(args.timeout)

        def on_response(response: Response) -> None:
            nonlocal payloads_interceptados, perfil_user
            url = response.url
            if "instagram.com" not in url:
                return
            if response.status != 200:
                return
            if not any(
                key in url
                for key in (
                    "web_profile_info",
                    "graphql",
                    "query",
                    "/api/v1/",
                    "polaris",
                )
            ):
                return
            payload = parse_json_response(response)
            if payload is None:
                return
            payloads_interceptados += 1
            user = extrair_user_de_payload(payload)
            if user and perfil_user is None:
                perfil_user = user
            # Nós de mídia embutidos no próprio user
            if user:
                timeline = user.get("edge_owner_to_timeline_media") or {}
                for edge in timeline.get("edges") or []:
                    coletar_nodes_de_payload(edge, midias)
            coletar_nodes_de_payload(payload, midias)

        page.on("response", on_response)

        # Aquece cookies no domínio
        page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
        dismiss_overlays(page)
        page.wait_for_timeout(1500)

        # Perfil
        page.goto(
            f"https://www.instagram.com/{username}/",
            wait_until="domcontentloaded",
        )
        dismiss_overlays(page)
        page.wait_for_timeout(2500)

        if perfil_user is None:
            perfil_user = fetch_web_profile_info(page, username)
            if perfil_user:
                timeline = perfil_user.get("edge_owner_to_timeline_media") or {}
                for edge in timeline.get("edges") or []:
                    coletar_nodes_de_payload(edge, midias)

        if perfil_user is None:
            # Último recurso: meta tags da página
            try:
                title = page.title()
                bio_meta = page.locator('meta[name="description"]').get_attribute("content") or ""
                perfil_user = {
                    "username": username,
                    "full_name": title.split("•")[0].replace("Instagram", "").strip(" ()"),
                    "biography": bio_meta,
                    "is_private": "esta conta é privada" in page.content().lower()
                    or "this account is private" in page.content().lower(),
                }
            except Exception:
                perfil_user = {"username": username}

        perfil = normalizar_perfil(perfil_user)

        if perfil.get("private"):
            print("Conta privada ou inacessível sem login — salvando só o perfil.")
            (out_dir / "perfil.json").write_text(
                json.dumps(perfil, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            (out_dir / "posts.json").write_text("[]", encoding="utf-8")
            (out_dir / "reels.json").write_text("[]", encoding="utf-8")
            browser.close()
            print(json.dumps({"ok": True, "private": True, "perfil": perfil}, ensure_ascii=False))
            return

        alvo = args.posts + args.reels
        links = rolar_grade(page, alvo_links=max(alvo, 12))

        # Aba Reels (quando existir)
        try:
            page.goto(
                f"https://www.instagram.com/{username}/reels/",
                wait_until="domcontentloaded",
            )
            dismiss_overlays(page)
            page.wait_for_timeout(2000)
            links_reels = rolar_grade(page, alvo_links=args.reels)
            for link in links_reels:
                sc = shortcode_de_url(link)
                if not sc:
                    continue
                if sc not in midias:
                    midias[sc] = {
                        "shortCode": sc,
                        "url": link.split("?")[0],
                        "type": "reel",
                        "likesCount": None,
                        "commentsCount": None,
                        "videoPlayCount": None,
                        "videoViewCount": None,
                        "videoDuration": None,
                        "timestamp": None,
                        "caption": None,
                    }
                else:
                    midias[sc]["type"] = "reel"
                    midias[sc]["url"] = url_de_shortcode(sc, "reel")
        except Exception as exc:
            print(f"Aviso: falha na aba /reels/: {exc}", file=sys.stderr)

        # Cadastra links da grade de posts que ainda não tinham JSON
        for link in links:
            sc = shortcode_de_url(link)
            if not sc:
                continue
            tipo = "reel" if "/reel/" in link else "image"
            if sc not in midias:
                midias[sc] = {
                    "shortCode": sc,
                    "url": link.split("?")[0],
                    "type": tipo,
                    "likesCount": None,
                    "commentsCount": None,
                    "videoPlayCount": None,
                    "videoViewCount": None,
                    "videoDuration": None,
                    "timestamp": None,
                    "caption": None,
                }

        posts, reels = classificar_e_limitar(midias, args.posts, args.reels)

        # Enriquece itens sem métricas visitando a página (limite razoável)
        def precisa_enriquecer(it: dict) -> bool:
            if it.get("likesCount") is None or it.get("commentsCount") is None:
                return True
            if it.get("type") == "reel" and it.get("videoPlayCount") is None and it.get("videoViewCount") is None:
                return True
            return False

        candidatos = [it for it in (reels + posts) if precisa_enriquecer(it)]
        # Limita visitas extras para não demorar/sofrer rate-limit demais
        for item in candidatos[: min(len(candidatos), max(args.posts, args.reels))]:
            enriquecer_item_na_pagina(page, item["url"], item)
            time.sleep(0.6)

        browser.close()

    (out_dir / "perfil.json").write_text(
        json.dumps(perfil, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "posts.json").write_text(
        json.dumps(posts, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "reels.json").write_text(
        json.dumps(reels, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    resumo = {
        "ok": True,
        "username": username,
        "private": False,
        "followersCount": perfil.get("followersCount"),
        "postsColetados": len(posts),
        "reelsColetados": len(reels),
        "payloadsInterceptados": payloads_interceptados,
        "outputDir": str(out_dir),
    }
    print(json.dumps(resumo, ensure_ascii=False))
    print(f"Salvo em {out_dir}")


if __name__ == "__main__":
    main()
