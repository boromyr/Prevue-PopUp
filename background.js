// Background script ottimizzato per Prevue v3 - Blacklist Completa
chrome.manifest = chrome.runtime.getManifest();
console.log(`Loaded Prevue v${chrome.manifest.version} at ${new Date()}`);

// BLACKLIST COMPLETA - Disabilitazione totale dell'estensione
const COMPLETELY_BLOCKED_SITES = [
    // Siti TI e sviluppo che causano problemi di prestazioni
    "webench.ti.com",
    "github1s.com",
    // "lcsc.com",
    "claude.ai",
    "tonestack.yuriturov.com",
    "altium.com",
    "kicad.org",
    "github.dev",
    "codepen.io",
    "codesandbox.io",

    // Ambienti di sviluppo locali
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "192.168.",
    "10.0.",
    "172.16.",

    // Pagine browser interne
    "chrome://",
    "chrome-extension://",
    "moz-extension://",
    "opera://",
    "edge://",
    "about:",
    "data:",
    "javascript:",
    "file://",

    // Store e marketplace
    "chrome.google.com",
    "addons.mozilla.org",
    "microsoftedge.microsoft.com",
    "opera.com/addons",

    // Siti finanziari e sicurezza
    "bank.",
    "secure.",
    "pay.",
    "payment.",
    "checkout.",
    "paypal.com",
    "stripe.com",

    // Piattaforme video/streaming pesanti
    "netflix.com",
    "hulu.com",
    "disney.com",
    "primevideo.com",
    "amazon.com/gp/video",
    "twitch.tv",
    "vimeo.com",
    "tiktok.com",

    // Applicazioni CAD e design pesanti
    "maps.google.com",
    "earth.google.com",
    "colab.research.google.com",
    "figma.com",
    "canva.com",
    "miro.com",
    "sketch.com",
    "invisionapp.com",

    // Webmail e suite office
    "mail.google.com",
    "outlook.live.com",
    "outlook.office.com",
    "docs.google.com",
    "sheets.google.com",
    "slides.google.com",
    "office.com",

    // Social media pesanti
    "web.whatsapp.com",
    "discord.com",
    "slack.com",
    "teams.microsoft.com",
    "zoom.us",
    "meet.google.com",

    // Gaming e piattaforme interactive
    "steam.com",
    "roblox.com",
    "minecraft.net",

    // Siti di trading e finanza
    "tradingview.com",
    "binance.com",
    "coinbase.com",
    "kraken.com",

    // IDE online e coding platforms
    "replit.com",
    "stackblitz.com",
    "gitpod.io",
    "vs.dev"
];

// SITI CHE RICHIEDONO COOKIE DI TERZE PARTI DENTRO L'IFRAME DI ANTEPRIMA
// AliExpress usa un token anti-bot MTOP (_m_h5_tk) che vive in un cookie.
// Dentro l'anteprima la pagina è in un contesto cross-origin (top-level =
// chrome-extension://), quindi i suoi cookie sono di terze parti e vengono
// bloccati: l'handshake del token non si completa mai e la pagina mostra
// "FAIL_SYS_TOKEN_EMPTY::令牌为空". Registriamo un'eccezione contentSettings
// per consentire i cookie di terze parti di questi domini in QUALSIASI
// contesto top-level (secondaryPattern di default = tutti gli URL).
const THIRD_PARTY_COOKIE_ALLOW_PATTERNS = [
    "https://*.aliexpress.com/*",
    "https://*.aliexpress.us/*",
    "https://*.alicdn.com/*",
    "https://*.alibaba.com/*",
];

function allowThirdPartyCookiesForEmbeddedSites() {
    if (!chrome.contentSettings || !chrome.contentSettings.cookies) {
        console.log("contentSettings.cookies non disponibile: skip");
        return;
    }

    THIRD_PARTY_COOKIE_ALLOW_PATTERNS.forEach((primaryPattern) => {
        chrome.contentSettings.cookies
            .set({
                primaryPattern, // dominio che imposta il cookie
                setting: "allow", // secondaryPattern (top-level) di default = tutti
                scope: "regular",
            })
            .then(() => {
                console.log(`Third-party cookies allowed for ${primaryPattern}`);
            })
            .catch((err) => {
                console.log(
                    `Failed to allow third-party cookies for ${primaryPattern}:`,
                    err.message
                );
            });
    });
}

