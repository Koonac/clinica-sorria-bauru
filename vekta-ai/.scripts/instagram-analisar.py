#!/usr/bin/env python3
"""Coleta perfil, insights de conta e mídias via Instagram Meta API.

Usado pela skill /instagram-analyst. Lê interface/.env (META_ACCESS_TOKEN).
Não faz scraping — só a conta autenticada pelo token.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CAMPOS_PERFIL = (
    "user_id,username,name,account_type,profile_picture_url,"
    "followers_count,follows_count,media_count"
)
CAMPOS_MIDIA = (
    "id,caption,media_type,media_product_type,media_url,thumbnail_url,"
    "permalink,timestamp,like_count,comments_count"
)

PERIODOS = {"day", "week", "days_28"}

# Métricas de conta (total_value / day). Tentativa em lote; falhas viram avisos.
METRICAS_CONTA = [
    "reach",
    "views",
    "profile_views",
    "accounts_engaged",
    "total_interactions",
    "follower_count",
    "follows_and_unfollows",
]

# Insights por tipo de mídia (lifetime). Lista ordenada; tenta o pacote e cai
# para métricas individuais se a API rejeitar o conjunto.
METRICAS_MIDIA = {
    "IMAGE": ["views", "reach", "saved", "likes", "comments", "shares", "total_interactions"],
    "CAROUSEL_ALBUM": [
        "views",
        "reach",
        "saved",
        "likes",
        "comments",
        "shares",
        "total_interactions",
    ],
    "VIDEO": ["views", "reach", "saved", "likes", "comments", "shares", "total_interactions"],
    "REELS": [
        "views",
        "reach",
        "saved",
        "likes",
        "comments",
        "shares",
        "total_interactions",
        "ig_reels_avg_watch_time",
        "ig_reels_video_view_total_time",
    ],
}


def carregar_dotenv() -> None:
    env_path = ROOT / "interface" / ".env"
    if not env_path.is_file():
        return
    for linha in env_path.read_text(encoding="utf-8").splitlines():
        s = linha.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        chave, _, valor = s.partition("=")
        chave = chave.strip()
        valor = valor.strip().strip('"').strip("'")
        if chave and chave not in os.environ:
            os.environ[chave] = valor


def env(chave: str, padrao: str = "") -> str:
    return (os.environ.get(chave) or padrao).strip()


def meta_cfg() -> dict:
    return {
        "token": env("META_ACCESS_TOKEN"),
        "ig_user_id": env("META_IG_USER_ID"),
        "host": env("META_GRAPH_HOST", "https://graph.instagram.com").rstrip("/"),
        "version": env("META_GRAPH_VERSION", "v25.0").strip("/"),
    }


def verificar_config(cfg: dict) -> dict:
    """Retorna status de configuração sem expor o token."""
    token_ok = bool(cfg["token"])
    env_file = (ROOT / "interface" / ".env").is_file()
    return {
        "configurado": token_ok,
        "access_token_ok": token_ok,
        "ig_user_id_env": bool(cfg["ig_user_id"]),
        "env_file_ok": env_file,
        "graph_host": cfg["host"],
        "graph_version": cfg["version"],
    }


def graph_request(method: str, caminho: str, cfg: dict, params: dict | None = None) -> dict:
    if not cfg["token"]:
        raise RuntimeError(
            "META_ACCESS_TOKEN ausente em interface/.env. "
            "Configure o token no App Dashboard (Instagram → Generate token)."
        )
    base = f"{cfg['host']}/{cfg['version']}"
    params = dict(params or {})
    params["access_token"] = cfg["token"]
    url = f"{base}{caminho if caminho.startswith('/') else '/' + caminho}"

    if method == "GET":
        full = url + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(full, method="GET")
    else:
        body = urllib.parse.urlencode(params).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detalhe = exc.read().decode("utf-8", errors="replace")
        try:
            corpo = json.loads(detalhe)
            msg = (corpo.get("error") or {}).get("message") or detalhe
        except json.JSONDecodeError:
            msg = detalhe or str(exc)
        raise RuntimeError(msg) from exc


def resolver_ig_user_id(cfg: dict) -> str:
    if cfg["ig_user_id"]:
        return cfg["ig_user_id"]
    me = graph_request("GET", "/me", cfg, {"fields": "user_id,username"})
    item = me["data"][0] if isinstance(me.get("data"), list) and me["data"] else me
    uid = item.get("user_id") or item.get("id")
    if not uid:
        raise RuntimeError(
            "Não foi possível obter user_id via /me. Defina META_IG_USER_ID em interface/.env."
        )
    return str(uid)


def janela_unix(periodo: str) -> dict:
    until = int(time.time())
    dias = 2 if periodo == "day" else 7 if periodo == "week" else 28
    since = until - dias * 24 * 60 * 60
    return {"since": since, "until": until, "dias": dias}


def valor_insight(item: dict) -> int | float | None:
    if not item:
        return None
    tv = item.get("total_value")
    if isinstance(tv, dict) and tv.get("value") is not None:
        try:
            return float(tv["value"]) if isinstance(tv["value"], float) else int(tv["value"])
        except (TypeError, ValueError):
            return tv["value"]
    values = item.get("values")
    if isinstance(values, list) and values:
        # soma série diária; se for lifetime com 1 ponto, usa o valor
        soma = 0
        tem = False
        for v in values:
            if v is None or v.get("value") is None:
                continue
            try:
                soma += float(v["value"])
                tem = True
            except (TypeError, ValueError):
                continue
        if not tem:
            return None
        if len(values) == 1:
            return values[0].get("value")
        return int(soma) if soma == int(soma) else soma
    return None


def obter_perfil(cfg: dict, ig_id: str) -> dict:
    raw = graph_request("GET", f"/{ig_id}", cfg, {"fields": CAMPOS_PERFIL})
    return {
        "user_id": raw.get("user_id") or ig_id,
        "username": raw.get("username"),
        "name": raw.get("name"),
        "account_type": raw.get("account_type"),
        "profile_picture_url": raw.get("profile_picture_url"),
        "followers_count": raw.get("followers_count"),
        "follows_count": raw.get("follows_count"),
        "media_count": raw.get("media_count"),
    }


def obter_insights_conta(cfg: dict, ig_id: str, periodo: str) -> dict:
    janela = janela_unix(periodo)
    totais: dict = {}
    series: dict = {}
    avisos: list = []

    for metrica in METRICAS_CONTA:
        variantes = [
            {
                "metric": metrica,
                "period": "day",
                "metric_type": "total_value",
                "since": str(janela["since"]),
                "until": str(janela["until"]),
            },
            {"metric": metrica, "period": "day", "metric_type": "total_value"},
            {
                "metric": metrica,
                "period": "day",
                "since": str(janela["since"]),
                "until": str(janela["until"]),
            },
            {"metric": metrica, "period": "day"},
        ]
        if metrica == "follower_count":
            # follower_count costuma ser série, sem total_value
            variantes = [
                {
                    "metric": metrica,
                    "period": "day",
                    "since": str(janela["since"]),
                    "until": str(janela["until"]),
                },
                {"metric": metrica, "period": "day"},
            ]

        ok = False
        ultimo_erro = None
        for params in variantes:
            try:
                resp = graph_request("GET", f"/{ig_id}/insights", cfg, params)
                itens = resp.get("data") if isinstance(resp.get("data"), list) else []
                if not itens:
                    ultimo_erro = "Resposta vazia (data=[])"
                    continue
                item = itens[0]
                val = valor_insight(item)
                totais[metrica] = val
                if isinstance(item.get("values"), list) and item["values"]:
                    series[metrica] = item["values"]
                ok = True
                break
            except RuntimeError as exc:
                ultimo_erro = str(exc)
                continue
        if not ok:
            avisos.append({"metrica": metrica, "erro": ultimo_erro or "indisponível"})

    return {
        "periodo": periodo,
        "dias": janela["dias"],
        "since": janela["since"],
        "until": janela["until"],
        "ig_user_id": ig_id,
        "totais": totais,
        "series": series,
        "avisos": avisos,
    }


def metricas_para_midia(media_type: str | None, media_product_type: str | None) -> list[str]:
    mpt = (media_product_type or "").upper()
    mt = (media_type or "").upper()
    if mpt == "REELS" or mt == "REELS":
        return list(METRICAS_MIDIA["REELS"])
    if mt in METRICAS_MIDIA:
        return list(METRICAS_MIDIA[mt])
    return list(METRICAS_MIDIA["IMAGE"])


def obter_insights_midia(cfg: dict, media_id: str, media_type: str | None, mpt: str | None) -> dict:
    metricas = metricas_para_midia(media_type, mpt)
    resultado: dict = {}
    avisos: list = []

    # tenta pacote completo
    try:
        resp = graph_request(
            "GET",
            f"/{media_id}/insights",
            cfg,
            {"metric": ",".join(metricas)},
        )
        for item in resp.get("data") or []:
            nome = item.get("name")
            if nome:
                resultado[nome] = valor_insight(item)
        return {"insights": resultado, "avisos": avisos}
    except RuntimeError as exc:
        avisos.append({"lote": ",".join(metricas), "erro": str(exc)})

    # fallback: uma a uma
    for metrica in metricas:
        try:
            resp = graph_request(
                "GET",
                f"/{media_id}/insights",
                cfg,
                {"metric": metrica},
            )
            itens = resp.get("data") or []
            if itens:
                resultado[metrica] = valor_insight(itens[0])
        except RuntimeError as exc:
            avisos.append({"metrica": metrica, "erro": str(exc)})

    return {"insights": resultado, "avisos": avisos}


def listar_midias(cfg: dict, ig_id: str, limit: int) -> list[dict]:
    coletadas: list[dict] = []
    params: dict = {"fields": CAMPOS_MIDIA, "limit": min(limit, 50)}
    after = None

    while len(coletadas) < limit:
        p = dict(params)
        if after:
            p["after"] = after
        resp = graph_request("GET", f"/{ig_id}/media", cfg, p)
        lote = resp.get("data") if isinstance(resp.get("data"), list) else []
        if not lote:
            break
        for item in lote:
            if len(coletadas) >= limit:
                break
            mid = dict(item)
            caption = mid.get("caption") or ""
            mid["caption_excerpt"] = caption[:280] + ("…" if len(caption) > 280 else "")
            # insights por item
            ig = obter_insights_midia(
                cfg,
                str(mid.get("id")),
                mid.get("media_type"),
                mid.get("media_product_type"),
            )
            mid["insights"] = ig.get("insights") or {}
            if ig.get("avisos"):
                mid["insights_avisos"] = ig["avisos"]
            coletadas.append(mid)

        paging = resp.get("paging") or {}
        cursors = paging.get("cursors") or {}
        after = cursors.get("after")
        if not after or not paging.get("next"):
            break

    return coletadas


def escrever_json(path: Path, dados) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def resumo_midias(midias: list[dict], followers: int | None) -> dict:
    por_tipo: dict[str, int] = {}
    views_vals: list[tuple[dict, float]] = []
    inter_vals: list[tuple[dict, float]] = []

    for m in midias:
        tipo = (m.get("media_product_type") or m.get("media_type") or "UNKNOWN").upper()
        por_tipo[tipo] = por_tipo.get(tipo, 0) + 1
        ig = m.get("insights") or {}
        views = ig.get("views")
        if views is None:
            views = ig.get("plays")
        if views is not None:
            try:
                views_vals.append((m, float(views)))
            except (TypeError, ValueError):
                pass
        inter = ig.get("total_interactions")
        if inter is None:
            likes = m.get("like_count") or 0
            comments = m.get("comments_count") or 0
            try:
                inter = int(likes) + int(comments)
            except (TypeError, ValueError):
                inter = None
        if inter is not None:
            try:
                inter_vals.append((m, float(inter)))
            except (TypeError, ValueError):
                pass

    def top3(pares: list[tuple[dict, float]], chave: str) -> list[dict]:
        ordenados = sorted(pares, key=lambda x: x[1], reverse=True)[:3]
        out = []
        for m, val in ordenados:
            eng = None
            if followers and followers > 0:
                likes = m.get("like_count") or 0
                comments = m.get("comments_count") or 0
                try:
                    eng = round((int(likes) + int(comments)) / followers, 4)
                except (TypeError, ValueError):
                    eng = None
            out.append(
                {
                    "id": m.get("id"),
                    "media_type": m.get("media_type"),
                    "media_product_type": m.get("media_product_type"),
                    "permalink": m.get("permalink"),
                    "timestamp": m.get("timestamp"),
                    chave: val,
                    "like_count": m.get("like_count"),
                    "comments_count": m.get("comments_count"),
                    "engajamento_aprox": eng,
                }
            )
        return out

    return {
        "amostra": len(midias),
        "por_tipo": por_tipo,
        "top_views": top3(views_vals, "views"),
        "top_interacoes": top3(inter_vals, "interacoes"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Analisa a conta Instagram conectada via Meta API."
    )
    parser.add_argument("--limit", type=int, default=30, help="Nº de mídias recentes (padrão 30)")
    parser.add_argument(
        "--periodo",
        choices=sorted(PERIODOS),
        default="days_28",
        help="Janela de insights de conta (padrão days_28)",
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Pasta para JSON brutos. Se vazio, usa saidas/analises/instagram/<user>/dados-brutos-<data>",
    )
    parser.add_argument(
        "--checar-config",
        action="store_true",
        help="Só verifica se META_ACCESS_TOKEN está configurado e sai",
    )
    args = parser.parse_args()

    carregar_dotenv()
    cfg = meta_cfg()
    status = verificar_config(cfg)

    if args.checar_config:
        print(json.dumps({"ok": status["configurado"], **status}, ensure_ascii=False, indent=2))
        return 0 if status["configurado"] else 2

    if not status["configurado"]:
        print(
            json.dumps(
                {
                    "ok": False,
                    "erro": "META_ACCESS_TOKEN ausente em interface/.env",
                    **status,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 2

    try:
        ig_id = resolver_ig_user_id(cfg)
        perfil = obter_perfil(cfg, ig_id)
        insights = obter_insights_conta(cfg, ig_id, args.periodo)
        midias = listar_midias(cfg, ig_id, max(1, args.limit))
    except RuntimeError as exc:
        print(
            json.dumps(
                {"ok": False, "erro": str(exc), **status},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1

    username = perfil.get("username") or "conta"
    hoje = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if args.output_dir:
        out_dir = Path(args.output_dir)
        if not out_dir.is_absolute():
            out_dir = ROOT / out_dir
    else:
        out_dir = ROOT / "saidas" / "analises" / "instagram" / username / f"dados-brutos-{hoje}"

    escrever_json(out_dir / "perfil.json", perfil)
    escrever_json(out_dir / "insights-conta.json", insights)
    escrever_json(out_dir / "midias.json", {"limit": args.limit, "itens": midias})

    resumo = resumo_midias(midias, perfil.get("followers_count"))
    saida = {
        "ok": True,
        **status,
        "coletado_em": datetime.now(timezone.utc).isoformat(),
        "output_dir": str(out_dir.relative_to(ROOT)).replace("\\", "/"),
        "perfil": {
            "username": perfil.get("username"),
            "name": perfil.get("name"),
            "account_type": perfil.get("account_type"),
            "followers_count": perfil.get("followers_count"),
            "follows_count": perfil.get("follows_count"),
            "media_count": perfil.get("media_count"),
        },
        "periodo": args.periodo,
        "insights_totais": insights.get("totais"),
        "insights_avisos": insights.get("avisos"),
        "midias_resumo": resumo,
    }
    print(json.dumps(saida, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
