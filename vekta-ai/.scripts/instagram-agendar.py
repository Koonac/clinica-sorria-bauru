#!/usr/bin/env python3
"""Agenda ou publica post/Reels/Stories no Instagram via a fila da interface.

Usado pela skill /instagram-publish. Grava em materiais/instagram/ (mesma
fila da aba Agendar) e, se --agora / horário já due, tenta publicar na Meta.

Requer interface/.env (META_ACCESS_TOKEN). Publish real exige
META_PUBLIC_BASE_URL e a interface rodando (rota pública de mídia).
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PASTA = ROOT / "materiais" / "instagram"
PASTA_MIDIAS = PASTA / "midias"
PASTA_LOGS = PASTA / "logs"
ARQUIVO_FILA = PASTA / "fila.json"
ARQUIVO_TOKENS = PASTA / "public-tokens.json"

MIME_POR_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
}
EXT_POR_MIME = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
}
CAROUSEL_MIN = 2
CAROUSEL_MAX = 10
MAX_TENTATIVAS = 3
TTL_TOKEN_MS = 15 * 60 * 1000
POLL_INTERVAL_S = 3
POLL_MAX = 40


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
        "public_base": env("META_PUBLIC_BASE_URL").rstrip("/"),
    }


def garantir_pastas() -> None:
    PASTA_MIDIAS.mkdir(parents=True, exist_ok=True)
    PASTA_LOGS.mkdir(parents=True, exist_ok=True)


def ler_json(path: Path, default):
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def escrever_json_atomico(path: Path, dados) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def ler_fila() -> list:
    garantir_pastas()
    bruto = ler_json(ARQUIVO_FILA, [])
    return bruto if isinstance(bruto, list) else []


def escrever_fila(itens: list) -> None:
    escrever_json_atomico(ARQUIVO_FILA, itens)


def novo_id() -> str:
    agora = datetime.now(timezone.utc)
    stamp = agora.strftime("%Y%m%d%H%M")
    return f"ig-{stamp}-{secrets.token_hex(3)}"


def resolver_input(texto: str) -> Path:
    p = Path(texto)
    if not p.is_absolute():
        p = ROOT / p
    return p.resolve()


def mime_de(path: Path, tipo: str) -> str:
    ext = path.suffix.lower()
    mime = MIME_POR_EXT.get(ext)
    if not mime:
        raise SystemExit(
            f"Error: extensão {ext or '(sem ext)'} não suportada. "
            "IMAGE/CAROUSEL: .jpg/.png; REELS: .mp4/.mov; STORIES: imagem ou vídeo"
        )
    if tipo in ("IMAGE", "CAROUSEL") and not mime.startswith("image/"):
        raise SystemExit(f"Error: tipo {tipo} exige JPEG ou PNG.")
    if tipo == "REELS" and not mime.startswith("video/"):
        raise SystemExit("Error: tipo REELS exige MP4 ou MOV.")
    if tipo == "STORIES" and not (
        mime.startswith("image/") or mime.startswith("video/")
    ):
        raise SystemExit("Error: tipo STORIES exige JPEG/PNG ou MP4/MOV.")
    return mime


def listar_midias_item(item: dict) -> list[dict]:
    if isinstance(item.get("arquivos"), list) and item["arquivos"]:
        return item["arquivos"]
    return [{"arquivo": item.get("arquivo"), "media_type": item.get("media_type")}]


def apagar_midias_item(item: dict) -> None:
    vistos = set()
    for midia in listar_midias_item(item):
        arq = midia.get("arquivo")
        if arq and arq not in vistos:
            vistos.add(arq)
            apagar_midia(arq)


def parse_quando_local(texto: str) -> str | None:
    s = (texto or "").strip()
    if not s:
        return None
    if s.endswith("Z") or (
        len(s) > 5 and (s[-6] in "+-" and s[-3] == ":")
    ):
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            return None
    # Horário local da máquina: AAAA-MM-DDTHH:mm[:ss]
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            d = datetime.strptime(s, fmt).astimezone()
            return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    try:
        d = datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.astimezone()
        return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return None


def iso_agora() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def enfileirar(
    *,
    tipo: str,
    legenda: str,
    agendado_para: str,
    origens: list[Path],
) -> dict:
    garantir_pastas()
    item_id = novo_id()
    arquivos = []

    if tipo == "CAROUSEL":
        if len(origens) < CAROUSEL_MIN or len(origens) > CAROUSEL_MAX:
            raise SystemExit(
                f"Error: carrossel exige entre {CAROUSEL_MIN} e {CAROUSEL_MAX} imagens."
            )
        for i, origem in enumerate(origens, start=1):
            mime = mime_de(origem, "CAROUSEL")
            ext = EXT_POR_MIME.get(mime, origem.suffix.lower() or ".bin")
            if ext == ".jpeg":
                ext = ".jpg"
            rel = f"materiais/instagram/midias/{item_id}-{i}{ext}"
            (ROOT / rel).write_bytes(origem.read_bytes())
            arquivos.append(
                {
                    "arquivo": rel.replace("\\", "/"),
                    "media_type": mime,
                    "nome_original": origem.name[:120],
                }
            )
    else:
        if len(origens) != 1:
            raise SystemExit("Error: este tipo aceita apenas um --input.")
        origem = origens[0]
        mime = mime_de(origem, tipo)
        ext = EXT_POR_MIME.get(mime, origem.suffix.lower() or ".bin")
        if ext == ".jpeg":
            ext = ".jpg"
        rel = f"materiais/instagram/midias/{item_id}{ext}"
        (ROOT / rel).write_bytes(origem.read_bytes())
        arquivos.append(
            {
                "arquivo": rel.replace("\\", "/"),
                "media_type": mime,
                "nome_original": origem.name[:120],
            }
        )

    primeiro = arquivos[0]
    item = {
        "id": item_id,
        "tipo": tipo,
        "legenda": (legenda or "")[:2200],
        "arquivo": primeiro["arquivo"],
        "media_type": primeiro["media_type"],
        "nome_original": primeiro["nome_original"],
        "arquivos": arquivos,
        "agendado_para": agendado_para,
        "status": "pendente",
        "tentativas": 0,
        "ultimo_erro": None,
        "criado_em": iso_agora(),
    }
    fila = ler_fila()
    fila.append(item)
    escrever_fila(fila)
    return item


def obter_por_id(item_id: str) -> dict | None:
    for item in ler_fila():
        if item.get("id") == item_id:
            return item
    return None


def atualizar_item(item_id: str, patch: dict) -> dict | None:
    fila = ler_fila()
    for i, item in enumerate(fila):
        if item.get("id") == item_id:
            fila[i] = {**item, **patch}
            escrever_fila(fila)
            return fila[i]
    return None


def remover_da_fila(item_id: str) -> dict | None:
    fila = ler_fila()
    achado = next((i for i in fila if i.get("id") == item_id), None)
    if not achado:
        return None
    escrever_fila([i for i in fila if i.get("id") != item_id])
    return achado


def apagar_midia(arquivo_rel: str | None) -> bool:
    if not arquivo_rel:
        return False
    alvo = (ROOT / arquivo_rel).resolve()
    raiz = PASTA_MIDIAS.resolve()
    try:
        alvo.relative_to(raiz)
    except ValueError:
        return False
    if alvo.is_file():
        alvo.unlink()
        return True
    return False


def cancelar(item_id: str) -> dict:
    item = obter_por_id(item_id)
    if not item:
        raise SystemExit(f"Error: agendamento não encontrado: {item_id}")
    if item.get("status") == "publicando":
        raise SystemExit("Error: não é possível cancelar enquanto está publicando.")
    remover_da_fila(item_id)
    apagar_midias_item(item)
    return {"id": item_id, "cancelado": True}


def listar_logs(limite: int = 20) -> list:
    garantir_pastas()
    arquivos = sorted(
        PASTA_LOGS.glob("*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )[:limite]
    logs = []
    for arq in arquivos:
        try:
            logs.append(json.loads(arq.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            continue
    return logs


def gravar_log(log: dict) -> dict:
    garantir_pastas()
    escrever_json_atomico(PASTA_LOGS / f"{log['id']}.json", log)
    return log


def emitir_token(
    item: dict,
    public_base: str,
    midia: dict | None = None,
) -> tuple[str, str]:
    if not public_base:
        raise RuntimeError(
            "META_PUBLIC_BASE_URL não configurada. A Meta precisa de uma URL HTTPS pública."
        )
    midia = midia or {"arquivo": item.get("arquivo"), "media_type": item.get("media_type")}
    arquivo_rel = midia.get("arquivo") or item.get("arquivo")
    abs_midia = ROOT / arquivo_rel
    if not abs_midia.is_file():
        raise RuntimeError("Arquivo de mídia não encontrado no disco.")

    mapa = ler_json(ARQUIVO_TOKENS, {})
    if not isinstance(mapa, dict):
        mapa = {}
    agora_ms = int(time.time() * 1000)
    mapa = {k: v for k, v in mapa.items() if isinstance(v, dict) and v.get("expiraEm", 0) > agora_ms}

    token = secrets.token_hex(24)
    mapa[token] = {
        "arquivoRel": arquivo_rel,
        "mime": midia.get("media_type") or item.get("media_type") or "application/octet-stream",
        "expiraEm": agora_ms + TTL_TOKEN_MS,
    }
    escrever_json_atomico(ARQUIVO_TOKENS, mapa)
    url = f"{public_base}/api/instagram/public-media/{token}"
    return token, url


def invalidar_token(token: str | None) -> None:
    if not token:
        return
    mapa = ler_json(ARQUIVO_TOKENS, {})
    if isinstance(mapa, dict) and token in mapa:
        del mapa[token]
        escrever_json_atomico(ARQUIVO_TOKENS, mapa)


def invalidar_tokens(tokens: list[str]) -> None:
    if not tokens:
        return
    mapa = ler_json(ARQUIVO_TOKENS, {})
    if not isinstance(mapa, dict):
        return
    mudou = False
    for token in tokens:
        if token and token in mapa:
            del mapa[token]
            mudou = True
    if mudou:
        escrever_json_atomico(ARQUIVO_TOKENS, mapa)


def graph_request(method: str, caminho: str, cfg: dict, params: dict | None = None) -> dict:
    if not cfg["token"]:
        raise RuntimeError("META_ACCESS_TOKEN ausente em interface/.env")
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
        raise RuntimeError("Não foi possível obter user_id via /me. Defina META_IG_USER_ID.")
    return str(uid)


def aguardar_container(cfg: dict, container_id: str) -> dict:
    ultimo = {}
    for _ in range(POLL_MAX):
        status = graph_request(
            "GET",
            f"/{container_id}",
            cfg,
            {"fields": "status_code,status"},
        )
        ultimo = status
        code = status.get("status_code")
        if code == "FINISHED":
            return status
        if code in ("ERROR", "EXPIRED"):
            raise RuntimeError(status.get("status") or f"Container {code}")
        time.sleep(POLL_INTERVAL_S)
    raise RuntimeError("Timeout aguardando container de mídia.")


def publicar_item(item: dict, cfg: dict) -> dict:
    tokens_pub: list[str] = []
    api_trace: dict = {
        "children": [],
        "container": None,
        "container_status": None,
        "publish": None,
    }
    try:
        ig_id = resolver_ig_user_id(cfg)
        tipo = item.get("tipo")
        container_id = None

        if tipo == "CAROUSEL":
            midias = listar_midias_item(item)
            if len(midias) < CAROUSEL_MIN:
                raise RuntimeError("Carrossel sem mídias suficientes.")
            child_ids = []
            for midia in midias:
                token_pub, url = emitir_token(item, cfg["public_base"], midia)
                tokens_pub.append(token_pub)
                child = graph_request(
                    "POST",
                    f"/{ig_id}/media",
                    cfg,
                    {"image_url": url, "is_carousel_item": "true"},
                )
                cid = child.get("id")
                if not cid:
                    raise RuntimeError("Meta não retornou ID do item do carrossel.")
                child_status = aguardar_container(cfg, cid)
                api_trace["children"].append({"container": child, "status": child_status})
                child_ids.append(cid)

            container = graph_request(
                "POST",
                f"/{ig_id}/media",
                cfg,
                {
                    "media_type": "CAROUSEL",
                    "children": json.dumps(child_ids),
                    "caption": item.get("legenda") or "",
                },
            )
            api_trace["container"] = container
            container_id = container.get("id")
        else:
            midia = listar_midias_item(item)[0]
            token_pub, url = emitir_token(item, cfg["public_base"], midia)
            tokens_pub.append(token_pub)
            mime = str(midia.get("media_type") or item.get("media_type") or "").lower()
            arquivo = str(midia.get("arquivo") or item.get("arquivo") or "").lower()
            eh_video = mime.startswith("video/") or arquivo.endswith((".mp4", ".mov"))

            params: dict = {}
            if tipo == "STORIES":
                params["media_type"] = "STORIES"
                if eh_video:
                    params["video_url"] = url
                else:
                    params["image_url"] = url
            elif tipo == "REELS":
                params["media_type"] = "REELS"
                params["video_url"] = url
                params["caption"] = item.get("legenda") or ""
            else:
                params["image_url"] = url
                params["caption"] = item.get("legenda") or ""

            container = graph_request("POST", f"/{ig_id}/media", cfg, params)
            api_trace["container"] = container
            container_id = container.get("id")

        if not container_id:
            raise RuntimeError("Meta não retornou ID do container.")

        status_c = aguardar_container(cfg, container_id)
        api_trace["container_status"] = status_c

        publish = graph_request(
            "POST",
            f"/{ig_id}/media_publish",
            cfg,
            {"creation_id": container_id},
        )
        api_trace["publish"] = publish

        enviado_em = iso_agora()
        arquivos_removidos = [
            m.get("arquivo") for m in listar_midias_item(item) if m.get("arquivo")
        ]
        apagar_midias_item(item)
        remover_da_fila(item["id"])
        invalidar_tokens(tokens_pub)

        return gravar_log(
            {
                "id": item["id"],
                "tipo": item.get("tipo"),
                "legenda": item.get("legenda") or "",
                "agendado_para": item.get("agendado_para"),
                "enviado_em": enviado_em,
                "arquivo_removido": arquivos_removidos[0] if arquivos_removidos else None,
                "arquivos_removidos": arquivos_removidos,
                "api": {
                    "container_id": container_id,
                    "media_id": publish.get("id"),
                    "children": api_trace["children"],
                    "container": api_trace["container"],
                    "container_status": api_trace["container_status"],
                    "publish": api_trace["publish"],
                },
            }
        )
    except Exception:
        invalidar_tokens(tokens_pub)
        raise


def processar_item(item_id: str, cfg: dict) -> dict:
    atual = obter_por_id(item_id)
    if not atual or atual.get("status") != "pendente":
        return {"ok": False, "erro": "Item não está pendente."}

    locked = atualizar_item(
        item_id,
        {"status": "publicando", "publicando_desde": iso_agora()},
    )
    if not locked:
        return {"ok": False, "erro": "Falha ao travar item."}

    try:
        log = publicar_item(locked, cfg)
        return {"ok": True, "log": log}
    except Exception as exc:
        tentativas = int(locked.get("tentativas") or 0) + 1
        status_final = "erro" if tentativas >= MAX_TENTATIVAS else "pendente"
        atualizar_item(
            item_id,
            {
                "status": status_final,
                "tentativas": tentativas,
                "ultimo_erro": str(exc),
                "publicando_desde": None,
            },
        )
        return {
            "ok": False,
            "id": item_id,
            "erro": str(exc),
            "status": status_final,
            "tentativas": tentativas,
        }


def parse_args():
    p = argparse.ArgumentParser(
        description="Agenda ou publica post/Reels/Stories/Carrossel no Instagram"
    )
    p.add_argument(
        "--input",
        "-i",
        action="append",
        help="Arquivo de mídia (repetir para carrossel: -i a.jpg -i b.jpg)",
    )
    p.add_argument(
        "--tipo",
        "-t",
        choices=[
            "IMAGE",
            "REELS",
            "STORIES",
            "CAROUSEL",
            "image",
            "reels",
            "stories",
            "carousel",
        ],
        help="IMAGE, CAROUSEL, REELS ou STORIES",
    )
    p.add_argument("--legenda", "-l", default="", help="Legenda do post")
    p.add_argument(
        "--quando",
        "-q",
        help='Horário LOCAL: AAAA-MM-DDTHH:mm (ex.: 2026-07-26T18:00)',
    )
    p.add_argument("--agora", action="store_true", help="Publicar / enfileirar para agora")
    p.add_argument("--listar", action="store_true", help="Lista fila e logs recentes")
    p.add_argument("--cancelar", help="Cancela item pendente/erro pelo id")
    return p.parse_args()


def main():
    carregar_dotenv()
    args = parse_args()
    cfg = meta_cfg()

    if args.listar:
        print(
            json.dumps(
                {
                    "public_base_url_ok": bool(cfg["public_base"]),
                    "configurado": bool(cfg["token"]),
                    "fila": ler_fila(),
                    "logs_recentes": listar_logs(20),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    if args.cancelar:
        print(json.dumps(cancelar(args.cancelar), ensure_ascii=False, indent=2))
        return

    if not args.input or not args.tipo:
        print(
            "Error: informe --input e --tipo (IMAGE|CAROUSEL|REELS|STORIES), "
            "ou use --listar / --cancelar.",
            file=sys.stderr,
        )
        sys.exit(2)

    tipo = args.tipo.upper()
    origens = []
    for texto in args.input:
        origem = resolver_input(texto)
        if not origem.is_file():
            print(f"Error: arquivo não encontrado: {texto}", file=sys.stderr)
            sys.exit(1)
        origens.append(origem)

    if args.agora:
        agendado = iso_agora()
    else:
        agendado = parse_quando_local(args.quando or "")
    if not agendado:
        print('Error: informe --agora ou --quando "AAAA-MM-DDTHH:mm"', file=sys.stderr)
        sys.exit(2)

    item = enfileirar(
        tipo=tipo,
        legenda=args.legenda,
        agendado_para=agendado,
        origens=origens,
    )

    due = datetime.fromisoformat(agendado.replace("Z", "+00:00")).timestamp() <= time.time()
    publish_result = None
    if due and cfg["token"]:
        publish_result = processar_item(item["id"], cfg)

    atual = obter_por_id(item["id"])
    saida = {
        "ok": True,
        "item": atual,
        "log": (publish_result or {}).get("log") if publish_result and publish_result.get("ok") else None,
        "publicado": bool(publish_result and publish_result.get("ok")),
        "publish_erro": None
        if not publish_result or publish_result.get("ok")
        else publish_result.get("erro"),
        "agendado": (not due) or (bool(atual) and not (publish_result and publish_result.get("ok"))),
        "public_base_url_ok": bool(cfg["public_base"]),
    }
    print(json.dumps(saida, ensure_ascii=False, indent=2))
    if due and publish_result and not publish_result.get("ok"):
        sys.exit(1)


if __name__ == "__main__":
    main()