// Applica l'eccezione all'avvio del service worker
allowThirdPartyCookiesForEmbeddedSites();

// ============================================================================
// RIMOZIONE HEADER ANTI-EMBEDDING — SOLO PER LE ANTEPRIME
// ============================================================================
// X-Frame-Options e Content-Security-Policy (frame-ancestors) fanno mostrare
// "rifiutato la connessione" dentro l'iframe dell'anteprima, quindi vanno
// tolti. Prima lo faceva rules.json su TUTTI gli iframe di TUTTI i siti, per
// sempre: un indebolimento della protezione anti-clickjacking del web intero.
// Ora la rimozione è limitata alle anteprime, in due parti:
//
//  1. PREVIEW_FRAME_RULE — regola DINAMICA sempre attiva, ma solo per le
//     richieste avviate da questa estensione (initiatorDomains = ID
//     dell'estensione). È iframe.js, dentro prevue.html, ad avviare il
//     caricamento del sito: il primo caricamento e tutti i suoi redirect
//     (l'initiator non cambia lungo la catena) sono coperti. Nessun'altra
//     pagina ha come initiator chrome-extension://<questo id>.
//     Dinamica e non statica perché l'ID non è noto in rules.json; ed è
//     registrata una volta e persiste, quindi niente race con la prima
//     anteprima (era il problema del vecchio toggle per-anteprima del
//     ruleset statico: updateEnabledRulesets non è affidabile per la
//     richiesta subito successiva).
//
//  2. Regola di SESSIONE per scheda (setupPreviewHeaders) — le navigazioni
//     successive DENTRO l'anteprima (clic su un link del sito) hanno come
//     initiator il sito stesso, non l'estensione, e la regola 1 non le
//     vede. DNR non sa filtrare per frame, quindi si limita alla scheda e
//     solo finché l'anteprima è aperta: tolta alla chiusura
//     (teardownNavigationBlock), alla navigazione della pagina e alla
//     chiusura della scheda.
//
// In entrambe:
//   - resourceTypes: ["sub_frame"] — questi header contano solo per i
//     documenti incorniciati.
//   - cross-origin-embedder-policy NON va rimosso. Una pagina che invia
//     COEP: require-corp (tipicamente l'interstiziale "Verifying you are
//     human" di Cloudflare) può incorporare un iframe cross-origin solo se
//     anche quell'iframe invia COEP. Il widget Turnstile lo invia:
//     rimuoverglielo faceva rifiutare l'iframe al genitore e il captcha non
//     compariva mai. Per l'anteprima non serve: prevue.html non imposta COEP.
//
// rules.json ora contiene solo le eccezioni 'allow' per Cloudflare
// (priorità 2): valgono anche contro la regola di scheda.
const PREVIEW_FRAME_RULE_ID = 1;
const PREVIEW_TAB_RULE_BASE = 1000000000; // + tabId: lontano dagli id del redirect
const REMOVE_FRAMING_HEADERS = {
    type: "modifyHeaders",
    responseHeaders: [
        { header: "x-frame-options", operation: "remove" },
        { header: "content-security-policy", operation: "remove" },
    ],
};

const previewTabRuleId = (tabId) => PREVIEW_TAB_RULE_BASE + (tabId % PREVIEW_TAB_RULE_BASE);

