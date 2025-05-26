// Background script ottimizzato per Prevue v3
chrome.manifest = chrome.runtime.getManifest();
console.clear();
console.log(`Loaded Prevue v${chrome.manifest.version} at ${new Date()}`);

// OTTIMIZZAZIONE 1: Lista di siti esclusi per evitare lag
const EXCLUDED_SITES = [
    // Siti di sviluppo e locali
    "webench.ti.com",
    "lcsc.com",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",

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

    // Siti che causano problemi di prestazioni
    "chrome.google.com",
    "addons.mozilla.org",
    "microsoftedge.microsoft.com",
    "opera.com/addons",

    // Siti che potrebbero interferire con l'estensione
    "bank.", // domini bancari generici
    "secure.",
    "pay.",
    "payment.",
    "checkout.",

    // Piattaforme che gestiscono male iframe
    "netflix.com",
    "hulu.com",
    "disney.com",
    "amazon.com/gp/video",
    "twitch.tv",
    "vimeo.com",

    // Siti ad alto carico computazionale
    "maps.google.com",
    "earth.google.com",
    "colab.research.google.com",
    "figma.com",
    "canva.com",
    "miro.com",

    // Webmail e documenti
    "mail.google.com",
    "outlook.live.com",
    "outlook.office.com",
    "docs.google.com",
    "sheets.google.com",
    "slides.google.com",

    // Social media con interfacce pesanti
    "web.whatsapp.com",
    "discord.com",
    "slack.com",
    "teams.microsoft.com",
    "zoom.us",
];

// OTTIMIZZAZIONE 2: Cache per evitare reiniezioni multiple
const injectionCache = new Map();
const lastInjectionTime = new Map();
const MIN_INJECTION_INTERVAL = 5000; // 5 secondi

// OTTIMIZZAZIONE 3: Throttling per limitare operazioni simultanee
let isReinjectingEverywhere = false;
const activeInjections = new Set();
const MAX_CONCURRENT_INJECTIONS = 5;

// OTTIMIZZAZIONE 4: Funzione per controllare se un URL deve essere escluso
function shouldExcludeUrl(url) {
    if (!url || typeof url !== "string") return true;

    const lowercaseUrl = url.toLowerCase();

    return EXCLUDED_SITES.some((site) => {
        if (site.endsWith("/")) {
            return lowercaseUrl.startsWith(site);
        }
        return lowercaseUrl.includes(site);
    });
}

// OTTIMIZZAZIONE 5: Funzione di injection migliorata con error handling
async function injectPrevue(tabId, includingCss = false) {
    // Controllo se abbiamo già fatto injection recentemente
    const lastTime = lastInjectionTime.get(tabId);
    const now = Date.now();

    if (lastTime && now - lastTime < MIN_INJECTION_INTERVAL) {
        console.log(`Skipping injection for tab ${tabId} - too recent`);
        return false;
    }

    // Controllo se c'è già un'injection in corso
    if (activeInjections.has(tabId)) {
        console.log(`Skipping injection for tab ${tabId} - already in progress`);
        return false;
    }

    try {
        activeInjections.add(tabId);
        lastInjectionTime.set(tabId, now);

        // Verifica che la tab esista ancora
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab || shouldExcludeUrl(tab.url)) {
            return false;
        }

        // Inietta CSS prima se richiesto
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

        injectionCache.set(tabId, { time: now, success: true });
        console.log(`Successfully injected Prevue into tab ${tabId}`);
        return true;
    } catch (error) {
        console.log(`Injection failed for tab ${tabId}:`, error.message);
        injectionCache.set(tabId, { time: now, success: false });
        return false;
    } finally {
        activeInjections.delete(tabId);
    }
}

// OTTIMIZZAZIONE 6: Funzione di reiniezione ottimizzata
async function reinjectPrevueEverywhere(includingCss = false) {
    if (isReinjectingEverywhere) {
        console.log("Reinjetion already in progress, skipping...");
        return;
    }

    isReinjectingEverywhere = true;
    console.log("Starting reinjetion everywhere...");

    try {
        const windows = await chrome.windows.getAll({ populate: true });
        const validTabs = [];

        // Filtra le tab valide
        for (const win of windows) {
            for (const tab of win.tabs) {
                if (
                    tab.status === "complete" &&
                    tab.url?.length &&
                    /^(https?|file|[a-z]+-extension):/i.test(tab.url) &&
                    !shouldExcludeUrl(tab.url)
                ) {
                    validTabs.push(tab.id);
                }
            }
        }

        console.log(`Found ${validTabs.length} valid tabs for injection`);

        // Inietta in batch per evitare sovraccarico
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

            // Pausa tra batch per non sovraccaricare il sistema
            if (i + batchSize < validTabs.length) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
    } catch (error) {
        console.error("Error during reinjetion everywhere:", error);
    } finally {
        isReinjectingEverywhere = false;
        console.log("Reinjetion everywhere completed");
    }
}

