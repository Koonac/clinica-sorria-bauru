#!/usr/bin/env python3
"""Cliente CLI do CRM Vekta (Laravel Sanctum).

Usado pela skill /crm. Lê BACKEND_URL e BACKEND_API_TOKEN em interface/.env.
Contrato: backend/swagger.json (base /api/v1/crm).

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
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
API_PREFIX = "/api/v1/crm"


def _stdout_utf8() -> None:
    """Evita UnicodeEncodeError no Windows (cp1252) ao imprimir JSON."""
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass


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
    return {
        "url": env("BACKEND_URL", "http://localhost:8000").rstrip("/"),
        "token": env("BACKEND_API_TOKEN"),
    }


def sair_erro(msg: str, codigo: int = 1, **extra: Any) -> None:
    print(json.dumps({"ok": False, "erro": msg, **extra}, ensure_ascii=False), flush=True)
    sys.exit(codigo)


def ok(acao: str, **extra: Any) -> None:
    print(
        json.dumps({"ok": True, "acao": acao, **extra}, ensure_ascii=False, indent=2),
        flush=True,
    )


def parse_json_arg(texto: str | None) -> dict:
    if not texto:
        return {}
    try:
        dados = json.loads(texto)
    except json.JSONDecodeError as e:
        sair_erro(f"JSON inválido em --json: {e}")
    if not isinstance(dados, dict):
        sair_erro("--json deve ser um objeto JSON.")
    return dados


def corp_de_flags(args: argparse.Namespace, mapa: dict[str, str]) -> dict:
    """mapa: atributo argparse -> chave da API."""
    corpo: dict = {}
    for attr, chave in mapa.items():
        val = getattr(args, attr, None)
        if val is None:
            continue
        if isinstance(val, str) and val == "" and chave not in ("lost_reason", "lost_notes"):
            continue
        corpo[chave] = val
    return corpo


def http_crm(
    c: dict,
    caminho: str,
    *,
    method: str = "GET",
    query: dict | None = None,
    body: dict | None = None,
) -> Any:
    if not c["token"]:
        sair_erro(
            "CRM não configurado. Defina BACKEND_URL e BACKEND_API_TOKEN em interface/.env."
        )
    path = caminho if caminho.startswith("/") else f"/{caminho}"
    url = f"{c['url']}{API_PREFIX}{path}"
    if query:
        limpo = {
            k: v
            for k, v in query.items()
            if v is not None and v != ""
        }
        if limpo:
            url = f"{url}?{urllib.parse.urlencode(limpo)}"

    headers = {
        "Authorization": f"Bearer {c['token']}",
        "Accept": "application/json",
    }
    data = None
    if body is not None and method.upper() != "GET":
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
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
            detalhe.get("message")
            or detalhe.get("erro")
            or f"HTTP {e.code}"
        )
        sair_erro(str(msg), http=e.code, detalhes=detalhe.get("errors") or detalhe)
    except urllib.error.URLError as e:
        sair_erro(f"Backend inacessível ({c['url']}): {e.reason}")


# ── Leads ──────────────────────────────────────────────────────────────────


def cmd_leads_listar(args: argparse.Namespace, c: dict) -> None:
    dados = http_crm(
        c,
        "/leads",
        query={
            "page": args.page,
            "status": args.status,
            "search": args.search,
        },
    )
    ok("leads.listar", **(dados or {}))


def cmd_leads_ver(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id do lead.")
    dados = http_crm(c, f"/leads/{args.id}")
    ok("leads.ver", **(dados or {}))


def cmd_leads_criar(args: argparse.Namespace, c: dict) -> None:
    corpo = parse_json_arg(args.json)
    corpo.update(
        corp_de_flags(
            args,
            {
                "nome": "name",
                "titulo": "title",
                "status": "status",
                "email": "email",
                "mobile": "mobile",
                "whatsapp_jid": "whatsapp_jid",
                "instagram": "instagram",
                "organization_name": "organization_name",
                "contact_id": "contact_id",
                "organization_id": "organization_id",
                "owner_id": "owner_id",
                "source_id": "source_id",
                "value": "value",
                "currency": "currency",
                "external_id": "external_id",
                "stage_id": "stage_id",
            },
        )
    )
    if not corpo.get("name"):
        sair_erro("Criar lead exige --nome (ou name em --json).")
    dados = http_crm(c, "/leads", method="POST", body=corpo)
    ok("leads.criar", **(dados or {}))


def cmd_leads_atualizar(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id do lead.")
    corpo = parse_json_arg(args.json)
    corpo.update(
        corp_de_flags(
            args,
            {
                "nome": "name",
                "titulo": "title",
                "status": "status",
                "email": "email",
                "mobile": "mobile",
                "whatsapp_jid": "whatsapp_jid",
                "instagram": "instagram",
                "organization_name": "organization_name",
                "contact_id": "contact_id",
                "organization_id": "organization_id",
                "owner_id": "owner_id",
                "source_id": "source_id",
                "value": "value",
                "currency": "currency",
                "external_id": "external_id",
                "lost_reason": "lost_reason",
            },
        )
    )
    if not corpo:
        sair_erro("Nada para atualizar. Passe flags ou --json.")
    dados = http_crm(c, f"/leads/{args.id}", method="PATCH", body=corpo)
    ok("leads.atualizar", **(dados or {}))


def cmd_leads_mover(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id do lead.")
    if args.stage_id is None:
        sair_erro("Informe --stage-id.")
    corpo: dict = {"stage_id": args.stage_id}
    if args.lost_reason:
        corpo["lost_reason"] = args.lost_reason
    dados = http_crm(c, f"/leads/{args.id}/move", method="POST", body=corpo)
    ok("leads.mover", **(dados or {}))


def cmd_leads_converter(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id do lead.")
    corpo = corp_de_flags(
        args,
        {
            "titulo": "title",
            "stage_id": "stage_id",
            "value": "value",
            "owner_id": "owner_id",
        },
    )
    dados = http_crm(c, f"/leads/{args.id}/convert", method="POST", body=corpo or {})
    ok("leads.converter", **(dados or {}))


def cmd_leads_excluir(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id do lead.")
    dados = http_crm(c, f"/leads/{args.id}", method="DELETE")
    ok("leads.excluir", **(dados or {}))


# ── Deals ──────────────────────────────────────────────────────────────────


def cmd_deals_listar(args: argparse.Namespace, c: dict) -> None:
    dados = http_crm(
        c,
        "/deals",
        query={
            "page": args.page,
            "search": args.search,
        },
    )
    ok("deals.listar", **(dados or {}))


def cmd_deals_ver(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id do deal.")
    dados = http_crm(c, f"/deals/{args.id}")
    ok("deals.ver", **(dados or {}))


def cmd_deals_criar(args: argparse.Namespace, c: dict) -> None:
    corpo = parse_json_arg(args.json)
    corpo.update(
        corp_de_flags(
            args,
            {
                "titulo": "title",
                "contact_id": "contact_id",
                "stage_id": "stage_id",
                "lead_id": "lead_id",
                "organization_id": "organization_id",
                "owner_id": "owner_id",
                "source_id": "source_id",
                "value": "value",
                "currency": "currency",
                "probability": "probability",
                "expected_close_on": "expected_close_on",
            },
        )
    )
    faltando = [k for k in ("title", "contact_id", "stage_id") if not corpo.get(k)]
    if faltando:
        sair_erro(
            "Criar deal exige --titulo, --contact-id e --stage-id "
            f"(faltando: {', '.join(faltando)})."
        )
    dados = http_crm(c, "/deals", method="POST", body=corpo)
    ok("deals.criar", **(dados or {}))


def cmd_deals_atualizar(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id do deal.")
    corpo = parse_json_arg(args.json)
    corpo.update(
        corp_de_flags(
            args,
            {
                "titulo": "title",
                "contact_id": "contact_id",
                "stage_id": "stage_id",
                "organization_id": "organization_id",
                "owner_id": "owner_id",
                "source_id": "source_id",
                "value": "value",
                "currency": "currency",
                "probability": "probability",
                "expected_close_on": "expected_close_on",
                "lost_reason": "lost_reason",
                "lost_notes": "lost_notes",
            },
        )
    )
    if not corpo:
        sair_erro("Nada para atualizar. Passe flags ou --json.")
    dados = http_crm(c, f"/deals/{args.id}", method="PATCH", body=corpo)
    ok("deals.atualizar", **(dados or {}))


def cmd_deals_excluir(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id do deal.")
    dados = http_crm(c, f"/deals/{args.id}", method="DELETE")
    ok("deals.excluir", **(dados or {}))


# ── Pipeline ────────────────────────────────────────────────────────────────


def cmd_pipeline(args: argparse.Namespace, c: dict) -> None:
    if args.kind not in ("lead", "deal"):
        sair_erro("--kind deve ser 'lead' ou 'deal'.")
    dados = http_crm(
        c,
        "/pipeline",
        query={"kind": args.kind, "search": args.search},
    )
    ok("pipeline", kind=args.kind, **(dados or {}))


def cmd_estagios(args: argparse.Namespace, c: dict) -> None:
    dados = http_crm(
        c,
        "/pipeline-stages",
        query={"kind": args.kind} if args.kind else None,
    )
    ok("pipeline.estagios", **(dados or {}))


# ── WhatsApp ────────────────────────────────────────────────────────────────


def destino_do_lead(lead: dict) -> str | None:
    return (
        (lead.get("whatsapp_jid") or "").strip()
        or (lead.get("mobile") or "").strip()
        or None
    )


def cmd_whatsapp_status(args: argparse.Namespace, c: dict) -> None:
    dados = http_crm(c, "/whatsapp")
    ok("whatsapp.status", **(dados or {}))


def cmd_whatsapp_enviar(args: argparse.Namespace, c: dict) -> None:
    mensagem = (args.mensagem or "").strip()
    if not mensagem:
        sair_erro("Informe --mensagem.")

    to = (args.to or "").strip()
    contact_name = (args.contact_name or "").strip() or None
    lead_ref = None

    if args.lead_id:
        resp = http_crm(c, f"/leads/{args.lead_id}")
        lead = (resp or {}).get("data") or {}
        lead_ref = {"id": lead.get("id"), "name": lead.get("name")}
        if not to:
            to = destino_do_lead(lead) or ""
        if not contact_name:
            contact_name = (lead.get("name") or "").strip() or None
        if not to:
            sair_erro(
                f"Lead {args.lead_id} sem mobile/whatsapp_jid. "
                "Passe --to ou atualize o lead."
            )

    if not to:
        sair_erro("Informe --to (telefone/JID) ou --lead-id.")

    corpo: dict = {"to": to, "message": mensagem}
    if contact_name:
        corpo["contact_name"] = contact_name

    dados = http_crm(c, "/whatsapp/send", method="POST", body=corpo)
    ok("whatsapp.enviar", lead=lead_ref, **(dados or {}))


# ── Campanhas WhatsApp ──────────────────────────────────────────────────────


def cmd_campanhas_listar(args: argparse.Namespace, c: dict) -> None:
    dados = http_crm(
        c,
        "/campaigns",
        query={"status": args.status, "per_page": args.per_page},
    )
    ok("campanhas.listar", **(dados or {}))


def cmd_campanhas_ver(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id da campanha.")
    dados = http_crm(c, f"/campaigns/{args.id}")
    ok("campanhas.ver", **(dados or {}))


def cmd_campanhas_criar(args: argparse.Namespace, c: dict) -> None:
    corpo = parse_json_arg(args.json)
    if args.nome:
        corpo["name"] = args.nome
    if args.delay is not None:
        corpo["delay_between_contacts_sec"] = args.delay
    if args.jitter is not None:
        corpo["delay_jitter_sec"] = args.jitter
    if args.mensagem:
        corpo["messages"] = [
            {
                "message_body": args.mensagem,
                "delay_after_sec": args.delay_msg or 10,
            }
        ]
    if not corpo.get("name"):
        sair_erro("Criar campanha exige --nome (ou name em --json).")
    if not corpo.get("messages"):
        sair_erro(
            "Informe --mensagem ou messages em --json "
            '(lista de {message_body, delay_after_sec}).'
        )
    dados = http_crm(c, "/campaigns", method="POST", body=corpo)
    ok("campanhas.criar", **(dados or {}))


def cmd_campanhas_importar(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id da campanha.")
    if not args.csv:
        sair_erro("Informe --csv com o caminho do arquivo.")
    path = Path(args.csv)
    if not path.is_file():
        sair_erro(f"Arquivo CSV não encontrado: {args.csv}")
    csv_content = path.read_text(encoding="utf-8-sig")
    dados = http_crm(
        c,
        f"/campaigns/{args.id}/import-csv",
        method="POST",
        body={"csv_content": csv_content},
    )
    ok("campanhas.importar", **(dados or {}))


def cmd_campanhas_iniciar(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id da campanha.")
    dados = http_crm(c, f"/campaigns/{args.id}/start", method="POST")
    ok("campanhas.iniciar", **(dados or {}))


def cmd_campanhas_pausar(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id da campanha.")
    dados = http_crm(c, f"/campaigns/{args.id}/pause", method="POST")
    ok("campanhas.pausar", **(dados or {}))


def cmd_campanhas_cancelar(args: argparse.Namespace, c: dict) -> None:
    if not args.id:
        sair_erro("Informe --id da campanha.")
    dados = http_crm(c, f"/campaigns/{args.id}/cancel", method="POST")
    ok("campanhas.cancelar", **(dados or {}))


# ── CLI ─────────────────────────────────────────────────────────────────────


def add_lead_fields(p: argparse.ArgumentParser, *, criar: bool = False) -> None:
    if criar:
        p.add_argument("--nome", dest="nome", help="name (obrigatório ao criar)")
    else:
        p.add_argument("--nome", dest="nome")
    p.add_argument("--titulo", dest="titulo")
    p.add_argument("--status", choices=["new", "contacted", "qualified", "unqualified"])
    p.add_argument("--email")
    p.add_argument("--mobile")
    p.add_argument("--whatsapp-jid", dest="whatsapp_jid")
    p.add_argument("--instagram")
    p.add_argument("--organization-name", dest="organization_name")
    p.add_argument("--contact-id", dest="contact_id", type=int)
    p.add_argument("--organization-id", dest="organization_id", type=int)
    p.add_argument("--owner-id", dest="owner_id", type=int)
    p.add_argument("--source-id", dest="source_id", type=int)
    p.add_argument("--value", type=float)
    p.add_argument("--currency")
    p.add_argument("--external-id", dest="external_id")
    if criar:
        p.add_argument("--stage-id", dest="stage_id", type=int)
    else:
        p.add_argument("--lost-reason", dest="lost_reason")
    p.add_argument("--json", help="Objeto JSON (mesclado com as flags)")


def add_deal_fields(p: argparse.ArgumentParser, *, criar: bool = False) -> None:
    p.add_argument("--titulo", dest="titulo")
    p.add_argument("--contact-id", dest="contact_id", type=int)
    p.add_argument("--stage-id", dest="stage_id", type=int)
    p.add_argument("--lead-id", dest="lead_id", type=int)
    p.add_argument("--organization-id", dest="organization_id", type=int)
    p.add_argument("--owner-id", dest="owner_id", type=int)
    p.add_argument("--source-id", dest="source_id", type=int)
    p.add_argument("--value", type=float)
    p.add_argument("--currency")
    p.add_argument("--probability", type=int)
    p.add_argument("--expected-close-on", dest="expected_close_on")
    if not criar:
        p.add_argument("--lost-reason", dest="lost_reason")
        p.add_argument("--lost-notes", dest="lost_notes")
    p.add_argument("--json", help="Objeto JSON (mesclado com as flags)")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="CLI do CRM Vekta")
    sub = parser.add_subparsers(dest="recurso", required=True)

    # leads
    p_leads = sub.add_parser("leads", help="CRUD de leads")
    leads_sub = p_leads.add_subparsers(dest="acao", required=True)

    p = leads_sub.add_parser("listar")
    p.add_argument("--page", type=int)
    p.add_argument("--status", choices=["new", "contacted", "qualified", "unqualified", "converted"])
    p.add_argument("--search")
    p.set_defaults(func=cmd_leads_listar)

    p = leads_sub.add_parser("ver")
    p.add_argument("--id", type=int, required=True)
    p.set_defaults(func=cmd_leads_ver)

    p = leads_sub.add_parser("criar")
    add_lead_fields(p, criar=True)
    p.set_defaults(func=cmd_leads_criar)

    p = leads_sub.add_parser("atualizar")
    p.add_argument("--id", type=int, required=True)
    add_lead_fields(p, criar=False)
    p.set_defaults(func=cmd_leads_atualizar)

    p = leads_sub.add_parser("mover")
    p.add_argument("--id", type=int, required=True)
    p.add_argument("--stage-id", dest="stage_id", type=int, required=True)
    p.add_argument("--lost-reason", dest="lost_reason")
    p.set_defaults(func=cmd_leads_mover)

    p = leads_sub.add_parser("converter")
    p.add_argument("--id", type=int, required=True)
    p.add_argument("--titulo", dest="titulo")
    p.add_argument("--stage-id", dest="stage_id", type=int)
    p.add_argument("--value", type=float)
    p.add_argument("--owner-id", dest="owner_id", type=int)
    p.set_defaults(func=cmd_leads_converter)

    p = leads_sub.add_parser("excluir")
    p.add_argument("--id", type=int, required=True)
    p.set_defaults(func=cmd_leads_excluir)

    # deals
    p_deals = sub.add_parser("deals", help="CRUD de deals")
    deals_sub = p_deals.add_subparsers(dest="acao", required=True)

    p = deals_sub.add_parser("listar")
    p.add_argument("--page", type=int)
    p.add_argument("--search")
    p.set_defaults(func=cmd_deals_listar)

    p = deals_sub.add_parser("ver")
    p.add_argument("--id", type=int, required=True)
    p.set_defaults(func=cmd_deals_ver)

    p = deals_sub.add_parser("criar")
    add_deal_fields(p, criar=True)
    p.set_defaults(func=cmd_deals_criar)

    p = deals_sub.add_parser("atualizar")
    p.add_argument("--id", type=int, required=True)
    add_deal_fields(p, criar=False)
    p.set_defaults(func=cmd_deals_atualizar)

    p = deals_sub.add_parser("excluir")
    p.add_argument("--id", type=int, required=True)
    p.set_defaults(func=cmd_deals_excluir)

    # pipeline
    p_pipe = sub.add_parser("pipeline", help="Board kanban da dashboard")
    p_pipe.add_argument("--kind", choices=["lead", "deal"], required=True)
    p_pipe.add_argument("--search")
    p_pipe.set_defaults(func=cmd_pipeline)

    p_est = sub.add_parser("estagios", help="Listar estágios da pipeline")
    p_est.add_argument("--kind", choices=["lead", "deal"])
    p_est.set_defaults(func=cmd_estagios)

    # whatsapp
    p_wa = sub.add_parser("whatsapp", help="WhatsApp do CRM")
    wa_sub = p_wa.add_subparsers(dest="acao", required=True)

    p = wa_sub.add_parser("status")
    p.set_defaults(func=cmd_whatsapp_status)

    p = wa_sub.add_parser("enviar")
    p.add_argument("--lead-id", dest="lead_id", type=int, help="Resolve to via mobile/jid do lead")
    p.add_argument("--to", help="Telefone ou JID (opcional se --lead-id)")
    p.add_argument("--mensagem", required=True)
    p.add_argument("--contact-name", dest="contact_name")
    p.set_defaults(func=cmd_whatsapp_enviar)

    # campanhas
    p_camp = sub.add_parser("campanhas", help="Campanhas de disparo WhatsApp")
    camp_sub = p_camp.add_subparsers(dest="acao", required=True)

    p = camp_sub.add_parser("listar")
    p.add_argument("--status")
    p.add_argument("--per-page", dest="per_page", type=int)
    p.set_defaults(func=cmd_campanhas_listar)

    p = camp_sub.add_parser("ver")
    p.add_argument("--id", type=int, required=True)
    p.set_defaults(func=cmd_campanhas_ver)

    p = camp_sub.add_parser("criar")
    p.add_argument("--nome", dest="nome")
    p.add_argument("--mensagem", help="Mensagem única da sequência (ou use --json)")
    p.add_argument("--delay-msg", dest="delay_msg", type=int, help="delay_after_sec da mensagem")
    p.add_argument("--delay", type=int, help="delay_between_contacts_sec")
    p.add_argument("--jitter", type=int, help="delay_jitter_sec")
    p.add_argument("--json", help="Objeto JSON (name, messages, delays)")
    p.set_defaults(func=cmd_campanhas_criar)

    p = camp_sub.add_parser("importar")
    p.add_argument("--id", type=int, required=True)
    p.add_argument("--csv", required=True, help="Caminho do arquivo CSV")
    p.set_defaults(func=cmd_campanhas_importar)

    p = camp_sub.add_parser("iniciar")
    p.add_argument("--id", type=int, required=True)
    p.set_defaults(func=cmd_campanhas_iniciar)

    p = camp_sub.add_parser("pausar")
    p.add_argument("--id", type=int, required=True)
    p.set_defaults(func=cmd_campanhas_pausar)

    p = camp_sub.add_parser("cancelar")
    p.add_argument("--id", type=int, required=True)
    p.set_defaults(func=cmd_campanhas_cancelar)

    return parser


def main() -> None:
    _stdout_utf8()
    carregar_dotenv()
    parser = build_parser()
    args = parser.parse_args()
    c = cfg()
    args.func(args, c)


if __name__ == "__main__":
    main()