// Tutte le modifiche alle regole passano da qui, in ordine. Senza coda,
// chiusura e riapertura ravvicinate (il dragstart chiude l'anteprima
// precedente subito prima di aprire la nuova) si accavallavano: il
// teardown leggeva le regole DOPO che la nuova anteprima aveva aggiunto la
// sua, e la cancellava.
let ruleQueue = Promise.resolve();
function queueRuleUpdate(task) {
    ruleQueue = ruleQueue.then(task).catch((err) => {
        console.log("[Prevue] Aggiornamento regole DNR fallito:", err?.message);
    });
    return ruleQueue;
}

async function ensureCspRulesetEnabled() {
    if (!chrome.declarativeNetRequest) return;
    try {
        // Ruleset statico: ormai solo le eccezioni per Cloudflare
        await chrome.declarativeNetRequest.updateEnabledRulesets({
            enableRulesetIds: ["cloudflare-allow"],
        });
        // Remove + add nella stessa chiamata: idempotente, e aggiorna la
        // regola se cambia tra una versione e l'altra.
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [PREVIEW_FRAME_RULE_ID],
            addRules: [{
                id: PREVIEW_FRAME_RULE_ID,
                priority: 1,
                action: REMOVE_FRAMING_HEADERS,
                condition: {
                    initiatorDomains: [chrome.runtime.id],
                    resourceTypes: ["sub_frame"],
                },
            }],
        });
    } catch (err) {
        console.log("[Prevue] Attivazione regole anti-embedding fallita:", err.message);
    }
}

function setupPreviewHeaders(tabId) {
    const id = previewTabRuleId(tabId);
    return queueRuleUpdate(() => chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [id],
        addRules: [{
            id,
            priority: 1,
            action: REMOVE_FRAMING_HEADERS,
            condition: { tabIds: [tabId], resourceTypes: ["sub_frame"] },
        }],
    }));
}

function removePreviewHeaders(tabId) {
    return queueRuleUpdate(() => chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [previewTabRuleId(tabId)],
    }));
}

// Regole di sessione aggiunte in QUESTA vita del service worker: il cleanup
// all'avvio non deve toccarle. Senza questo set c'è una race: se il worker si
// risveglia proprio per un setupImprobableApology, cleanupStaleRules (asincrono)
// può cancellare la regola appena aggiunta, disattivando la protezione
// anti-frame-busting per quell'anteprima.
const sessionRulesAddedThisLifetime = new Set();

// Pulizia stato residuo all'avvio:
//  - regole DINAMICHE lasciate da versioni sperimentali precedenti (tutte
//    tranne PREVIEW_FRAME_RULE);
//  - redirect #prevue:sorry (anti frame-busting) rimasti appesi: potevano
//    "colare" se il service worker MV3 veniva terminato prima del suo
//    cleanup a 10s, redirezionando ogni navigazione della scheda.
// Le regole header per scheda NON si toccano: il worker si riavvia anche
// con un'anteprima aperta (dopo ~30s di inattività) e toglierle romperebbe
// i link cliccati dentro di essa. Si puliscono da sole a chiusura
// dell'anteprima, navigazione della pagina o chiusura della scheda.
function cleanupStaleRules() {
    if (!chrome.declarativeNetRequest) return;
    return queueRuleUpdate(async () => {
        const dynamic = await chrome.declarativeNetRequest.getDynamicRules();
        const staleDynamic = dynamic
            .map((r) => r.id)
            .filter((id) => id !== PREVIEW_FRAME_RULE_ID);
        if (staleDynamic.length) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: staleDynamic,
            });
            console.log("[Prevue] Rimosse regole dinamiche residue:", staleDynamic.length);
        }
        const session = await chrome.declarativeNetRequest.getSessionRules();
        const staleIds = session
            .filter((r) => r.action?.type === "redirect")
            .map((r) => r.id)
            .filter((id) => !sessionRulesAddedThisLifetime.has(id));
        if (staleIds.length) {
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: staleIds,
            });
            console.log("[Prevue] Rimosse regole di sessione residue:", staleIds.length);
        }
    });
}

ensureCspRulesetEnabled();
cleanupStaleRules();

// Cache ottimizzata con cleanup automatico
const lastInjectionTime = new Map();
const MIN_INJECTION_INTERVAL = 3000; // Ridotto a 3 secondi

