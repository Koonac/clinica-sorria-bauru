#!/usr/bin/env python3
"""Cria, lista, atualiza ou exclui eventos no Google Calendar.

Usado pela skill /agenda-google. Lê interface/.env
(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN).

Stdout: JSON. Stderr: mensagens humanas.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
API_BASE = "https://www.googleapis.com/calendar/v3"
TOKEN_URL = "https://www.googleapis.com/oauth2/v3/token"
TZ_PADRAO = "America/Sao_Paulo"


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


def cfg() -> dict:
    client_id = (
        env("GOOGLE_CLIENT_ID")
        or env("GOOGLE_ADS_CLIENT_ID")
        or env("GOOGLE_CALENDAR_CLIENT_ID")
    )
    client_secret = (
        env("GOOGLE_CLIENT_SECRET")
        or env("GOOGLE_ADS_CLIENT_SECRET")
        or env("GOOGLE_CALENDAR_CLIENT_SECRET")
    )
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": env("GOOGLE_CALENDAR_REFRESH_TOKEN"),
        "calendar_id": env("GOOGLE_CALENDAR_CALENDAR_ID", "primary") or "primary",
        "tz": env("GOOGLE_CALENDAR_TIMEZONE", TZ_PADRAO) or TZ_PADRAO,
    }


def sair_erro(msg: str, codigo: int = 1, **extra) -> None:
    print(json.dumps({"ok": False, "erro": msg, **extra}, ensure_ascii=False), flush=True)
    sys.exit(codigo)


def http_json(url: str, *, method: str = "GET", headers: dict | None = None, body=None):
    data = None
    hdrs = dict(headers or {})
    if body is not None:
        if isinstance(body, (dict, list)):
            data = json.dumps(body).encode("utf-8")
            hdrs.setdefault("Content-Type", "application/json")
        elif isinstance(body, str):
            data = body.encode("utf-8")
        else:
            data = body
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            if resp.status == 204 or not raw:
                return None
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            detalhe = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            detalhe = {"raw": raw}
        msg = (
            (detalhe.get("error") or {}).get("message")
            if isinstance(detalhe.get("error"), dict)
            else None
        ) or detalhe.get("error_description") or detalhe.get("error") or f"HTTP {e.code}"
        raise RuntimeError(str(msg)) from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Falha de rede: {e.reason}") from e


def obter_access_token(c: dict) -> str:
    if not c["client_id"] or not c["client_secret"] or not c["refresh_token"]:
        sair_erro(
            "Google Calendar não configurado. Defina GOOGLE_CLIENT_ID, "
            "GOOGLE_CLIENT_SECRET e GOOGLE_CALENDAR_REFRESH_TOKEN em interface/.env."
        )
    corpo = urllib.parse.urlencode(
        {
            "grant_type": "refresh_token",
            "client_id": c["client_id"],
            "client_secret": c["client_secret"],
            "refresh_token": c["refresh_token"],
        }
    )
    dados = http_json(
        TOKEN_URL,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        body=corpo,
    )
    token = (dados or {}).get("access_token")
    if not token:
        sair_erro("OAuth não devolveu access_token.", detalhe=dados)
    return token


def calendar_fetch(c: dict, path: str, *, method: str = "GET", body=None):
    token = obter_access_token(c)
    url = path if path.startswith("http") else f"{API_BASE}{path}"
    return http_json(
        url,
        method=method,
        headers={"Authorization": f"Bearer {token}"},
        body=body,
    )


def zona(c: dict):
    nome = c.get("tz") or TZ_PADRAO
    try:
        return ZoneInfo(nome)
    except Exception:
        # Windows sem pacote tzdata: fallback fixo UTC-3 (Brasil sem DST desde 2019)
        return timezone(timedelta(hours=-3), name=nome)


def parse_local(texto: str, tz) -> datetime:
    """Aceita AAAA-MM-DDTHH:mm ou AAAA-MM-DDTHH:mm:ss (horário local)."""
    s = texto.strip().replace(" ", "T")
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S"):
        try:
            naive = datetime.strptime(s, fmt)
            return naive.replace(tzinfo=tz)
        except ValueError:
            continue
    raise ValueError(f"Data/hora inválida: {texto!r} (use AAAA-MM-DDTHH:mm)")


def parse_dia(texto: str) -> date:
    s = texto.strip()[:10]
    return date.fromisoformat(s)


def normalizar_evento(ev: dict) -> dict:
    start = ev.get("start") or {}
    end = ev.get("end") or {}
    all_day = bool(start.get("date") and not start.get("dateTime"))
    return {
        "id": ev.get("id"),
        "summary": ev.get("summary") or "(Sem título)",
        "description": ev.get("description") or "",
        "location": ev.get("location") or "",
        "htmlLink": ev.get("htmlLink"),
        "status": ev.get("status"),
        "allDay": all_day,
        "start": start.get("date") if all_day else start.get("dateTime"),
        "end": end.get("date") if all_day else end.get("dateTime"),
    }


def montar_horario(args, c: dict) -> dict:
    """Monta start/end (e opcionalmente summary/description/location)."""
    tz = zona(c)
    corpo: dict = {}
    titulo = getattr(args, "titulo", None)
    if isinstance(titulo, str) and titulo.strip():
        corpo["summary"] = titulo.strip()
    descricao = getattr(args, "descricao", None)
    if isinstance(descricao, str) and descricao != "":
        corpo["description"] = descricao
    local = getattr(args, "local", None)
    if isinstance(local, str) and local != "":
        corpo["location"] = local

    if args.dia_inteiro:
        ini = parse_dia(args.inicio)
        if args.fim:
            fim = parse_dia(args.fim)
        else:
            fim = ini
        # Google: end.date é exclusivo
        fim_excl = fim + timedelta(days=1)
        corpo["start"] = {"date": ini.isoformat()}
        corpo["end"] = {"date": fim_excl.isoformat()}
        return corpo

    ini = parse_local(args.inicio, tz)
    if args.fim:
        fim = parse_local(args.fim, tz)
    else:
        fim = ini + timedelta(hours=1)
    if fim <= ini:
        raise ValueError("Fim deve ser depois do início.")
    corpo["start"] = {"dateTime": ini.isoformat(), "timeZone": str(tz)}
    corpo["end"] = {"dateTime": fim.isoformat(), "timeZone": str(tz)}
    return corpo


def cmd_criar(args, c: dict) -> None:
    if not args.titulo or not args.titulo.strip():
        sair_erro("Informe --titulo.")
    if not args.inicio:
        sair_erro("Informe --inicio (AAAA-MM-DDTHH:mm ou AAAA-MM-DD se --dia-inteiro).")
    try:
        corpo = montar_horario(args, c)
    except ValueError as e:
        sair_erro(str(e))
    if "summary" not in corpo:
        sair_erro("Informe --titulo.")

    cal = urllib.parse.quote(c["calendar_id"], safe="")
    criado = calendar_fetch(c, f"/calendars/{cal}/events", method="POST", body=corpo)
    print(
        json.dumps(
            {"ok": True, "acao": "criar", "evento": normalizar_evento(criado or {})},
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


def cmd_listar(args, c: dict) -> None:
    tz = zona(c)
    if args.desde:
        time_min = parse_local(args.desde, tz) if "T" in args.desde else datetime.combine(
            parse_dia(args.desde), datetime.min.time(), tzinfo=tz
        )
    else:
        agora = datetime.now(tz)
        time_min = agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    if args.ate:
        if "T" in args.ate:
            time_max = parse_local(args.ate, tz)
        else:
            d = parse_dia(args.ate) + timedelta(days=1)
            time_max = datetime.combine(d, datetime.min.time(), tzinfo=tz)
    else:
        # fim exclusivo do mês seguinte
        if time_min.month == 12:
            time_max = time_min.replace(year=time_min.year + 1, month=1)
        else:
            time_max = time_min.replace(month=time_min.month + 1)

    cal = urllib.parse.quote(c["calendar_id"], safe="")
    params = urllib.parse.urlencode(
        {
            "timeMin": time_min.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "timeMax": time_max.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": "250",
        }
    )
    dados = calendar_fetch(c, f"/calendars/{cal}/events?{params}")
    eventos = [normalizar_evento(e) for e in (dados or {}).get("items") or []]
    print(
        json.dumps(
            {
                "ok": True,
                "acao": "listar",
                "timeMin": time_min.isoformat(),
                "timeMax": time_max.isoformat(),
                "eventos": eventos,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


def cmd_atualizar(args, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id do evento.")
    corpo: dict = {}
    if args.titulo is not None and args.titulo.strip():
        corpo["summary"] = args.titulo.strip()
    if args.descricao is not None:
        corpo["description"] = args.descricao
    if args.local is not None:
        corpo["location"] = args.local
    if args.inicio or args.fim or args.dia_inteiro:
        if not args.inicio:
            sair_erro("Ao alterar horário, informe --inicio (e --fim se precisar).")
        try:
            corpo.update(montar_horario(args, c))
        except ValueError as e:
            sair_erro(str(e))
    if not corpo:
        sair_erro("Nada para atualizar. Passe --titulo, --descricao, --local e/ou horário.")

    cal = urllib.parse.quote(c["calendar_id"], safe="")
    eid = urllib.parse.quote(args.id, safe="")
    atualizado = calendar_fetch(
        c, f"/calendars/{cal}/events/{eid}", method="PATCH", body=corpo
    )
    print(
        json.dumps(
            {"ok": True, "acao": "atualizar", "evento": normalizar_evento(atualizado or {})},
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


def cmd_excluir(args, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id do evento.")
    cal = urllib.parse.quote(c["calendar_id"], safe="")
    eid = urllib.parse.quote(args.id, safe="")
    calendar_fetch(c, f"/calendars/{cal}/events/{eid}", method="DELETE")
    print(
        json.dumps({"ok": True, "acao": "excluir", "id": args.id}, ensure_ascii=False, indent=2),
        flush=True,
    )


def main() -> None:
    carregar_dotenv()
    parser = argparse.ArgumentParser(description="Google Calendar — agendar eventos (Vekta AI)")
    sub = parser.add_subparsers(dest="comando", required=True)

    p_criar = sub.add_parser("criar", help="Criar evento")
    p_criar.add_argument("--titulo", required=True)
    p_criar.add_argument("--inicio", required=True, help="AAAA-MM-DDTHH:mm ou AAAA-MM-DD")
    p_criar.add_argument("--fim", default="", help="Opcional; default +1h ou mesmo dia")
    p_criar.add_argument("--descricao", default="")
    p_criar.add_argument("--local", default="")
    p_criar.add_argument("--dia-inteiro", action="store_true")

    p_listar = sub.add_parser("listar", help="Listar eventos")
    p_listar.add_argument("--desde", default="", help="AAAA-MM-DD ou AAAA-MM-DDTHH:mm")
    p_listar.add_argument("--ate", default="", help="AAAA-MM-DD ou AAAA-MM-DDTHH:mm")

    p_upd = sub.add_parser("atualizar", help="Atualizar evento")
    p_upd.add_argument("--id", required=True)
    p_upd.add_argument("--titulo", default=None)
    p_upd.add_argument("--inicio", default="")
    p_upd.add_argument("--fim", default="")
    p_upd.add_argument("--descricao", default=None)
    p_upd.add_argument("--local", default=None)
    p_upd.add_argument("--dia-inteiro", action="store_true")

    p_del = sub.add_parser("excluir", help="Excluir evento")
    p_del.add_argument("--id", required=True)

    args = parser.parse_args()
    c = cfg()

    try:
        if args.comando == "criar":
            cmd_criar(args, c)
        elif args.comando == "listar":
            cmd_listar(args, c)
        elif args.comando == "atualizar":
            cmd_atualizar(args, c)
        elif args.comando == "excluir":
            cmd_excluir(args, c)
        else:
            sair_erro(f"Comando desconhecido: {args.comando}")
    except RuntimeError as e:
        sair_erro(str(e))


if __name__ == "__main__":
    main()