// OTTIMIZZAZIONE 7: Gestione messaggi migliorata con rate limiting
const messageRateLimiter = new Map();
const MESSAGE_RATE_LIMIT = 100; // max 100ms tra messaggi dello stesso tipo

chrome.runtime.onMessage.addListener((req, sender, respond) => {
    const tabId = sender.tab?.id;
    const messageKey = `${req.action}_${tabId}`;
    const now = Date.now();
    const lastTime = messageRateLimiter.get(messageKey);

    // Rate limiting per alcuni tipi di messaggi
    if (["reportingIframeUrl", "pressedEscape"].includes(req.action)) {
        if (lastTime && now - lastTime < MESSAGE_RATE_LIMIT) {
            respond({ error: "Rate limited" });
            return true;
        }
        messageRateLimiter.set(messageKey, now);
    }

    if (req.action === "rememberUrl") {
        // Valida URL prima di aggiungerlo alla cronologia
        if (req.url && typeof req.url === "string" && !shouldExcludeUrl(req.url)) {
            chrome.history.addUrl({ url: req.url }).catch((err) => {
                console.log("Failed to add URL to history:", err.message);
            });
        }
    } else if (req.action === "setupImprobableApology") {
        chrome.declarativeNetRequest
            .updateSessionRules({
                addRules: [
                    {
                        id: Math.ceil(Math.random() * 1e8),
                        action: {
                            type: "redirect",
                            redirect: { url: sender.tab.url + "#prevue:sorry" },
                        },
                        condition: {
                            urlFilter: "*",
                            tabIds: [tabId],
                            resourceTypes: ["main_frame"],
                        },
                    },
                ],
            })
            .catch((err) => {
                console.log("Failed to setup redirect rule:", err.message);
            });

        // Cleanup con timeout più breve per evitare accumulo di regole
        setTimeout(() => {
            chrome.declarativeNetRequest
                .getSessionRules()
                .then((rules) => {
                    const ruleIds = rules.map((r) => r.id);
                    if (ruleIds.length > 0) {
                        chrome.declarativeNetRequest
                            .updateSessionRules({
                                removeRuleIds: ruleIds,
                            })
                            .catch((err) => {
                                console.log("Failed to cleanup redirect rules:", err.message);
                            });
                    }
                })
                .catch((err) => {
                    console.log("Failed to get session rules:", err.message);
                });
        }, 2000); // Ridotto da 3 secondi a 2
    } else if (req.action === "reinjectPrevueEverywhere") {
        // Esegui in modo asincrono per non bloccare
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
        if (tabId && !shouldExcludeUrl(req.url)) {
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
    } else if (req.action === "disableCsp") {
        chrome.declarativeNetRequest
            .updateEnabledRulesets({
                enableRulesetIds: ["disable-csp"],
            })
            .catch((err) => {
                console.log("Failed to disable CSP:", err.message);
            });
    } else if (req.action === "enableCsp") {
        chrome.declarativeNetRequest
            .updateEnabledRulesets({
                disableRulesetIds: ["disable-csp"],
            })
            .catch((err) => {
                console.log("Failed to enable CSP:", err.message);
            });
    }

    respond({ success: true });
    return true;
});

// OTTIMIZZAZIONE 8: Gestione installazione migliorata
chrome.runtime.onInstalled.addListener(async function (details) {
    console.log("Extension installed/updated:", details.reason);

    if (details.reason === "install") {
        // Apri pagina opzioni solo per installazioni nuove
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

    // Reiniezione con gestione errori migliorata
    setTimeout(() => {
        reinjectPrevueEverywhere(true).catch((err) => {
            console.log("Initial reinjetion failed:", err.message);
        });
    }, 1000); // Ritardo per permettere al sistema di stabilizzarsi

    return true;
});

// OTTIMIZZAZIONE 9: Cleanup periodico per liberare memoria
setInterval(() => {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minuti

    // Pulisci cache delle injection vecchie
    for (const [tabId, data] of injectionCache) {
        if (now - data.time > maxAge) {
            injectionCache.delete(tabId);
        }
    }

    // Pulisci tempi delle injection vecchie
    for (const [tabId, time] of lastInjectionTime) {
        if (now - time > maxAge) {
            lastInjectionTime.delete(tabId);
        }
    }

    // Pulisci rate limiter per messaggi vecchi
    for (const [key, time] of messageRateLimiter) {
        if (now - time > maxAge) {
            messageRateLimiter.delete(key);
        }
    }

    console.log(
        `Cleanup completed. Cache sizes: injection=${injectionCache.size}, timing=${lastInjectionTime.size}, rateLimiter=${messageRateLimiter.size}`
    );
}, 5 * 60 * 1000); // Ogni 5 minuti

// OTTIMIZZAZIONE 10: Gestione errori globale
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

console.log("Prevue background script loaded with optimizations");
// chrome.manifest = chrome.runtime.getManifest()

// console.clear()
// console.log(`Loaded Prevue v${chrome.manifest.version} at ${new Date()}`)

// function injectPrevue (tabId, includingCss = false) {
//     chrome.scripting.executeScript({
//         target: { tabId, allFrames: false },
//         files: chrome.manifest.content_scripts[0].js,
//     })

//     includingCss && chrome.scripting.insertCSS({
//         target: { tabId, allFrames: false },
//         files: chrome.manifest.content_scripts[0].css,
//     })
// }

// function reinjectPrevueEverywhere (includingCss = false) {
//     chrome.windows.getAll({ populate: true }, windows => {
//         windows.map(win => {
//             win.tabs.map(tab => {
//                 if (tab.status === 'complete'
//                     && ! tab.active
//                     && tab.url?.length
//                     && /^(https?|file|[a-z]+-extension):/i.test(tab.url)
//                     && ! /^https?:\/\/chrome\.google\.com\//.test(tab.url)) {
//                     // console.log(tab.id, tab.url)
//                     injectPrevue(tab.id, includingCss)
//                 } else {
//                     // console.log(tab)
//                 }
//             })
//         })
//     })
// }

// chrome.runtime.onMessage.addListener((req, sender, respond) => {
//     const tabId = sender.tab?.id

//     if (req.action === 'rememberUrl') {
//         chrome.history.addUrl({ url: req.url })
//     }

//     else if (req.action === 'setupImprobableApology') {
//         chrome.declarativeNetRequest.updateSessionRules({
//             addRules: [{
//                 id: Math.ceil(Math.random() * 1e8),
//                 action: {
//                     type: 'redirect',
//                     redirect: { url: sender.tab.url + '#prevue:sorry' }
//                 },
//                 condition: {
//                     urlFilter: '*',
//                     tabIds: [tabId],
//                     resourceTypes: ['main_frame'],
//                 },
//             }],
//         })

//         setTimeout(() => {
//             chrome.declarativeNetRequest.getSessionRules(rules => {
//                 chrome.declarativeNetRequest.updateSessionRules({
//                     removeRuleIds: rules.map(r => r.id),
//                 })
//             })
//         }, 3e3)
//     }

//     else if (req.action === 'reinjectPrevueEverywhere') {
//         reinjectPrevueEverywhere()
//     }

//     else if (req.action === 'reinjectPrevueHere') {
//         injectPrevue(tabId)
//     }

//     else if (req.action === 'reportingIframeUrl' && /^(https?|file|[a-z]+-extension):/i.test(req.url)) {
//         chrome.tabs.sendMessage(tabId, req)
//     }

//     else if (req.action === 'pressedEscape') {
//         chrome.tabs.sendMessage(tabId, { action: 'pressedEscape' })
//     }

//     else if (req.action === 'disableCsp') {
//         chrome.declarativeNetRequest.updateEnabledRulesets({
//             enableRulesetIds: ['disable-csp']
//         })
//     }

//     else if (req.action === 'enableCsp') {
//         chrome.declarativeNetRequest.updateEnabledRulesets({
//             disableRulesetIds: ['disable-csp']
//         })
//     }

//     respond({})

//     return true
// })

// chrome.runtime.onInstalled.addListener(function (details) {
//     if (details.reason === 'install') {
//         chrome.tabs.create({ url: chrome.runtime.getURL('/options.html') })
//     } else if (details.reason === 'update') {
//         //
//     }

//     reinjectPrevueEverywhere(true)

//     return true
// })