// Throttling migliorato
let isReinjectingEverywhere = false;
const activeInjections = new Set();
const MAX_CONCURRENT_INJECTIONS = 3; // Ridotto per prestazioni

// FUNZIONE PRINCIPALE: Controllo blacklist completa
function isCompletelyBlocked(url) {
    if (!url || typeof url !== "string") return true;

    const lowercaseUrl = url.toLowerCase();

    let hostname;
    try {
        hostname = new URL(lowercaseUrl).hostname;
    } catch (e) {
        return true; // URL non parsabile: blocca per sicurezza
    }

    return COMPLETELY_BLOCKED_SITES.some((site) => {
        // Pattern di protocollo ("chrome://", "about:"): confronto sul prefisso
        if (site.includes("://") || site.endsWith(":")) {
            return lowercaseUrl.startsWith(site);
        }
        // Pattern con percorso ("amazon.com/gp/video"): confronto sull'URL intero
        if (site.includes("/")) {
            return lowercaseUrl.includes(site);
        }
        // Pattern dominio/IP: confronto sul SOLO hostname. Prima si cercava
        // nell'intero URL e pattern come "10.0." bloccavano per errore pagine
        // con numeri di versione nel percorso (es. .../releases/tag/v10.0.1).
        return hostMatchesSite(hostname, site);
    });
}

// Confronto con confine di etichetta, non sottostringa: con includes()
// "bank." bloccava worldbank.org, "secure." insecure.org, "zoom.us"
// kazoom.us, ecc. Stessa funzione in prevue.js.
//   - "bank." / "192.168." (finiscono col punto): prefisso dell'host o di
//     una sua etichetta → bank.x.it, online.bank.x.it, 192.168.1.6
//   - "vimeo.com": il dominio stesso o un suo sottodominio
function hostMatchesSite(hostname, site) {
    const host = hostname.replace(/^\[|\]$/g, ""); // IPv6: "[::1]" → "::1"
    if (site.endsWith(".")) {
        return host.startsWith(site) || host.includes("." + site);
    }
    return host === site || host.endsWith("." + site);
}

// Injection ottimizzata con controllo blacklist
async function injectPrevue(tabId, includingCss = false) {
    const lastTime = lastInjectionTime.get(tabId);
    const now = Date.now();

    if (lastTime && now - lastTime < MIN_INJECTION_INTERVAL) {
        console.log(`Skipping injection for tab ${tabId} - too recent`);
        return false;
    }

    if (activeInjections.has(tabId)) {
        console.log(`Skipping injection for tab ${tabId} - already in progress`);
        return false;
    }

    try {
        activeInjections.add(tabId);
        lastInjectionTime.set(tabId, now);

        // Verifica esistenza tab
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) {
            console.log(`Tab ${tabId} no longer exists`);
            return false;
        }

        // CONTROLLO BLACKLIST COMPLETA
        if (isCompletelyBlocked(tab.url)) {
            console.log(`Tab ${tabId} is completely blocked: ${tab.url}`);
            return false;
        }

        // Inietta CSS se richiesto
        if (includingCss && chrome.manifest.content_scripts[0].css) {
            await chrome.scripting
                .insertCSS({
                    target: { tabId, allFrames: false },
                    files: chrome.manifest.content_scripts[0].css,
                })
                .catch((err) => {
                    console.log(`CSS injection failed for tab ${tabId}:`, err.message);
                });
        }

        // Inietta JavaScript
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: false },
            files: chrome.manifest.content_scripts[0].js,
        });

        console.log(`Successfully injected Prevue into tab ${tabId}: ${tab.url}`);
        return true;
    } catch (error) {
        console.log(`Injection failed for tab ${tabId}:`, error.message);
        return false;
    } finally {
        activeInjections.delete(tabId);
    }
}

