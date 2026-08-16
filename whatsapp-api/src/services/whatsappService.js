const { Client, RemoteAuth, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const {
  extractPhoneFromJid,
  getJidServer,
  isPhoneJid,
  resolvePhoneFromContact,
  pickContactDisplayName,
  isGroupJid,
  isBroadcastJid,
} = require("../utils");
const { createStore, getSessionMetadataModel } = require("../config");
const path = require("path");
const webhookService = require("./webhookService");
const { WWEBJS_EVENTS } = webhookService;
class WhatsAppService {
  constructor() {
    this.clients = new Map();
    this.qrCodes = new Map();
    this.store = createStore();
    this.sendQueues = new Map();
    // Outbounds enviados via POST /send — não reenviar no webhook message_create
    // (evita duplicar no CRM e pausar o agent indevidamente).
    this.apiOutboundIds = new Map();
    this.apiOutboundPending = new Map();
  }

  apiOutboundPendingKey(sessionId, chatId, body) {
    return `${sessionId}|${String(chatId || "").trim()}|${String(body || "")}`;
  }

  rememberApiOutboundPending(sessionId, chatId, body) {
    const key = this.apiOutboundPendingKey(sessionId, chatId, body);
    this.apiOutboundPending.set(key, Date.now());
    // Também indexa pelo user do JID (c.us vs lid) de forma frouxa via body+session
    this.apiOutboundPending.set(
      `${sessionId}|*|${String(body || "")}`,
      Date.now(),
    );
    this.pruneApiOutboundMemory();
  }

  rememberApiOutboundId(messageId) {
    if (!messageId) return;
    this.apiOutboundIds.set(String(messageId), Date.now());
    this.pruneApiOutboundMemory();
  }

  pruneApiOutboundMemory(maxAgeMs = 120_000) {
    const agora = Date.now();
    for (const [key, ts] of this.apiOutboundIds) {
      if (agora - ts > maxAgeMs) this.apiOutboundIds.delete(key);
    }
    for (const [key, ts] of this.apiOutboundPending) {
      if (agora - ts > maxAgeMs) this.apiOutboundPending.delete(key);
    }
  }

  isApiOriginatedOutbound(sessionId, payload) {
    this.pruneApiOutboundMemory();
    const messageId = payload?.message_id ? String(payload.message_id) : "";
    if (messageId && this.apiOutboundIds.has(messageId)) {
      return true;
    }
    const body = String(payload?.body || "");
    const jid = String(payload?.jid || "");
    if (
      this.apiOutboundPending.has(this.apiOutboundPendingKey(sessionId, jid, body)) ||
      this.apiOutboundPending.has(`${sessionId}|*|${body}`)
    ) {
      if (messageId) {
        this.rememberApiOutboundId(messageId);
      }
      return true;
    }
    return false;
  }

  enqueueSend(sessionId, to, sendFn) {
    const key = `${sessionId}:${to}`;
    const previous = this.sendQueues.get(key) || Promise.resolve();

    const operation = previous
      .catch(() => {})
      .then(() => sendFn());

    this.sendQueues.set(key, operation);

    return operation;
  }

  truncatePayloadMessage(text, maxLength = 1000) {
    if (!text) return "";
    const str = String(text);
    return str.length > maxLength ? str.slice(0, maxLength) : str;
  }

  /******************************************/
  /********** HANDLERS DE EVENTOS ***********/
  /******************************************/

  // Handler para evento de QR Code
  async handleQREvent(qr, data, sessionId) {
    console.log(`📱 QR Code gerado para sessão: ${sessionId}`);

    try {
      const qrImage = await qrcode.toDataURL(qr);
      this.qrCodes.set(sessionId, {
        qr: qr,
        qrImage: qrImage,
        timestamp: new Date(),
      });

      await webhookService.sendWebhook(
        data.notifications_url,
        WWEBJS_EVENTS.QR_CODE,
        sessionId,
        { qr: qrImage },
      );

      console.log(`✅ QR Code salvo para sessão: ${sessionId}`);
    } catch (error) {
      console.error(`❌ Erro ao gerar QR Code: ${error.message}`);
    }
  }

  // Handler para evento de autenticação bem-sucedida
  async handleAuthenticatedEvent(sessionId, data) {
    console.log(`✅ Cliente autenticado: ${sessionId}`);
    this.qrCodes.delete(sessionId);

    await webhookService.sendWebhook(
      data.notifications_url,
      WWEBJS_EVENTS.AUTHENTICATED,
      sessionId,
    );
  }

  // Handler para evento de falha na autenticação
  async handleAuthFailureEvent(sessionId, data, msg) {
    console.error(`❌ Falha na autenticação para sessão ${sessionId}: ${msg}`);
    this.qrCodes.delete(sessionId);

    await webhookService.sendWebhook(
      data.notifications_url,
      WWEBJS_EVENTS.ERROR,
      sessionId,
      { message: this.truncatePayloadMessage(msg) },
    );
  }

  // Handler para evento de tela de carregamento
  async handleLoadingScreenEvent(sessionId, percent, message, data) {
    console.log(`📱 Carregando sessão ${sessionId}: ${percent}% - ${message}`);

    // await webhookService.sendWebhook(
    //   data.notifications_url,
    //   WWEBJS_EVENTS.LOADING_SCREEN,
    //   sessionId,
    //   { message: this.truncatePayloadMessage(`${percent}% - ${message}`) },
    // );
  }

  /**
   * Conta Business: Conn.platform em smba (Android) ou smbi (iOS).
   * @returns {Promise<boolean>}
   */
  async isBusinessAccount(client) {
    if (!client?.pupPage) return false;
    try {
      return await client.pupPage.evaluate(() => {
        try {
          const platform = window.require("WAWebConnModel").Conn.platform;
          return ["smba", "smbi"].indexOf(platform) !== -1;
        } catch (_) {
          return false;
        }
      });
    } catch (error) {
      console.warn(
        `⚠️ Não foi possível detectar conta Business: ${error.message}`,
      );
      return false;
    }
  }

  // Handler para evento de cliente pronto
  async handleReadyEvent(client, sessionId, data) {
    console.log(`🚀 Cliente WhatsApp pronto: ${sessionId}`);
    console.log(`📱 Informações do cliente:`, client.info);
    await this.updateSessionStatus(sessionId, "connected", client.info);

    const phoneNumber = client.info?.wid?.user
      ? extractPhoneFromJid(client.info.wid.user)
      : extractPhoneFromJid(client.info?.wid?._serialized);
    const isBusiness = await this.isBusinessAccount(client);

    const payload = { isBusiness };
    if (phoneNumber) payload.phone_number = phoneNumber;

    await webhookService.sendWebhook(
      data.notifications_url,
      WWEBJS_EVENTS.READY,
      sessionId,
      payload,
    );
  }

  async resolvePhoneFromLid(client, lidJid) {
    if (!client?.getContactLidAndPhone || !lidJid) return "";

    try {
      const results = await client.getContactLidAndPhone([lidJid]);
      const pnJid = results?.[0]?.pn;
      if (pnJid && isPhoneJid(pnJid)) {
        return extractPhoneFromJid(pnJid);
      }
    } catch (error) {
      console.warn(
        `⚠️ Não foi possível resolver telefone a partir do LID ${lidJid}: ${error.message}`,
      );
    }

    return "";
  }

  isNoLidError(error) {
    const msg = error?.message || String(error || "");
    return (
      /no lid for user/i.test(msg) ||
      /lid is missing/i.test(msg) ||
      /accountLid/i.test(msg) ||
      /without-account-lid/i.test(msg)
    );
  }

  /**
   * Resolve o chatId de envio.
   * WhatsApp migrou muitos usuários para @lid; enviar só com número@c.us
   * (contato não salvo / sem histórico) costuma falhar com "No LID for user".
   *
   * Importante: getContactLidAndPhone pode devolver só { pn } sem lid.
   * Nesse caso NÃO retornamos cedo — forçamos sync na store.
   */
  async resolveOutboundChatId(client, to, { forceSync = false } = {}) {
    const { formatPhoneNumber } = require("../utils");
    let chatId = formatPhoneNumber(String(to || "").trim());
    if (!chatId || chatId === "@c.us") return chatId;

    if (getJidServer(chatId) === "lid") {
      return chatId;
    }

    if (!isPhoneJid(chatId)) {
      return chatId;
    }

    let phoneJidFallback = chatId;

    // 1) Mapeamento LID oficial do wwebjs (só aceita se vier lid)
    if (client.getContactLidAndPhone && !forceSync) {
      try {
        const results = await client.getContactLidAndPhone([chatId]);
        console.log(
          `🔎 getContactLidAndPhone(${chatId}) → ${JSON.stringify(results)}`,
        );
        const mapping = results?.[0];
        if (mapping?.lid) {
          console.log(`🔀 Contato ${chatId} resolvido para LID ${mapping.lid}`);
          return mapping.lid;
        }
        if (mapping?.pn && isPhoneJid(mapping.pn)) {
          phoneJidFallback = mapping.pn;
          console.log(
            `⚠️ getContactLidAndPhone sem LID para ${chatId}; seguindo para sync…`,
          );
        }
      } catch (error) {
        console.warn(
          `⚠️ getContactLidAndPhone falhou para ${chatId}: ${error.message}`,
        );
      }
    }

    // 2) getNumberId (confirma existência) + re-tenta LID
    if (typeof client.getNumberId === "function") {
      try {
        const numberId = await client.getNumberId(extractPhoneFromJid(chatId));
        if (numberId?._serialized) {
          console.log(
            `🔀 Contato ${chatId} resolvido via getNumberId → ${numberId._serialized}`,
          );
          if (getJidServer(numberId._serialized) === "lid") {
            return numberId._serialized;
          }
          if (isPhoneJid(numberId._serialized)) {
            phoneJidFallback = numberId._serialized;
            if (client.getContactLidAndPhone) {
              try {
                const mapped = await client.getContactLidAndPhone([
                  numberId._serialized,
                ]);
                if (mapped?.[0]?.lid) {
                  console.log(
                    `🔀 getNumberId+LID ${numberId._serialized} → ${mapped[0].lid}`,
                  );
                  return mapped[0].lid;
                }
              } catch (_) {}
            }
          }
        } else {
          console.warn(`⚠️ getNumberId não encontrou ${chatId} no WhatsApp`);
        }
      } catch (error) {
        console.warn(`⚠️ getNumberId falhou para ${chatId}: ${error.message}`);
      }
    }

    // 3) Sync forçado na store (Usync / findOrCreate) — materializa LID
    const ensured = await this.ensureChatReady(client, phoneJidFallback);
    if (ensured) {
      return ensured;
    }

    // 4) Último recurso: pn/@c.us (pode falhar se a sessão exigir LID)
    return phoneJidFallback;
  }

  /**
   * Garante que o chat exista na store do WhatsApp Web e materializa o LID.
   * Fluxo: cache → findOrCreate → Usync (WAWebContactSyncUtils) → enforceLid.
   */
  async ensureChatReady(client, chatId) {
    if (!client?.pupPage || !chatId) return null;

    try {
      const resolved = await client.pupPage.evaluate(async (id) => {
        const serializeWid = (wid) =>
          wid?._serialized || wid?.toString?.() || null;

        try {
          const createWid =
            window.Store?.WidFactory?.createWid ||
            window.require?.("WAWebWidFactory")?.createWid;
          const findOrCreate =
            window.Store?.FindOrCreateChat?.findOrCreateLatestChat ||
            window.require?.("WAWebFindChatAction")?.findOrCreateLatestChat;

          if (!createWid) {
            return { error: "WidFactory indisponível" };
          }

          const wid = createWid(id);
          let chat = window.Store?.Chat?.get?.(wid) || null;
          let lid = null;
          let source = null;

          const tryExtractLid = (fromWid) => {
            try {
              const lidUtils = window.Store?.LidUtils;
              if (lidUtils?.getCurrentLid) {
                const current = lidUtils.getCurrentLid(fromWid);
                const s = serializeWid(current);
                if (s && String(s).includes("@lid")) return s;
              }
            } catch (_) {}
            try {
              const lidUtil = window.require?.("WAWebLidMigrationUtils");
              if (lidUtil?.toUserLid) {
                const asLid = lidUtil.toUserLid(fromWid);
                const s = serializeWid(asLid);
                if (s && String(s).includes("@lid")) return s;
              }
            } catch (_) {}
            return null;
          };

          const tryFindOrCreate = async (targetWid) => {
            if (!findOrCreate) return null;
            try {
              const found = await findOrCreate(targetWid);
              return found?.chat || found || null;
            } catch (_) {
              return null;
            }
          };

          if (!chat) {
            chat = await tryFindOrCreate(wid);
            if (chat) source = "findOrCreate";
          } else {
            source = "cache";
          }

          lid = tryExtractLid(wid);
          if (!lid && chat?.id) {
            const chatIdSer = serializeWid(chat.id);
            if (chatIdSer && String(chatIdSer).includes("@lid")) {
              lid = chatIdSer;
            }
          }

          // Contato sem LID na store: sync via WhatsApp servers (Usync)
          if (!lid) {
            try {
              const syncUtils =
                window.require?.("WAWebContactSyncUtils") ||
                window.Store?.ContactSyncUtils;
              if (syncUtils?.constructUsyncDeltaQuery) {
                const query = syncUtils.constructUsyncDeltaQuery([
                  { type: "add", phoneNumber: wid.user },
                ]);
                const result = await query.execute();
                const syncedLid = result?.list?.[0]?.lid;
                if (syncedLid) {
                  const chatLid = createWid(syncedLid);
                  lid = serializeWid(chatLid) || String(syncedLid);
                  const syncedChat = await tryFindOrCreate(chatLid);
                  if (syncedChat) {
                    chat = syncedChat;
                    source = "usync";
                  } else {
                    source = "usync-lid-only";
                  }
                }
              }
            } catch (syncErr) {
              // segue para enforceLid
            }
          }

          // Fallback wwebjs: QueryExist + LidUtils
          if (!lid && window.WWebJS?.enforceLidAndPnRetrieval) {
            try {
              const enforced = await window.WWebJS.enforceLidAndPnRetrieval(id);
              const enforcedLid = serializeWid(enforced?.lid);
              if (enforcedLid && String(enforcedLid).includes("@lid")) {
                lid = enforcedLid;
                source = source || "enforceLid";
                const chatLid = createWid(enforcedLid);
                const enforcedChat = await tryFindOrCreate(chatLid);
                if (enforcedChat) chat = enforcedChat;
              }
            } catch (_) {}
          }

          const serialized =
            serializeWid(chat?.id) ||
            lid ||
            null;

          return {
            chatId: serialized,
            lid,
            source,
            error: null,
          };
        } catch (e) {
          return { error: e?.message || String(e) };
        }
      }, chatId);

      if (resolved?.error) {
        console.warn(
          `⚠️ ensureChatReady(${chatId}) falhou: ${resolved.error}`,
        );
        return null;
      }

      if (resolved?.lid) {
        console.log(
          `🔀 ensureChatReady ${chatId} → LID ${resolved.lid} (${resolved.source || "?"})`,
        );
        return resolved.lid;
      }
      if (resolved?.chatId) {
        console.log(
          `🔀 ensureChatReady ${chatId} → chat ${resolved.chatId} (${resolved.source || "?"})`,
        );
        return resolved.chatId;
      }
    } catch (error) {
      console.warn(`⚠️ ensureChatReady evaluate falhou: ${error.message}`);
    }

    return null;
  }

  async resolveMessageContact(message) {
    // Outbound (fromMe): o remoto é to / id.remote — from é a própria sessão.
    const remoteJid =
      message.fromMe === true
        ? message.to || message.id?.remote || message._data?.to || null
        : null;
    const fallbackJid =
      remoteJid || message.author || message.from || null;
    const notifyName = message._data?.notifyName || message.notifyName || null;
    const fallback = {
      jid: fallbackJid,
      lid: getJidServer(fallbackJid) === "lid" ? fallbackJid : null,
      phone_number: isPhoneJid(fallbackJid)
        ? extractPhoneFromJid(fallbackJid)
        : "",
      contact_name: pickContactDisplayName(null, null, notifyName),
    };

    try {
      let contact = null;
      if (message.fromMe === true && remoteJid && message.client?.getContactById) {
        try {
          contact = await message.client.getContactById(remoteJid);
        } catch (error) {
          console.warn(
            `⚠️ getContactById no outbound falhou: ${error.message}`,
          );
        }
      }
      if (!contact) {
        contact = await message.getContact();
      }
      if (!contact) {
        fallback.contact_name = pickContactDisplayName(
          null,
          fallback.phone_number,
          notifyName,
        );
        return fallback;
      }

      const jid =
        (message.fromMe === true && remoteJid
          ? remoteJid
          : contact.id?._serialized) || fallbackJid;

      // Preferir id.user quando o JID é @c.us — contact.number pode ser LID (userid)
      let phone_number = resolvePhoneFromContact(contact, fallbackJid);
      let lid = getJidServer(jid) === "lid" ? jid : null;

      const lidCandidate =
        getJidServer(jid) === "lid"
          ? jid
          : getJidServer(fallbackJid) === "lid"
            ? fallbackJid
            : jid;

      try {
        if (message.client?.getContactLidAndPhone && lidCandidate) {
          const mapping = await message.client.getContactLidAndPhone([
            lidCandidate,
          ]);
          if (mapping?.[0]?.lid) {
            lid = mapping[0].lid;
          }
          if (!phone_number && mapping?.[0]?.pn && isPhoneJid(mapping[0].pn)) {
            phone_number = extractPhoneFromJid(mapping[0].pn);
          }
        }
      } catch (error) {
        console.warn(
          `⚠️ getContactLidAndPhone no recebimento falhou: ${error.message}`,
        );
      }

      if (!phone_number && lid) {
        const resolvedFromLid = await this.resolvePhoneFromLid(
          message.client,
          lid,
        );
        if (resolvedFromLid) {
          phone_number = resolvedFromLid;
        }
      }

      if (!phone_number) {
        phone_number = fallback.phone_number;
      }

      // 1) nome salvo → 2) nome padrão WhatsApp (pushname/notifyName) → 3) null
      const contact_name = pickContactDisplayName(
        contact,
        phone_number,
        notifyName,
      );

      return { jid, lid, phone_number, contact_name };
    } catch (error) {
      console.warn(
        `⚠️ Não foi possível obter contato via getContact(): ${error.message}`,
      );
      fallback.contact_name = pickContactDisplayName(
        null,
        fallback.phone_number,
        notifyName,
      );
      return fallback;
    }
  }

  serializeLabel(label) {
    if (!label) return null;
    return {
      id: label.id,
      name: label.name,
      hexColor: label.hexColor,
    };
  }

  formatLabelError(err) {
    return err?.message || String(err);
  }

  /**
   * Operações de Label no contexto do browser.
   * create não existe na API pública do wwebjs — usamos Store interno.
   * getChatLabels nativo falha em alguns chats @lid; lemos o chat raw.
   */
  async runLabelBrowserOp(client, op, payload = {}) {
    return client.pupPage.evaluate(
      async (operation, data) => {
        const assertBusiness = () => {
          const platform = window.require("WAWebConnModel").Conn.platform;
          if (["smba", "smbi"].indexOf(platform) === -1) {
            throw new Error("[LT01] Only Whatsapp business");
          }
        };

        const collectFns = (obj) => {
          const names = new Set();
          let cur = obj;
          let depth = 0;
          while (cur && depth < 6) {
            Object.getOwnPropertyNames(cur).forEach((k) => {
              try {
                if (typeof obj[k] === "function") names.add(k);
              } catch (_) {}
            });
            cur = Object.getPrototypeOf(cur);
            depth += 1;
          }
          return [...names].sort();
        };

        const findLabelActions = () => {
          const named = [
            "WAWebBizLabelEditingAction",
            "WAWebLabelEditingAction",
            "WAWebLabelAction",
            "WAWebLabelActions",
            "WAWebBizLabelAction",
            "WAWebLabelAddAction",
            "WAWebUpdateLabelAction",
            "WAWebLabelEditAction",
          ];
          for (const name of named) {
            try {
              const mod = window.require(name);
              if (mod && (mod.labelAddAction || mod.addNewLabel || mod.default)) {
                return {
                  source: name,
                  add:
                    mod.labelAddAction ||
                    mod.addNewLabel ||
                    mod.default?.labelAddAction,
                };
              }
            } catch (_) {}
          }

          const map = window.require("__debug")?.modulesMap;
          if (map) {
            for (const moduleId of Object.keys(map)) {
              try {
                const mod = window.require(moduleId);
                if (!mod || typeof mod !== "object") continue;
                const add = mod.labelAddAction || mod.addNewLabel;
                if (typeof add === "function") {
                  return { source: moduleId, add };
                }
              } catch (_) {}
            }
          }

          return null;
        };

        const getRawChat = async (chatId) => {
          const chatWid = window.require("WAWebWidFactory").createWid(chatId);
          let chat = window.require("WAWebCollections").Chat.get(chatWid);
          if (!chat) {
            const found = await window
              .require("WAWebFindChatAction")
              .findOrCreateLatestChat(chatWid);
            chat = found?.chat || null;
          }
          return chat;
        };

        const serializeLabelSafe = (label) => {
          if (!label) return null;
          try {
            if (window.WWebJS?.getLabelModel) {
              return window.WWebJS.getLabelModel(label);
            }
          } catch (_) {}
          return {
            id: String(label.id),
            name: label.name || null,
            hexColor: label.hexColor || null,
          };
        };

        const getChatLabelsSafe = async (chatId) => {
          const chat = await getRawChat(chatId);
          if (!chat) return [];
          const Label = window.require("WAWebCollections").Label;
          return (chat.labels || [])
            .map((id) => serializeLabelSafe(Label.get(String(id))))
            .filter(Boolean);
        };

        const resolveChatId = async (chatId) => {
          const chat = await getRawChat(chatId);
          if (!chat?.id?._serialized) {
            throw new Error("Chat não encontrado: " + chatId);
          }
          return chat.id._serialized;
        };

        const applyLabelSet = async (chat, labelIds) => {
          const Label = window.require("WAWebCollections").Label;
          if (typeof Label.addOrRemoveLabels !== "function") {
            throw new Error("Label.addOrRemoveLabels não disponível");
          }

          const labels = window.WWebJS.getLabels().filter(
            (e) => labelIds.find((l) => l == e.id) !== undefined,
          );

          const actions = labels.map((label) => ({
            id: label.id,
            type: "add",
          }));

          (chat.labels || []).forEach((n) => {
            if (!actions.find((e) => e.id == n)) {
              actions.push({ id: n, type: "remove" });
            }
          });

          await Label.addOrRemoveLabels(actions, [chat]);
        };

        if (operation === "getChatLabels") {
          return getChatLabelsSafe(data.chatId);
        }

        if (operation === "create") {
          assertBusiness();
          const Label = window.require("WAWebCollections").Label;
          const normalizeName = (value) =>
            String(value || "")
              .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
              .trim();
          const expectedName = normalizeName(data.name);

          const findByName = () => {
            const labels = window.WWebJS.getLabels() || [];
            return (
              labels.find(
                (label) => normalizeName(label.name) === expectedName,
              ) || null
            );
          };

          let colorValue = data.color;
          if (
            colorValue === null ||
            colorValue === undefined ||
            colorValue === ""
          ) {
            if (typeof Label.getNextAvailableColor === "function") {
              colorValue = Label.getNextAvailableColor();
            } else if (typeof Label.getNewLabelColor === "function") {
              colorValue = Label.getNewLabelColor();
            } else {
              colorValue = 0;
            }
          }
          colorValue = parseInt(colorValue, 10);
          if (Number.isNaN(colorValue)) colorValue = 0;

          // Prefer Store action (WPPConnect-style). Label.addNewLabel often exists
          // but is a no-op / wrong signature on current WA Web.
          const actions = findLabelActions();
          const attempts = [];
          let createdOk = false;
          let lastError = null;

          if (actions?.add) {
            try {
              await actions.add(data.name, colorValue);
              attempts.push(`ok:${actions.source}`);
              createdOk = true;
            } catch (err) {
              lastError = err;
              attempts.push(
                `fail:${actions.source}:${err?.message || String(err)}`,
              );
            }
          }

          if (!createdOk && typeof Label.addNewLabel === "function") {
            const signatures = [
              () => Label.addNewLabel(data.name, colorValue),
              () =>
                Label.addNewLabel(data.name, { labelColor: colorValue }),
              () => Label.addNewLabel({ name: data.name, color: colorValue }),
            ];
            for (let i = 0; i < signatures.length; i += 1) {
              try {
                await signatures[i]();
                attempts.push(`ok:Label.addNewLabel#${i}`);
                createdOk = true;
                break;
              } catch (err) {
                lastError = err;
                attempts.push(
                  `fail:Label.addNewLabel#${i}:${err?.message || String(err)}`,
                );
              }
            }
          }

          if (!createdOk) {
            throw new Error(
              "Criar label não disponível neste WhatsApp Web. Tentativas: " +
                attempts.join(" | ") +
                ". Métodos Label: " +
                collectFns(Label).join(", ") +
                (lastError
                  ? `. Último erro: ${lastError.message || lastError}`
                  : ""),
            );
          }

          // Wait for the collection to reflect the new label (no last-label fallback).
          let found = findByName();
          for (let i = 0; !found && i < 8; i += 1) {
            await new Promise((r) => setTimeout(r, 250));
            found = findByName();
          }

          if (!found) {
            throw new Error(
              `Label '${data.name}' não apareceu após create. Tentativas: ${attempts.join(" | ")}`,
            );
          }

          return found;
        }

        if (operation === "link" || operation === "unlink") {
          assertBusiness();
          const chatId = await resolveChatId(data.to);
          const chat = await getRawChat(chatId);
          if (!chat) {
            throw new Error("Chat não encontrado: " + data.to);
          }

          const existing = await getChatLabelsSafe(chatId);
          const targetId = String(data.labelId);
          let labelIds = existing.map((l) => String(l.id));

          if (operation === "link") {
            if (!labelIds.includes(targetId)) labelIds.push(targetId);
          } else {
            labelIds = labelIds.filter((id) => id !== targetId);
          }

          await applyLabelSet(chat, labelIds);
          return {
            chatId,
            labels: await getChatLabelsSafe(chatId),
          };
        }

        throw new Error("Operação de label desconhecida: " + operation);
      },
      op,
      payload,
    );
  }

  async resolveChatLabels(message) {
    const chatId = message.from || null;
    if (!chatId || !message.client?.pupPage) {
      return [];
    }

    try {
      const chatLabels = await this.runLabelBrowserOp(message.client, "getChatLabels", {
        chatId,
      });
      return (chatLabels || [])
        .map((label) => this.serializeLabel(label))
        .filter(Boolean);
    } catch (error) {
      console.warn(
        `⚠️ Não foi possível obter labels do chat ${chatId}: ${this.formatLabelError(error)}`,
      );
      return [];
    }
  }

  extractMessageId(message) {
    if (!message) return null;
    const id = message.id;
    if (!id) return null;
    if (typeof id === "string" && id.trim()) return id.trim();
    if (typeof id._serialized === "string" && id._serialized.trim()) {
      return id._serialized.trim();
    }
    if (id.id != null && id.remote) {
      return `${id.fromMe ? "true" : "false"}_${id.remote}_${id.id}`;
    }
    return null;
  }

  async buildMessageWebhookPayload(message) {
    const { jid, lid, phone_number, contact_name } =
      await this.resolveMessageContact(message);
    const labels = await this.resolveChatLabels(message);

    const payload = {
      jid,
      lid: lid || null,
      phone_number,
      contact_name,
      body: message.body,
      has_media: message.hasMedia,
      is_view_once: !!message.isViewOnce,
      from_me: !!message.fromMe,
      is_group:
        isGroupJid(message.from) ||
        isGroupJid(message.to) ||
        isGroupJid(jid),
      is_broadcast:
        isBroadcastJid(message.from) ||
        isBroadcastJid(message.to) ||
        isBroadcastJid(jid),
      message_id: this.extractMessageId(message),
      type: message.type,
      timestamp: message.timestamp,
      labels,
    };

    if (message.hasMedia) {
      const { media, error } = await this.downloadMessageMedia(message);

      if (media) {
        payload.media = {
          mimetype: media.mimetype,
          data: media.data,
          filename: media.filename,
          filesize: media.filesize,
        };
        console.log(
          `📎 Mídia baixada: ${media.mimetype} (${media.filesize ?? "tamanho desconhecido"} bytes)`,
        );
      } else {
        payload.media = null;
        payload.media_error = this.truncatePayloadMessage(
          error || "download_failed",
        );
        console.warn(
          `⚠️ Falha ao baixar mídia da mensagem ${payload.message_id}: ${payload.media_error}`,
        );
      }
    }

    return payload;
  }

  /**
   * O WhatsApp Web às vezes ainda está resolvendo a mídia quando o evento chega,
   * então tentamos algumas vezes antes de desistir.
   */
  async downloadMessageMedia(message, attempts = 3, delayMs = 1500) {
    let lastError = "download_failed";

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const media = await message.downloadMedia();
        if (media?.data) {
          return { media, error: null };
        }
        lastError = "download_failed";
      } catch (error) {
        lastError = error?.message || "download_failed";
      }

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }

    return { media: null, error: lastError };
  }

  // Handler para evento de mensagem (inbound via "message"; outbound fromMe via "message_create")
  async handleMessageEvent(sessionId, data, message) {
    const payload = await this.buildMessageWebhookPayload(message);

    // Envios feitos pela API/CRM já são persistidos no backend — não ecoar.
    if (payload.from_me && this.isApiOriginatedOutbound(sessionId, payload)) {
      console.log(
        `🔇 Outbound da API ignorado no webhook: ${payload.message_id || payload.jid}`,
      );
      return;
    }

    const dedupeKey =
      payload.message_id ||
      `${payload.from_me ? "out" : "in"}|${payload.jid}|${payload.timestamp || ""}|${payload.body || ""}|${payload.type || ""}`;
    if (!this.recentWebhookKeys) this.recentWebhookKeys = new Map();
    const agora = Date.now();
    const visto = this.recentWebhookKeys.get(dedupeKey);
    if (visto && agora - visto < 10_000) {
      console.log(`🔁 Webhook de mensagem ignorado (duplicata): ${dedupeKey}`);
      return;
    }
    this.recentWebhookKeys.set(dedupeKey, agora);
    for (const [key, ts] of this.recentWebhookKeys) {
      if (agora - ts > 30_000) this.recentWebhookKeys.delete(key);
    }

    const direção = payload.from_me ? "enviada" : "recebida";
    console.log(
      `📨 Mensagem ${direção} ${payload.from_me ? "para" : "de"} ${payload.contact_name || "sem nome"} (${payload.phone_number}) [${payload.jid}]: ${message.body}`,
    );

    await webhookService.sendWebhook(
      data.messages_url,
      WWEBJS_EVENTS.MESSAGE,
      sessionId,
      payload,
    );
  }

  // Handler para evento de desconexão
  async handleDisconnectedEvent(sessionId, data, reason) {
    console.log(`❌ Cliente desconectado: ${sessionId} - Motivo: ${reason}`);

    await webhookService.sendWebhook(
      data.notifications_url,
      WWEBJS_EVENTS.DISCONNECTED,
      sessionId,
      { message: this.truncatePayloadMessage(reason) },
    );

    const client = this.clients.get(sessionId);

    this.clients.delete(sessionId);
    this.qrCodes.delete(sessionId);

    if (client) {
      client.removeAllListeners();
      await client.destroy();
    }

    this.deleteSession(sessionId);
    await this.updateSessionStatus(sessionId, "disconnected");
  }

  // Handler para evento de erro
  async handleErrorEvent(sessionId, data, error) {
    console.error(`❌ Erro no cliente WhatsApp ${sessionId}:`, error);

    await webhookService.sendWebhook(
      data.notifications_url,
      WWEBJS_EVENTS.ERROR,
      sessionId,
      { message: this.truncatePayloadMessage(error?.message || String(error)) },
    );
  }

  // Configurar todos os event handlers do cliente
  setupClientEventHandlers(client, sessionId, data) {
    client.on("qr", async (qr) => {
      await this.handleQREvent(qr, data, sessionId);
    });

    client.on("authenticated", async () => {
      await this.handleAuthenticatedEvent(sessionId, data);
    });

    client.on("auth_failure", async (msg) => {
      await this.handleAuthFailureEvent(sessionId, data, msg);
    });

    client.on("loading_screen", async (percent, message) => {
      await this.handleLoadingScreenEvent(sessionId, percent, message, data);
    });

    client.once("ready", async () => {
      await this.handleReadyEvent(client, sessionId, data);
    });

    client.on("message", async (message) => {
      // Evento "message" não inclui fromMe — só inbound.
      await this.handleMessageEvent(sessionId, data, message);
    });

    client.on("message_create", async (message) => {
      // Captura outbound do celular/API (fromMe). Inbound já veio em "message".
      if (!message?.fromMe) {
        return;
      }
      await this.handleMessageEvent(sessionId, data, message);
    });

    client.on("disconnected", async (reason) => {
      await this.handleDisconnectedEvent(sessionId, data, reason);
    });

    client.on("error", async (error) => {
      await this.handleErrorEvent(sessionId, data, error);
    });
  }

  // Criar nova conexão WhatsApp
  async createConnection(sessionId, data = {}) {
    try {
      console.log(`🔗 Criando conexão WhatsApp para sessão: ${sessionId}`);

      // Verificar se a sessão já existe usando MongoStore
      const sessionExists = await this.checkSessionExists(sessionId);

      console.log(`📋 Sessão ${sessionId} existe: ${sessionExists.exists}`);

      const client = new Client({
        authStrategy: new RemoteAuth({
          clientId: sessionId,
          store: this.store,
          dataPath: path.join(process.cwd(), "sessions"),
          backupSyncIntervalMs: 300000,
        }),
        puppeteer: {
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
            "--disable-web-security",
            "--disable-features=VizDisplayCompositor",
            "--disable-extensions",
            "--disable-plugins",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-field-trial-config",
            "--disable-ipc-flooding-protection",
          ],
          timeout: 120000, // Aumentado para 2 minutos
          protocolTimeout: 120000, // Aumentado para 2 minutos
        },
        // Configurações adicionais para estabilidade
        takeoverOnConflict: true,
        takeoverTimeoutMs: 15000, // Aumentado para 15 segundos
        qrMaxRetries: 5, // Reduzido para evitar loops infinitos
        authTimeoutMs: 90000, // Aumentado para 1.5 minutos
        restartOnAuthFail: false, // Desabilitado para evitar loops
      });

      // Configurar todos os event handlers
      this.setupClientEventHandlers(client, sessionId, data);

      // Adicionar timeout mais longo para inicialização
      const initPromise = client.initialize();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Timeout na inicialização do cliente")),
          180000, // 3 minutos
        );
      });

      await Promise.race([initPromise, timeoutPromise]);

      // Salvar cliente na lista
      this.clients.set(sessionId, client);

      // Salvar sessão no MongoDB usando MongoStore
      if (!sessionExists.exists) {
        await this.saveSessionToDB(sessionId, "connecting", data);
      }

      return {
        success: true,
        sessionId: sessionId,
        message: "Conexão WhatsApp criada com sucesso",
      };
    } catch (error) {
      console.error(`❌ Erro ao criar conexão WhatsApp: ${error.message}`);

      // Verificar se é um erro específico do Puppeteer
      if (
        error.message.includes("Execution context was destroyed") ||
        error.message.includes("Navigation timeout") ||
        error.message.includes("Target closed") ||
        error.message.includes("Protocol error")
      ) {
        console.log(`⚠️ Erro do Puppeteer detectado para sessão ${sessionId}`);
      }

      console.error(`❌ Stack trace:`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Obter QR Code de uma sessão
  getQRCode(sessionId) {
    const qrData = this.qrCodes.get(sessionId);

    if (!qrData) {
      return {
        success: false,
        error: "QR Code não encontrado ou já expirado",
      };
    }

    return {
      success: true,
      sessionId: sessionId,
      qr: qrData.qr,
      qrImage: qrData.qrImage,
      timestamp: qrData.timestamp,
    };
  }

  // Verificar status da conexão
  async getConnectionStatus(sessionId) {
    const client = this.clients.get(sessionId);

    if (!client) {
      return {
        success: false,
        status: "disconnected",
        error: "Cliente não encontrado",
      };
    }

    const connected = Boolean(client.info);
    return {
      success: true,
      sessionId: sessionId,
      status: connected ? "connected" : "connecting",
      info: client.info || null,
      isBusiness: connected ? await this.isBusinessAccount(client) : false,
    };
  }

  /**
   * URL temporária da foto de perfil (ou null se oculta/indisponível).
   * Tenta @c.us e, se informado, @lid; com fallback via ProfilePicThumb.
   */
  async getProfilePicUrl(sessionId, jid, lid = null) {
    const client = this.clients.get(sessionId);

    if (!client) {
      return {
        success: false,
        error: "Cliente não encontrado",
      };
    }

    if (!client.info) {
      return {
        success: false,
        error: "Cliente não está conectado",
      };
    }

    const primary = String(jid || "").trim();
    const altLid = String(lid || "").trim();
    if (!primary && !altLid) {
      return {
        success: false,
        error: "jid é obrigatório",
      };
    }

    const candidates = [];
    if (primary) candidates.push(primary);
    if (altLid && altLid !== primary) candidates.push(altLid);

    let lastError = null;
    for (const chatId of candidates) {
      try {
        let url = await client.getProfilePicUrl(chatId);
        if (typeof url === "string" && url.trim()) {
          return {
            success: true,
            sessionId,
            jid: chatId,
            url: url.trim(),
          };
        }

        url = await this._profilePicFromThumb(client, chatId);
        if (typeof url === "string" && url.trim()) {
          return {
            success: true,
            sessionId,
            jid: chatId,
            url: url.trim(),
          };
        }
      } catch (error) {
        lastError = error;
        const detail = error?.message || error?.name || String(error);
        console.warn(`⚠️ getProfilePicUrl falhou para ${chatId}: ${detail}`);
      }
    }

    // Sem URL: privacidade/indisponível (não é falha de sessão).
    return {
      success: true,
      sessionId,
      jid: primary || altLid,
      url: null,
      error: lastError ? String(lastError.message || lastError) : undefined,
    };
  }

  /**
   * Fallback: ProfilePicThumb + chat interno (sem WWebJS.getChat).
   */
  async _profilePicFromThumb(client, chatId) {
    if (!client?.pupPage) return null;

    return client.pupPage.evaluate(async (contactId) => {
      try {
        const wid = window.require("WAWebWidFactory").createWid(contactId);
        const pictures = window.require("WAWebCollections").ProfilePicThumb;
        let thumb = pictures.get(wid) || null;
        if (!thumb) {
          try {
            thumb = await pictures.find(wid);
          } catch (_) {
            thumb = null;
          }
        }
        const cached = thumb?.eurl || thumb?.imgFull || thumb?.img || null;
        if (cached) return cached;

        const found = await window
          .require("WAWebFindChatAction")
          .findOrCreateLatestChat(wid);
        const chat = found?.chat || found;
        if (!chat) return null;

        const fresh = await window
          .require("WAWebContactProfilePicThumbBridge")
          .requestProfilePicFromServer(chat);
        return fresh?.eurl || fresh?.imgFull || fresh?.img || null;
      } catch (_) {
        return null;
      }
    }, chatId);
  }

  // Enviar mensagem (texto e/ou mídia: imagem, áudio ou documento)
  sendMessage(sessionId, to, message, media = null) {
    return this.enqueueSend(sessionId, to, () =>
      this._sendMessageWithTyping(sessionId, to, message, media),
    );
  }

  buildOutboundContent(message, media) {
    const caption = message == null ? "" : String(message);
    if (!media || typeof media !== "object") {
      return {
        content: caption,
        options: { waitUntilMsgSent: true },
        pendingBody: caption,
        hasMedia: false,
        mediaMeta: null,
      };
    }

    const mimetype = String(media.mimetype || "").trim().toLowerCase();
    const data = String(media.data || "").replace(/^data:[^;]+;base64,/, "");
    const isAudio = mimetype.startsWith("audio/");
    const isImage = mimetype.startsWith("image/");
    const isDocument = !isImage && !isAudio;
    const fallbackName = isAudio ? "audio.ogg" : isImage ? "image.jpg" : "arquivo.pdf";
    const filename = String(media.filename || fallbackName).trim() || fallbackName;

    if (!isImage && !isAudio && !this.isDocumentMime(mimetype)) {
      throw new Error(
        "Apenas imagens, áudios e documentos são suportados no envio de mídia.",
      );
    }
    if (!data) {
      throw new Error("media.data (base64) é obrigatório.");
    }

    const mediaObj = new MessageMedia(mimetype, data, filename);
    const options = { waitUntilMsgSent: true };
    // Áudio como mensagem de voz não aceita legenda no WhatsApp.
    const asVoice = isAudio && media.voice !== false;
    if (asVoice) {
      options.sendAudioAsVoice = true;
    } else if (isDocument) {
      options.sendMediaAsDocument = true;
    }
    if (!asVoice && caption) {
      options.caption = caption;
    }

    const kind = isAudio ? "audio" : isImage ? "image" : "document";
    return {
      content: mediaObj,
      options,
      pendingBody: caption || `[${kind}:${filename}]`,
      hasMedia: true,
      mediaMeta: { mimetype, filename, voice: asVoice, document: isDocument },
    };
  }

  isDocumentMime(mimetype) {
    const mime = String(mimetype || "")
      .toLowerCase()
      .split(";")[0]
      .trim();
    return [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.spreadsheet",
      "application/rtf",
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
      "text/plain",
      "text/csv",
    ].includes(mime);
  }

  async _sendMessageWithTyping(sessionId, to, message, media = null) {
    try {
      const client = this.clients.get(sessionId);

      if (!client) {
        return {
          success: false,
          error: "Cliente não encontrado",
        };
      }

      if (!client.info) {
        return {
          success: false,
          error: "Cliente não está conectado",
        };
      }

      let outbound;
      try {
        outbound = this.buildOutboundContent(message, media);
      } catch (buildError) {
        return {
          success: false,
          error: buildError?.message || String(buildError),
        };
      }

      const originalTo = String(to || "").trim();
      let chatId = await this.resolveOutboundChatId(client, originalTo);

      console.log(
        `📤 Enviando ${outbound.hasMedia ? "mídia" : "mensagem"} para ${originalTo} (chatId=${chatId}): ${outbound.pendingBody}`,
      );

      // Marca antes do sendMessage para cobrir o message_create (race com o CRM).
      this.rememberApiOutboundPending(sessionId, chatId, outbound.pendingBody);
      this.rememberApiOutboundPending(sessionId, originalTo, outbound.pendingBody);

      const typingDelayMs = Math.floor((1 + Math.random() * 4) * 1000);
      await new Promise((resolve) => setTimeout(resolve, typingDelayMs));

      let result;
      try {
        result = await client.sendMessage(
          chatId,
          outbound.content,
          outbound.options,
        );
      } catch (sendError) {
        // Contato migrado / cache stale: força sync LID e tenta de novo
        if (!this.isNoLidError(sendError)) {
          throw sendError;
        }

        console.warn(
          `⚠️ No LID ao enviar para ${chatId}. Forçando sync e re-resolvendo…`,
        );

        const { formatPhoneNumber } = require("../utils");
        const phoneJid = formatPhoneNumber(originalTo);
        const syncedId = await this.ensureChatReady(client, phoneJid);
        const freshId = await this.resolveOutboundChatId(client, originalTo, {
          forceSync: true,
        });
        const fallbackCandidates = [syncedId, freshId, phoneJid];
        const uniqueFallbacks = [
          ...new Set(fallbackCandidates.filter((id) => id && id !== chatId)),
        ];

        const tried = new Set([chatId]);
        let lastError = sendError;
        let sent = false;
        for (const candidate of uniqueFallbacks) {
          if (tried.has(candidate)) continue;
          tried.add(candidate);
          try {
            console.log(`🔁 Retry envio com ${candidate}`);
            this.rememberApiOutboundPending(
              sessionId,
              candidate,
              outbound.pendingBody,
            );
            result = await client.sendMessage(
              candidate,
              outbound.content,
              outbound.options,
            );
            chatId = candidate;
            sent = true;
            break;
          } catch (retryError) {
            lastError = retryError;
            if (!this.isNoLidError(retryError)) {
              throw retryError;
            }
          }
        }
        if (!sent) {
          throw lastError;
        }
      }

      const messageId = result?.id?._serialized || null;

      if (messageId) {
        this.rememberApiOutboundId(messageId);
        console.log(`✅ Mensagem enviada com sucesso: ${messageId}`);
      }

      return {
        success: true,
        messageId,
        to: chatId,
        message: message == null ? "" : String(message),
        hasMedia: outbound.hasMedia,
        media: outbound.mediaMeta,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error?.message || String(error);
      console.error(`❌ Erro ao enviar mensagem: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  resolveSessionData(session) {
    const sessionData = session.data;

    if (
      sessionData &&
      typeof sessionData === "object" &&
      !(sessionData instanceof Date) &&
      (sessionData.notifications_url || sessionData.messages_url)
    ) {
      return sessionData;
    }

    return {
      notifications_url: session.urlWebhook || null,
      messages_url: null,
    };
  }

  // Desconectar cliente
  async disconnectClient(sessionId) {
    try {
      const client = this.clients.get(sessionId);

      if (client) {
        await client.destroy();
        this.clients.delete(sessionId);
        this.qrCodes.delete(sessionId);

        return {
          success: true,
          message: "Cliente desconectado com sucesso",
        };
      }

      return {
        success: false,
        error: "Cliente não encontrado",
      };
    } catch (error) {
      console.error(`❌ Erro ao desconectar cliente: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Listar todas as conexões
  listConnections() {
    const connections = [];

    for (const [sessionId, client] of this.clients) {
      connections.push({
        sessionId: sessionId,
        status: client.info ? "connected" : "connecting",
        info: client.info || null,
      });
    }

    return connections;
  }

  /******************************************/
  /********** Labels (listas/etiquetas) *****/
  /******************************************/

  getConnectedClient(sessionId) {
    const client = this.clients.get(sessionId);

    if (!client) {
      return {
        success: false,
        error: "Cliente não encontrado",
        client: null,
      };
    }

    if (!client.info) {
      return {
        success: false,
        error: "Cliente não está conectado",
        client: null,
      };
    }

    return { success: true, client };
  }

  async listLabels(sessionId) {
    const { success, error, client } = this.getConnectedClient(sessionId);
    if (!success) {
      return { success: false, error };
    }

    try {
      const labels = await client.getLabels();
      return {
        success: true,
        sessionId,
        labels: (labels || [])
          .map((label) => this.serializeLabel(label))
          .filter(Boolean),
      };
    } catch (err) {
      console.error(`❌ Erro ao listar labels: ${this.formatLabelError(err)}`);
      return {
        success: false,
        error: this.formatLabelError(err),
      };
    }
  }

  async createLabel(sessionId, name, color = null) {
    const { success, error, client } = this.getConnectedClient(sessionId);
    if (!success) {
      return { success: false, error };
    }

    try {
      const created = await this.runLabelBrowserOp(client, "create", {
        name,
        color,
      });

      if (!created) {
        return {
          success: false,
          error: "Label criada, mas não foi possível recuperar o resultado",
        };
      }

      return {
        success: true,
        sessionId,
        label: this.serializeLabel(created),
      };
    } catch (err) {
      console.error(`❌ Erro ao criar label: ${this.formatLabelError(err)}`);
      return {
        success: false,
        error: this.formatLabelError(err),
      };
    }
  }

  async linkLabelToChat(sessionId, labelId, to) {
    const { success, error, client } = this.getConnectedClient(sessionId);
    if (!success) {
      return { success: false, error };
    }

    try {
      const result = await this.runLabelBrowserOp(client, "link", {
        labelId: String(labelId),
        to,
      });

      return {
        success: true,
        sessionId,
        to: result.chatId,
        labelId: String(labelId),
        labels: (result.labels || [])
          .map((label) => this.serializeLabel(label))
          .filter(Boolean),
      };
    } catch (err) {
      console.error(
        `❌ Erro ao vincular label ao chat: ${this.formatLabelError(err)}`,
      );
      return {
        success: false,
        error: this.formatLabelError(err),
      };
    }
  }

  async unlinkLabelFromChat(sessionId, labelId, to) {
    const { success, error, client } = this.getConnectedClient(sessionId);
    if (!success) {
      return { success: false, error };
    }

    try {
      const result = await this.runLabelBrowserOp(client, "unlink", {
        labelId: String(labelId),
        to,
      });

      return {
        success: true,
        sessionId,
        to: result.chatId,
        labelId: String(labelId),
        labels: (result.labels || [])
          .map((label) => this.serializeLabel(label))
          .filter(Boolean),
      };
    } catch (err) {
      console.error(
        `❌ Erro ao remover label do chat: ${this.formatLabelError(err)}`,
      );
      return {
        success: false,
        error: this.formatLabelError(err),
      };
    }
  }

  /******************************************/
  /*************** MongoStore ***************/
  /******************************************/
  // Verificar se uma sessão existe usando MongoStore
  async checkSessionExists(sessionId) {
    try {
      const exists = await this.store.sessionExists({
        session: `RemoteAuth-${sessionId}`,
      });
      return {
        success: true,
        sessionId: sessionId,
        exists: exists,
      };
    } catch (error) {
      console.error(
        `❌ Erro ao verificar existência da sessão: ${error.message}`,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Salvar sessão usando MongoStore
  async saveSession(sessionId) {
    try {
      await this.store.save({
        session: sessionId,
      });
      console.log(`💾 Sessão salva usando MongoStore: ${sessionId}`);
      return {
        success: true,
        sessionId: sessionId,
        message: "Sessão salva com sucesso",
      };
    } catch (error) {
      console.error(
        `❌ Erro ao salvar sessão usando MongoStore: ${error.message}`,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Extrair sessão usando MongoStore
  async extractSession(sessionId, path) {
    try {
      await this.store.extract({
        session: sessionId,
        path: path,
      });
      console.log(`📂 Sessão extraída usando MongoStore: ${sessionId}`);
      return {
        success: true,
        sessionId: sessionId,
        path: path,
        message: "Sessão extraída com sucesso",
      };
    } catch (error) {
      console.error(
        `❌ Erro ao extrair sessão usando MongoStore: ${error.message}`,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Deletar sessão usando MongoStore
  async deleteSession(sessionId) {
    try {
      await this.store.delete({ session: sessionId });
      console.log(`🗑️ Sessão deletada usando MongoStore: ${sessionId}`);
      return {
        success: true,
        sessionId: sessionId,
        message: "Sessão deletada com sucesso",
      };
    } catch (error) {
      console.error(
        `❌ Erro ao deletar sessão usando MongoStore: ${error.message}`,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /*****************************************************/
  /*************** METADADOS DAS SESSÕES ***************/
  /*****************************************************/
  // Salvar sessão no MongoDB
  async saveSessionToDB(sessionId, status, data = {}) {
    try {
      const SessionMetadata = getSessionMetadataModel();
      const metadata = await SessionMetadata.findOne({ sessionId: sessionId });

      if (metadata) {
        await this.deleteSessionMetadata(sessionId);
      }

      const sessionMetadata = new SessionMetadata({
        sessionId: sessionId,
        data: data,
        status: status,
      });

      await sessionMetadata.save();
      console.log(`💾 Metadados da sessão salvos na collection: ${sessionId}`);

      console.log(`💾 Sessão processada: ${sessionId}`);
    } catch (error) {
      console.error(`❌ Erro ao processar sessão: ${error.message}`);
    }
  }

  // Atualizar status da sessão
  async updateSessionStatus(sessionId, status, info = null) {
    try {
      // Atualizar metadados na collection SessionMetadata
      const SessionMetadata = getSessionMetadataModel();
      await SessionMetadata.findOneAndUpdate(
        { sessionId: sessionId },
        {
          status: status,
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      console.log(
        `🔄 Metadados da sessão atualizados: ${sessionId} - ${status}`,
      );
    } catch (error) {
      console.error(`❌ Erro ao atualizar status da sessão: ${error.message}`);
    }
  }

  // Restaurar sessões perdidas
  async restoreLostSessions() {
    try {
      console.log(`🔄 Iniciando restauração de sessões perdidas...`);

      const SessionMetadata = getSessionMetadataModel();

      // Buscar todas as sessões com status "connected"
      const connectedSessions = await SessionMetadata.find({
        status: "connected",
      });

      console.log(
        `📋 Encontradas ${connectedSessions.length} sessões com status "connected"`,
      );

      let restoredCount = 0;
      let disconnectedCount = 0;

      // Função para aguardar um tempo específico
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      // Iterar sobre cada sessão
      for (const session of connectedSessions) {
        try {
          console.log(`🔍 Verificando sessão: ${session.sessionId}`);

          // Verificar se a sessão existe no mongostore
          const sessionCheck = await this.checkSessionExists(session.sessionId);

          if (sessionCheck.success && sessionCheck.exists) {
            console.log(
              `✅ Sessão ${session.sessionId} existe no mongostore, reconectando...`,
            );

            // Aguardar um pouco antes de tentar reconectar (evita sobrecarga)
            await delay(2000);

            // Tentar reconectar a sessão
            const connectionResult = await this.createConnection(
              session.sessionId,
              this.resolveSessionData(session),
            );

            if (connectionResult.success) {
              restoredCount++;
              console.log(
                `✅ Sessão ${session.sessionId} restaurada com sucesso`,
              );

              // Aguardar um pouco antes de processar a próxima sessão
              await delay(10000);
            } else {
              console.log(
                `❌ Falha ao restaurar sessão ${session.sessionId}: ${connectionResult.error}`,
              );
              // Atualizar status para disconnected se falhar na reconexão
              await this.updateSessionStatus(session.sessionId, "disconnected");
              disconnectedCount++;
            }
          } else {
            console.log(
              `❌ Sessão ${session.sessionId} não existe no mongostore, atualizando status...`,
            );

            // Atualizar status para disconnected
            await this.updateSessionStatus(session.sessionId, "disconnected");
            disconnectedCount++;
          }
        } catch (sessionError) {
          console.error(
            `❌ Erro ao processar sessão ${session.sessionId}: ${sessionError.message}`,
          );

          // Verificar se é um erro específico do Puppeteer
          if (
            sessionError.message.includes("Execution context was destroyed") ||
            sessionError.message.includes("Navigation timeout") ||
            sessionError.message.includes("Target closed")
          ) {
            console.log(
              `⚠️ Erro do Puppeteer detectado para sessão ${session.sessionId}, marcando como desconectada`,
            );
          }

          // Em caso de erro, marcar como disconnected
          try {
            await this.updateSessionStatus(session.sessionId, "disconnected");
            disconnectedCount++;
          } catch (updateError) {
            console.error(
              `❌ Erro ao atualizar status da sessão ${session.sessionId}: ${updateError.message}`,
            );
          }

          // Aguardar um pouco antes de continuar com a próxima sessão
          await delay(1000);
        }
      }

      console.log(
        `✅ Restauração concluída: ${restoredCount} sessões restauradas, ${disconnectedCount} marcadas como desconectadas`,
      );

      return {
        success: true,
        totalProcessed: connectedSessions.length,
        restored: restoredCount,
        disconnected: disconnectedCount,
        message: `Restauração concluída com sucesso. ${restoredCount} sessões restauradas, ${disconnectedCount} marcadas como desconectadas.`,
      };
    } catch (error) {
      console.error(`❌ Erro ao restaurar sessões perdidas: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Deletar metadados de uma sessão (uso interno)
  async deleteSessionMetadata(sessionId) {
    try {
      const SessionMetadata = getSessionMetadataModel();
      const deletedMetadata = await SessionMetadata.findOneAndDelete({
        sessionId: sessionId,
      });

      if (!deletedMetadata) {
        return {
          success: false,
          error: "Sessão não encontrada",
        };
      }

      return {
        success: true,
        message: "Metadados da sessão deletados com sucesso",
      };
    } catch (error) {
      console.error(`❌ Erro ao deletar metadados da sessão: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = new WhatsAppService();
