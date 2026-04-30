// Background script ottimizzato per Prevue v3 - Blacklist Completa
chrome.manifest = chrome.runtime.getManifest();
console.clear();
console.log(`Loaded Prevue v${chrome.manifest.version} at ${new Date()}`);

// BLACKLIST COMPLETA - Disabilitazione totale dell'estensione
const COMPLETELY_BLOCKED_SITES = [
    // Siti TI e sviluppo che causano problemi di prestazioni
    "webench.ti.com",
    // "lcsc.com",
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
    "twitch.tv",
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

// Cache ottimizzata con cleanup automatico
const injectionCache = new Map();
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

    return COMPLETELY_BLOCKED_SITES.some((site) => {
        if (site.endsWith("/")) {
            return lowercaseUrl.startsWith(site);
        }
        if (site.includes(".")) {
            return lowercaseUrl.includes(site);
        }
        return lowercaseUrl.includes(site);
    });
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

        injectionCache.set(tabId, { time: now, success: true });
        console.log(`Successfully injected Prevue into tab ${tabId}: ${tab.url}`);
        return true;
    } catch (error) {
        console.log(`Injection failed for tab ${tabId}:`, error.message);
        injectionCache.set(tabId, { time: now, success: false });
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

// Tracciamento regole di blocco navigazione per tab (tabId → { ruleId, timeoutId })
const navigationBlockRules = new Map();

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

    // Controllo blacklist per tab corrente
    if (tabId) {
        chrome.tabs.get(tabId).then(tab => {
            if (isCompletelyBlocked(tab?.url)) {
                console.log(`Message blocked for blacklisted site: ${tab.url}`);
                respond({ error: "Site blacklisted" });
                return;
            }
        }).catch(() => { });
    }

    if (req.action === "rememberUrl") {
        if (req.url && typeof req.url === "string" && !isCompletelyBlocked(req.url)) {
            chrome.history.addUrl({ url: req.url }).catch((err) => {
                console.log("Failed to add URL to history:", err.message);
            });
        }
    } else if (req.action === "setupImprobableApology") {
        // Rete di sicurezza: blocca main_frame nav per ~30s.
        // La protezione primaria è il sandbox sull'iframe in prevue.js.
        const existing = navigationBlockRules.get(tabId);
        if (existing) {
            clearTimeout(existing.timeoutId);
            chrome.declarativeNetRequest
                .updateSessionRules({ removeRuleIds: [existing.ruleId] })
                .catch(() => {});
        }

        const ruleId = Math.ceil(Math.random() * 1e8);

        chrome.declarativeNetRequest
            .updateSessionRules({
                addRules: [{
                    id: ruleId,
                    action: { type: "block" },
                    condition: {
                        urlFilter: "*",
                        tabIds: [tabId],
                        resourceTypes: ["main_frame"],
                    },
                }],
            })
            .catch((err) => {
                console.log("Failed to setup redirect rule:", err.message);
            });

        const timeoutId = setTimeout(() => {
            chrome.declarativeNetRequest
                .updateSessionRules({ removeRuleIds: [ruleId] })
                .catch(() => {});
            navigationBlockRules.delete(tabId);
        }, 30000);

        navigationBlockRules.set(tabId, { ruleId, timeoutId });

    } else if (req.action === "teardownNavigationBlock") {
        const block = navigationBlockRules.get(tabId);
        if (block) {
            clearTimeout(block.timeoutId);
            chrome.declarativeNetRequest
                .updateSessionRules({ removeRuleIds: [block.ruleId] })
                .catch((err) => {
                    console.log("Failed to remove redirect rule:", err.message);
                });
            navigationBlockRules.delete(tabId);
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

// Gestione installazione
chrome.runtime.onInstalled.addListener(async function (details) {
    console.log("Extension installed/updated:", details.reason);

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

// Cleanup periodico più aggressivo
setInterval(() => {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // Ridotto a 5 minuti

    // Cleanup cache
    for (const [tabId, data] of injectionCache) {
        if (now - data.time > maxAge) {
            injectionCache.delete(tabId);
        }
    }

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
        `Cleanup completed. Cache sizes: injection=${injectionCache.size}, timing=${lastInjectionTime.size}, rateLimiter=${messageRateLimiter.size}`
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