// Reiniezione ottimizzata con filtro blacklist
async function reinjectPrevueEverywhere(includingCss = false) {
    if (isReinjectingEverywhere) {
        console.log("Reinjetion already in progress, skipping...");
        return;
    }

    isReinjectingEverywhere = true;
    console.log("Starting reinjetion everywhere with blacklist filter...");

    try {
        const windows = await chrome.windows.getAll({ populate: true });
        const validTabs = [];

        // Filtra tab valide con controllo blacklist
        for (const win of windows) {
            for (const tab of win.tabs) {
                if (
                    tab.status === "complete" &&
                    tab.url?.length &&
                    /^(https?|file|[a-z]+-extension):/i.test(tab.url) &&
                    !isCompletelyBlocked(tab.url) // FILTRO BLACKLIST
                ) {
                    validTabs.push(tab.id);
                }
            }
        }

        console.log(`Found ${validTabs.length} valid tabs for injection (blacklist filtered)`);

        // Injection in batch ridotti
        const batchSize = MAX_CONCURRENT_INJECTIONS;
        for (let i = 0; i < validTabs.length; i += batchSize) {
            const batch = validTabs.slice(i, i + batchSize);
            const promises = batch.map((tabId) =>
                injectPrevue(tabId, includingCss).catch((err) => {
                    console.log(`Batch injection failed for tab ${tabId}:`, err.message);
                    return false;
                })
            );

            await Promise.allSettled(promises);

            // Pausa più lunga tra batch
            if (i + batchSize < validTabs.length) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
        }
    } catch (error) {
        console.error("Error during reinjetion everywhere:", error);
    } finally {
        isReinjectingEverywhere = false;
        console.log("Reinjetion everywhere completed");
    }
}

// Rate limiting più aggressivo
const messageRateLimiter = new Map();
const MESSAGE_RATE_LIMIT = 200; // Aumentato a 200ms


chrome.runtime.onMessage.addListener((req, sender, respond) => {
    const tabId = sender.tab?.id;
    const messageKey = `${req.action}_${tabId}`;
    const now = Date.now();
    const lastTime = messageRateLimiter.get(messageKey);

    // Rate limiting per messaggi frequenti
    if (["reportingIframeUrl", "pressedEscape"].includes(req.action)) {
        if (lastTime && now - lastTime < MESSAGE_RATE_LIMIT) {
            respond({ error: "Rate limited" });
            return true;
        }
        messageRateLimiter.set(messageKey, now);
    }

    if (req.action === "rememberUrl") {
        if (req.url && typeof req.url === "string" && !isCompletelyBlocked(req.url)) {
            chrome.history.addUrl({ url: req.url }).catch((err) => {
                console.log("Failed to add URL to history:", err.message);
            });
        }
    } else if (req.action === "setupImprobableApology") {
        // Protezione contro frame-busting via top-navigation.
        // Per la maggior parte dei siti il sandbox sull'iframe basta (vedi prevue.js),
        // ma alcuni casi (YouTube, dove il sandbox è disattivato per far funzionare EME)
        // hanno bisogno di protezione a livello rete: registriamo una regola di
        // sessione che redireziona QUALSIASI navigazione main_frame del tab corrente
        // a sé stesso con #prevue:sorry, neutralizzando i tentativi di top.location = url.
        // CRITICO: respond() solo dopo updateSessionRules.then(), altrimenti prevue.js
        // apre l'iframe prima che la regola sia attiva e il framebust passa.
        if (!tabId) {
            respond({ success: true });
            return true;
        }
        // +1 per garantire id >= 1 (DNR rifiuta l'id 0, possibile se
        // tabId % 100000 === 0 e il random è 0)
        const ruleId = (tabId % 100000) * 100 + Math.floor(Math.random() * 100) + 1;
        // Registrata PRIMA della chiamata async: protegge dalla race con
        // cleanupStaleRules all'avvio del service worker.
        sessionRulesAddedThisLifetime.add(ruleId);
        const condition = {
            urlFilter: "*",
            tabIds: [tabId],
            resourceTypes: ["main_frame"],
        };
        // Le navigazioni avviate dalla pagina stessa (clic su un link, JS del
        // sito, es. i risultati di Google) NON vanno bloccate: il frame-busting
        // da neutralizzare parte dal sito DENTRO l'anteprima, che ha un altro
        // initiator. Senza questa esclusione, cliccare un link con l'anteprima
        // aperta (o appena chiusa: teardownNavigationBlock è asincrono e perde
        // la corsa con la navigazione) ricaricava la pagina con #prevue:sorry.
        try {
            const tabHost = new URL(sender.tab?.url || "").hostname;
            if (tabHost) condition.excludedInitiatorDomains = [tabHost];
        } catch (e) { }
        queueRuleUpdate(() => chrome.declarativeNetRequest
            .updateSessionRules({
                addRules: [{
                    id: ruleId,
                    priority: 1,
                    action: {
                        type: "redirect",
                        redirect: { url: (sender.tab?.url || "about:blank") + "#prevue:sorry" },
                    },
                    condition,
                }],
            })
            .then(() => respond({ success: true, ruleId }))
            .catch((err) => {
                console.log("setupImprobableApology failed:", err.message);
                respond({ success: true });
            }));
        // Auto-cleanup di sicurezza: la regola viene rimossa dopo 10s anche se
        // teardownNavigationBlock non viene mai chiamato.
        setTimeout(() => {
            queueRuleUpdate(() => chrome.declarativeNetRequest
                .updateSessionRules({ removeRuleIds: [ruleId] }));
        }, 10000);
        return true;
    } else if (req.action === "setupPreviewHeaders") {
        if (tabId) setupPreviewHeaders(tabId);
    } else if (req.action === "teardownNavigationBlock") {
        // Cleanup esplicito alla chiusura preview: rimuove tutte le regole di
        // sessione del tab corrente (redirect anti frame-busting e rimozione
        // header per le navigazioni dentro l'anteprima).
        if (tabId) {
            queueRuleUpdate(async () => {
                const rules = await chrome.declarativeNetRequest.getSessionRules();
                const idsToRemove = rules
                    .filter((r) => r.condition?.tabIds?.includes(tabId))
                    .map((r) => r.id);
                if (idsToRemove.length) {
                    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: idsToRemove });
                }
            });
        }
    } else if (req.action === "reinjectPrevueEverywhere") {
        reinjectPrevueEverywhere().catch((err) => {
            console.log("Reinjetion everywhere failed:", err.message);
        });
    } else if (req.action === "reinjectPrevueHere") {
        if (tabId) {
            injectPrevue(tabId).catch((err) => {
                console.log("Reinjetion here failed:", err.message);
            });
        }
    } else if (
        req.action === "reportingIframeUrl" &&
        req.url &&
        /^(https?|file|[a-z]+-extension):/i.test(req.url)
    ) {
        if (tabId && !isCompletelyBlocked(req.url)) {
            chrome.tabs.sendMessage(tabId, req).catch((err) => {
                console.log("Failed to send iframe URL message:", err.message);
            });
        }
    } else if (req.action === "pressedEscape") {
        if (tabId) {
            chrome.tabs
                .sendMessage(tabId, { action: "pressedEscape" })
                .catch((err) => {
                    console.log("Failed to send escape message:", err.message);
                });
        }
    }

    respond({ success: true });
    return true;
});

// Gestione installazione
chrome.runtime.onInstalled.addListener(async function (details) {
    console.log("Extension installed/updated:", details.reason);

    // Riapplica l'eccezione cookie di terze parti (AliExpress ecc.)
    allowThirdPartyCookiesForEmbeddedSites();

    // Attiva il ruleset di rimozione header e ripulisce lo stato residuo
    ensureCspRulesetEnabled();
    cleanupStaleRules();

    if (details.reason === "install") {
        await chrome.tabs
            .create({
                url: chrome.runtime.getURL("/options.html"),
            })
            .catch((err) => {
                console.log("Failed to open options page:", err.message);
            });
    } else if (details.reason === "update") {
        console.log(
            `Updated from version ${details.previousVersion} to ${chrome.manifest.version}`
        );
    }

    // Reiniezione con delay più lungo
    setTimeout(() => {
        reinjectPrevueEverywhere(true).catch((err) => {
            console.log("Initial reinjetion failed:", err.message);
        });
    }, 2000); // Aumentato a 2 secondi

    return true;
});

// ============================================================================
// PDF NELL'ANTEPRIMA — togli il sandbox quando serve
// ============================================================================
// Edge blocca il viewer PDF dentro un iframe con sandbox ("Questa pagina è
// stata bloccata da Microsoft Edge"). prevue.js toglie il sandbox solo se
// l'URL finisce in .pdf, ma molti link a PDF non lo fanno: redirect dei
// risultati Google, URL di download, arxiv.org/pdf/…, ecc.
// Qui osserviamo la risposta REALE del frame dell'anteprima (dopo eventuali
// redirect): se è un PDF, o se Edge l'ha bloccata, chiediamo a prevue.js di
// ricaricarla senza sandbox.
const EXTENSION_ORIGIN = chrome.runtime.getURL("").replace(/\/$/, "");

// Siti da aprire SEMPRE senza sandbox, riconosciuti dal dominio FINALE (dopo
// i redirect di Bing, Google, ecc.). AllDataSheet: lo userscript "AllDataSheet
// PDF" mostra il datasheet in un iframe blob: col lettore di Edge, che il
// sandbox ereditato bloccherebbe; le navigazioni blob: non passano da
// webRequest, quindi qui si decide sulla pagina che lo ospita.
// Tenere allineato con la regex equivalente in prevue.js (openIframePopup).
const NO_SANDBOX_HOSTS = /(^|\.)alldatasheet[a-z]*\.[a-z.]+$/i;

// tabId -> Set di frameId dei frame prevue.html. Il frame del sito è figlio di
// prevue.html, e iframe.js ne avvia la navigazione: l'initiator della prima
// richiesta è quindi l'origine dell'estensione. Si memorizza il frame padre
// per riconoscere anche le navigazioni successive nello stesso frame (redirect
// via JS, link cliccati dentro l'anteprima), che hanno un altro initiator.
//
// La mappa è salvata anche in storage.session: il service worker MV3 viene
// terminato dopo ~30s di inattività e, solo in memoria, si perdeva. Un PDF
// aperto da un link DENTRO un'anteprima rimasta aperta più a lungo non
// veniva più riconosciuto (isInsidePrevue → false) e restava bloccato da Edge.
const prevueContainerFrames = new Map();
const PREVUE_FRAMES_KEY = "prevueContainerFrames";

// Unione, non sostituzione: gli eventi arrivati prima del caricamento hanno
// già aggiunto frame alla mappa.
const prevueFramesLoaded = (chrome.storage?.session
    ? chrome.storage.session.get(PREVUE_FRAMES_KEY)
    : Promise.resolve({})
).then((res) => {
    for (const [tabId, frameIds] of Object.entries(res[PREVUE_FRAMES_KEY] || {})) {
        let frames = prevueContainerFrames.get(+tabId);
        if (!frames) prevueContainerFrames.set(+tabId, (frames = new Set()));
        frameIds.forEach((id) => frames.add(id));
    }
}).catch(() => { });

function savePrevueFrames() {
    if (!chrome.storage?.session) return;
    const data = {};
    for (const [tabId, frames] of prevueContainerFrames) data[tabId] = [...frames];
    chrome.storage.session.set({ [PREVUE_FRAMES_KEY]: data }).catch(() => { });
}

function isInsidePrevue(details) {
    return prevueContainerFrames.get(details.tabId)?.has(details.parentFrameId) ?? false;
}

function unsandboxPreview(tabId, reason, url, pdf) {
    console.log(`[Prevue] ${reason} nell'anteprima, ricarico senza sandbox:`, url);
    chrome.tabs.sendMessage(tabId, { action: "prevueUnsandbox", pdf }).catch(() => { });
}

if (chrome.webRequest) {
    const subFrames = { urls: ["http://*/*", "https://*/*"], types: ["sub_frame"] };

    chrome.webRequest.onBeforeRequest.addListener((details) => {
        if (details.tabId < 0 || details.initiator !== EXTENSION_ORIGIN) return;
        let frames = prevueContainerFrames.get(details.tabId);
        if (!frames) prevueContainerFrames.set(details.tabId, (frames = new Set()));
        if (frames.has(details.parentFrameId)) return;
        frames.add(details.parentFrameId);
        // Dopo il caricamento, o si sovrascriverebbe lo storage con la sola
        // mappa parziale di questo risveglio.
        prevueFramesLoaded.then(savePrevueFrames);
    }, subFrames);

    chrome.webRequest.onHeadersReceived.addListener((details) => {
        prevueFramesLoaded.then(() => {
            if (!isInsidePrevue(details)) return;
            const contentType = details.responseHeaders
                ?.find((h) => h.name.toLowerCase() === "content-type")?.value || "";
            if (/\bpdf\b/i.test(contentType)) {
                unsandboxPreview(details.tabId, "PDF", details.url, true);
            } else if (NO_SANDBOX_HOSTS.test(new URL(details.url).hostname)) {
                unsandboxPreview(details.tabId, "Sito senza sandbox", details.url, false);
            }
        });
    }, subFrames, ["responseHeaders"]);

    // La pagina della scheda cambia: l'anteprima è sparita con lei. Si toglie
    // la regola header di scheda (altrimenti varrebbe per tutti gli iframe
    // della pagina successiva) e i frame prevue.html ormai morti.
    chrome.webRequest.onBeforeRequest.addListener((details) => {
        if (details.tabId < 0 || details.frameId !== 0) return;
        removePreviewHeaders(details.tabId);
        prevueFramesLoaded.then(() => {
            if (prevueContainerFrames.delete(details.tabId)) savePrevueFrames();
        });
    }, { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] });

    // Rete di sicurezza: qualunque altro blocco di Edge sul frame (PDF servito
    // con un Content-Type sbagliato, ecc.). prevue.js toglie il sandbox una
    // sola volta per anteprima, quindi niente loop.
    chrome.webRequest.onErrorOccurred.addListener((details) => {
        prevueFramesLoaded.then(() => {
            if (isInsidePrevue(details) && details.error === "net::ERR_BLOCKED_BY_CLIENT") {
                unsandboxPreview(details.tabId, "Frame bloccato", details.url, false);
            }
        });
    }, subFrames);
}

// Cleanup cache quando un tab viene chiuso
chrome.tabs.onRemoved.addListener((tabId) => {
    lastInjectionTime.delete(tabId);
    activeInjections.delete(tabId);
    removePreviewHeaders(tabId);
    prevueFramesLoaded.then(() => {
        if (prevueContainerFrames.delete(tabId)) savePrevueFrames();
    });
});

// Cleanup periodico più aggressivo
setInterval(() => {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // Ridotto a 5 minuti

    for (const [tabId, time] of lastInjectionTime) {
        if (now - time > maxAge) {
            lastInjectionTime.delete(tabId);
        }
    }

    for (const [key, time] of messageRateLimiter) {
        if (now - time > maxAge) {
            messageRateLimiter.delete(key);
        }
    }

    console.log(
        `Cleanup completed. Cache sizes: timing=${lastInjectionTime.size}, rateLimiter=${messageRateLimiter.size}`
    );
}, 3 * 60 * 1000); // Ogni 3 minuti

// Error handling globale
self.addEventListener("error", (event) => {
    console.error("Global error in background script:", event.error);
});

self.addEventListener("unhandledrejection", (event) => {
    console.error(
        "Unhandled promise rejection in background script:",
        event.reason
    );
    event.preventDefault();
});

console.log("Prevue background script loaded with complete blacklist protection");