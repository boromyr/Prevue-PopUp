(() => {
    // CONTROLLO BLACKLIST IMMEDIATO - TERMINAZIONE PRECOCE
    const COMPLETELY_BLOCKED_SITES = [
        // Lista identica al background script
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
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "192.168.",
        "10.0.",
        "172.16.",
        "chrome://",
        "chrome-extension://",
        "moz-extension://",
        "opera://",
        "edge://",
        "about:",
        "data:",
        "javascript:",
        "file://",
        "chrome.google.com",
        "addons.mozilla.org",
        "microsoftedge.microsoft.com",
        "opera.com/addons",
        "bank.",
        "secure.",
        "pay.",
        "payment.",
        "checkout.",
        "paypal.com",
        "stripe.com",
        "netflix.com",
        "hulu.com",
        "disney.com",
        "primevideo.com",
        "amazon.com/gp/video",
        "twitch.tv",
        "vimeo.com",
        "tiktok.com",
        "maps.google.com",
        "earth.google.com",
        "colab.research.google.com",
        "figma.com",
        "canva.com",
        "miro.com",
        "sketch.com",
        "invisionapp.com",
        "mail.google.com",
        "outlook.live.com",
        "outlook.office.com",
        "docs.google.com",
        "sheets.google.com",
        "slides.google.com",
        "office.com",
        "web.whatsapp.com",
        "discord.com",
        "slack.com",
        "teams.microsoft.com",
        "zoom.us",
        "meet.google.com",
        "steam.com",
        "roblox.com",
        "minecraft.net",
        "tradingview.com",
        "binance.com",
        "coinbase.com",
        "kraken.com",
        "replit.com",
        "stackblitz.com",
        "gitpod.io",
        "vs.dev"
    ];

    // FUNZIONE DI CONTROLLO BLACKLIST (stessa logica del background script)
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
            return hostname.includes(site);
        });
    }

    // CONTROLLO IMMEDIATO - TERMINAZIONE PRECOCE
    if (location.href === 'about:blank' || isCompletelyBlocked(location.href)) {
        console.log('Prevue: Site completely blocked, extension disabled:', location.href);
        return; // TERMINA IMMEDIATAMENTE - ZERO OVERHEAD
    }

    // VERIFICA CLOUDFLARE / TURNSTILE — L'ESTENSIONE SI TOGLIE DI MEZZO
    // Con Prevue attivo sulla pagina che lo ospita, il widget Turnstile non
    // completa mai l'handshake e Cloudflare logga "Turnstile Widget seem to
    // have hung": il box con lo spinner non compare e la pagina resta in
    // attesa di verifica per sempre. Non sono gli header di rete (le regole
    // 'allow' in rules.json escludono già challenges.cloudflare.com dal
    // ruleset), è la presenza dello script di contenuto sulla pagina ospite.
    //
    // Su una pagina di verifica Prevue è comunque inutile — non c'è niente da
    // anteprimare e la pagina viene sostituita appena la verifica passa —
    // quindi la scelta è semplice: non inizializzare affatto.
    const CLOUDFLARE_CHALLENGE_MARKERS = [
        // Contenitori dell'interstiziale ("Esecuzione della verifica di sicurezza")
        '#challenge-form',
        '#challenge-stage',
        '#challenge-running',
        '#challenge-body-text',
        '#cf-challenge-running',
        // Widget Turnstile incorporato in una pagina normale (es. form di login)
        '.cf-turnstile',
        'script[src*="challenges.cloudflare.com"]',
        'iframe[src*="challenges.cloudflare.com"]'
    ].join(',');

    const hasCloudflareChallenge = () => {
        try {
            return !!document.querySelector(CLOUDFLARE_CHALLENGE_MARKERS);
        } catch (e) {
            return false;
        }
    };

    // Smonta SOLO la propria istanza (prevueAbort, definito più sotto), non
    // window.__prevueTeardown: quest'ultimo potrebbe nel frattempo puntare a
    // un'istanza più recente, che un timer in ritardo spegnerebbe per errore.
    const disablePrevueHere = (reason) => {
        if (prevueAbort.signal.aborted) return;

        console.log('Prevue: disattivato su questa pagina —', reason);
        document.getElementById('prevue--wrapper')?.remove();
        prevueAbort.abort();
    };

    if (hasCloudflareChallenge()) {
        console.log('Prevue: verifica Cloudflare rilevata, estensione disattivata qui:', location.href);
        return; // TERMINA IMMEDIATAMENTE
    }

    // SOLO SE IL SITO NON È BLACKLISTED, PROCEDI CON L'INIZIALIZZAZIONE
    console.log('Prevue: Site allowed, initializing extension for:', location.href);

    // SMONTAGGIO DELL'ISTANZA PRECEDENTE
    // Lo script può essere iniettato una seconda volta nella stessa pagina
    // (chrome.scripting.executeScript da background.js: reinjectPrevueHere /
    // reinjectPrevueEverywhere). Senza smontare l'istanza vecchia i suoi
    // listener restano attivi e continuano a pilotare un wrapper che nel
    // frattempo prebuildHtml() ha rimosso dal DOM: il trigger "parte" ma non
    // si vede niente, e l'unico rimedio è ricaricare la pagina.
    // AbortController permette di staccare in un colpo solo tutti i listener
    // registrati dall'istanza precedente.
    window.__prevueTeardown?.()
    const prevueAbort = new AbortController()
    window.__prevueTeardown = () => prevueAbort.abort()

    window.Prevue = class {
        constructor() {
            this.el = {}
            this.onRight = false
            this.resizing = false
            this.iframeBaseUrl = chrome.runtime.getURL('/prevue.html')
            this.knownPdfUrls = new Set()
            this._lastPanningTime = 0
        }

        init() {
            // Controllo finale prima dell'inizializzazione
            if (isCompletelyBlocked(location.href)) {
                console.log('Prevue: Blocked during init, aborting');
                return;
            }

            this.listenForBackgroundMessages()

            this.retrieveOptions(options => {
                // Difesa: se lo storage è vuoto (prima esecuzione, sync non
                // ancora popolato) options.triggers è undefined e setupTriggers
                // crasherebbe, lasciando l'estensione inerte sulla pagina.
                this.options = { target: 'both', triggers: [], ...options }
                this.targetLinks = ['both', 'links'].includes(this.options.target)
                this.targetImages = ['both', 'images'].includes(this.options.target)

                // NB: si legge da this.options, non da options: se lo storage
                // risponde con undefined (errore di sync) `options.width`
                // lanciava un TypeError e setupTriggers() non veniva MAI
                // eseguito → nessun trigger registrato sulla pagina.
                this.prebuildHtml((this.options.width || 50) + (this.options.widthUnit === 'px' ? 'px' : 'vw'))
                this.setupTriggers()

                // Gestione hover popup tramite JS - mouseenter/mouseleave non bubblano (fix flicker Google)
                // Eseguito dentro retrieveOptions così this.el.sidePreview esiste già
                this.setupHoverExpansion();
            })
        }

        setupHoverExpansion() {
            const popup = this.el.sidePreview;
            const isGoogle = window.location.href.includes("google.com/search");

            if (isGoogle) popup.style.width = '640px';

            let hoverCount = 0;
            let savedWidth = null;
            let leaveTimer = null;
            const pendingMovers = new Map(); // target → mousemove watcher

            const cancelPendingMover = (target) => {
                const m = pendingMovers.get(target);
                if (m) {
                    document.removeEventListener('mousemove', m, true);
                    pendingMovers.delete(target);
                }
            };

            const performLeave = () => {
                if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
                hoverCount = Math.max(0, hoverCount - 1);
                if (hoverCount === 0 && savedWidth !== null) {
                    leaveTimer = setTimeout(() => {
                        popup.style.width = savedWidth;
                        savedWidth = null;
                        leaveTimer = null;
                    }, 120);
                }
            };

            const onEnter = (e) => {
                const target = e && e.currentTarget;
                // Se stiamo annullando un mover pendente, è un RIENTRO dopo
                // un falso-leave (scrollbar/iframe): hoverCount non era stato
                // decrementato, quindi NON va re-incrementato — altrimenti il
                // contatore si sballa e il popup resta bloccato espanso.
                const wasPending = target ? pendingMovers.has(target) : false;
                if (target) cancelPendingMover(target);
                if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
                if (wasPending) return;
                if (hoverCount === 0) savedWidth = popup.style.width;
                hoverCount++;
                popup.style.width = '1100px';
            };

            // Soglia per considerare "ancora dentro" il popup anche se le
            // coordinate sono leggermente fuori dal rect (es. scrollbar
            // della pagina padre, tipicamente 15-17px di larghezza).
            const HOVER_PAD = 24;
            const stillInArea = (ev, target) => {
                const r = target.getBoundingClientRect();
                return ev.clientX >= r.left - HOVER_PAD && ev.clientX <= r.right + HOVER_PAD &&
                    ev.clientY >= r.top - HOVER_PAD && ev.clientY <= r.bottom + HOVER_PAD;
            };

            const onLeave = (e) => {
                const target = e && e.currentTarget;
                // Falso leave: il browser emette mouseleave anche quando il
                // mouse entra sulla scrollbar della pagina padre (adiacente
                // al rect del popup). Se le coordinate sono dentro o entro
                // HOVER_PAD dal rect, installiamo un mousemove watcher che
                // attende l'uscita vera dall'area allargata.
                if (target && e && typeof e.clientX === 'number') {
                    if (stillInArea(e, target)) {
                        if (pendingMovers.has(target)) return; // già installato
                        const mover = (ev) => {
                            if (!stillInArea(ev, target)) {
                                cancelPendingMover(target);
                                performLeave();
                            }
                        };
                        pendingMovers.set(target, mover);
                        document.addEventListener('mousemove', mover, { capture: true, passive: true, signal: prevueAbort.signal });
                        return;
                    }
                }
                if (target) cancelPendingMover(target);
                performLeave();
            };

            const attach = (el) => {
                if (!el) return;
                el.addEventListener('mouseenter', onEnter, { signal: prevueAbort.signal });
                el.addEventListener('mouseleave', onLeave, { signal: prevueAbort.signal });
            };

            attach(popup);

            // contextsearch-widgets e .fc-shadow-lg potrebbero non esistere ancora
            const tryAttachExternal = () => {
                const cs = document.querySelector('contextsearch-widgets');
                const fc = document.querySelector('.fc-shadow-lg');
                attach(cs);
                attach(fc);
                return cs || fc;
            };

            if (!tryAttachExternal()) {
                const observer = new MutationObserver(() => {
                    if (tryAttachExternal()) observer.disconnect();
                });
                // Su documentElement, non su document.body: quest'ultimo viene
                // rimpiazzato dalle navigazioni Turbo e l'observer smetterebbe
                // di osservare qualsiasi cosa.
                observer.observe(document.documentElement, { childList: true, subtree: true });
                prevueAbort.signal.addEventListener('abort', () => observer.disconnect());
            }
        }

        setupTriggers() {
            Object.keys(this.options.triggers).map(t => {
                const trigger = this.options.triggers[t]

                // Un'entry malformata nello storage non deve far abortire tutto
                // setupTriggers(): sotto c'è la registrazione di alt+↑, che
                // altrimenti non verrebbe mai eseguita.
                if (!trigger) return

                switch (trigger.action) {
                    case 'drag':
                        this.listenTo('dragstart', () => {
                            this.dragStart = new Date().getTime()
                            // Reset per non riusare il delta del drag precedente;
                            // il valore definitivo lo ricalcola 'dragend'.
                            this.dragDelta = 0
                            this.closeAllPreviews()
                        })
                        this.listenTo('drag', () => this.dragDelta = new Date().getTime() - this.dragStart)
                        this.listenTo('dragend', e => {
                            // Il delta va misurato QUI, non sull'ultimo evento
                            // 'drag': un drag molto rapido non ne emette nessuno
                            // e dragDelta resterebbe 0 — sotto triggerOpenDelay
                            // (default 50ms) → anteprima mai aperta.
                            if (this.dragStart) {
                                this.dragDelta = new Date().getTime() - this.dragStart
                            }

                            if (this.dragDelta >= this.options.triggerOpenDelay &&
                                this.dragDelta <= this.options.triggerReleaseDelay) {
                                this.searchLinkAndTriggerPopup(e, true)
                            }
                        })
                        break
                }
            })

            // TRIGGER PERSONALIZZATI: Alt+ArrowUp sul link sotto il mouse
            // keydown su window (non document.body) per intercettare ovunque sia il focus
            if (!window.location.href.includes("web.whatsapp.com")) {
                this._lastHoverEvent = null;
                this.listen([document], 'mouseover', (e) => {
                    this._lastHoverEvent = e;
                }, { passive: true, capture: true });
                this.listen([window], 'keydown', (e) => {
                    if (e.key === "ArrowUp" && e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey
                        && this._lastHoverEvent) {
                        this.searchLinkAndTriggerPopup(this._lastHoverEvent, true);
                    }
                }, { capture: true });
            }

            // TRIGGER GOOGLE SEARCH OTTIMIZZATO
            if (window.location.href.includes("google.com/search?") && !window.location.href.includes("udm=")) {
                let hoverTimeout;
                this.el.sidePreview.style.transition = 'none';

                this.listenTo("mouseover", (e) => {
                    clearTimeout(hoverTimeout);
                    hoverTimeout = setTimeout(() => {
                        const targetElement = e.target;
                        if (
                            targetElement.classList.contains("LC20lb") ||
                            targetElement.classList.contains("VNLkW") ||
                            targetElement.matches('.VNLkW *') ||
                            targetElement.classList.contains("MBeuO") ||
                            targetElement.classList.contains("immersive-translate-target-inner")
                        ) {
                            this.searchLinkAndTriggerPopup(e, true);
                        }
                    }, 1000); // Ridotto il delay da 1300ms a 1000ms
                });

                this.listenTo("mouseout", () => {
                    clearTimeout(hoverTimeout);
                });
            }

            // ALTRI TRIGGER
            if (this.options.escCloseTrigger) {
                this.listenTo('keydown', e => e.key === 'Escape' && this.close())
            }

            if (this.options.outsideScrollCloseTrigger) {
                this.listenTo('scroll', e => this.isMinimized() || this.close(), { passive: true })
                this.listen([window], 'scroll', e => this.isMinimized() || this.close(), { passive: true })
            }

            if (this.options.outsideClickCloseTrigger) {
                this.listenTo('click', e => {
                    e.target.closest('#prevue--wrapper') || this.isMinimized() || this.close()
                })
            }

            // MOUSE EVENTS OTTIMIZZATI
            this.listen([window], 'mousemove', e => {
                if (!this.resizing) return

                // Rete di sicurezza: se il tasto è già stato rilasciato (mouseup
                // avvenuto fuori dalla finestra, quindi mai ricevuto) sblocchiamo
                // lo stato invece di lasciarlo appeso — vedi commento su mouseup.
                if (e.buttons === 0) {
                    this.resizing = false
                    return
                }

                if (!e.clientX) return

                let width = this.onRight ? window.innerWidth - e.clientX : e.clientX
                width = width / window.innerWidth * 100

                this.el.sidePreview.style.width = width + 'vw'
            }, { passive: true })

            this.listen([window], 'mouseup', e => {
                if (!this.resizing) return

                // Lo sblocco va fatto PRIMA di qualsiasi altro return: se si
                // rilasciava il divisorio sul bordo sinistro (clientX === 0) il
                // vecchio controllo `!e.clientX` usciva subito e this.resizing
                // restava true per sempre. Da quel momento
                // searchLinkAndTriggerPopup() e close() uscivano immediatamente:
                // popup bloccato e nessun trigger funzionante fino al reload.
                setTimeout(() => this.resizing = false, 200)

                if (!e.clientX) return

                if (!this.el.sidePreview.style.width.slice(0, -2)) {
                    return
                }

                chrome.storage.sync.set({
                    width: this.el.sidePreview.style.width.slice(0, -2),
                    widthUnit: '%'
                })
            })

            // CHIUSURA AL BORDO SINISTRO: quando il mouse tocca il bordo
            // sinistro della pagina (clientX === 0), chiudi l'anteprima come
            // un click outside. Ignora durante resize/minimized.
            this.listen([window], 'mousemove', (e) => {
                if (e.clientX > 0) return
                if (this.resizing) return
                if (!this.isOpen()) return
                if (this.isMinimized()) return
                this.close()
            }, { passive: true })
        }

        closeAllPreviews() {
            this.url = null

            this.el.sidePreviewImage.removeAttribute('src')
            this.el.sidePreviewIframe.removeAttribute('src')
            this.el.sidePreview.classList.remove('prevue--visible')

            this.bg('teardownNavigationBlock')

            if (this.changedSettings) {
                this.changedSettings = false
                this.bg('reinjectPrevueHere')
            }
        }

        isOpen() {
            return this.el.sidePreview.classList.contains('prevue--visible')
        }

        close() {
            if (this.resizing) {
                return
            }

            this.isOpen() && this.closeAllPreviews()
        }

        isMinimized() {
            return this.el.sidePreview.classList.contains('prevue--minimized')
        }

        switchSides() {
            this.el.sidePreview.classList.toggle('prevue--right')

            // Reset cache
            this.panningXOffset = undefined
            this.panningYOffset = undefined
        }

        minimizeMaximize() {
            this.el.sidePreview.classList.toggle('prevue--minimized')
        }

        searchLinkAndTriggerPopup(e, isDragging = false) {
            if (this.resizing) return

            if (!this.specialKeyPressed(e) && !isDragging) return

            let url, type

            if (this.targetImages && e.target.tagName === 'IMG') {
                if (this.targetLinks && e.target.closest('a[href]')) {
                    url = e.target.closest('a[href]').href
                    type = 'url'
                } else {
                    url = e.target.src
                    type = 'image'
                }
            } else if (this.targetLinks) {
                const a = e.target.tagName === 'A' ? e.target : e.target.closest('a[href]')
                url = a?.href
                type = 'url'
            }

            if (e.target.dataset?.role === 'img') {
                type = 'image'
            }

            if (url) url = this.unwrapRedirectUrl(url)

            // CONTROLLO BLACKLIST PER URL TARGET
            if (url && isCompletelyBlocked(url)) {
                console.log('Prevue: Target URL is blacklisted, skipping:', url);
                return;
            }

            if (url && this.url !== url) {
                if (this.options.targetLinkTypes === 'both'
                    || (this.options.targetLinkTypes === 'external' && this.isExternal())
                    || (this.options.targetLinkTypes === 'internal' && this.isInternal())) {

                    this.url = url
                    // Registra sempre l'evento scatenante: shouldOpenOnTheRight()
                    // lo usa per decidere il lato in modalità 'auto'. Prima veniva
                    // salvato solo per il drag, così i trigger da tastiera/hover
                    // trovavano this.event undefined e crashavano all'apertura.
                    this.event = e

                    this.updatePreview(type)
                }
            }
        }

        // I risultati di Google possono puntare a google.*/url?…&url=<destinazione>
        // (o q=) invece che direttamente al sito. Si usa la destinazione vera:
        // così un PDF viene riconosciuto subito dall'estensione .pdf (niente
        // primo caricamento con sandbox bloccato da Edge) e il titolo mostra
        // il sito giusto.
        unwrapRedirectUrl(url) {
            try {
                const u = new URL(url)
                if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && u.pathname === '/url') {
                    const target = u.searchParams.get('url') || u.searchParams.get('q')
                    if (target && /^https?:\/\//i.test(target)) return target
                }
            } catch (e) { }
            return url
        }

        prebuildHtml(defaultWidth) {
            // Rimuove eventuale wrapper precedente (in caso di reinjection)
            document.getElementById('prevue--wrapper')?.remove()

            this.el.sidePreview = document.createElement('div')
            this.el.sidePreview.id = 'prevue--wrapper'
            this.el.sidePreview.style.width = defaultWidth

            if (!this.options.displayUrl) {
                this.el.sidePreview.classList.add('prevue--hidden-title')
            }

            if (this.options.urlPosition === 'bottom') {
                this.el.sidePreview.classList.add('prevue--url-bottom')
            }

            if (this.options.openAnimation) {
                this.el.sidePreview.style.transition = 'opacity .2s, left .2s, right .2s'
            }

            const dragger = document.createElement('div')
            dragger.id = 'prevue--dragger'

            dragger.addEventListener('mousedown', e => {
                this.resizing = true
                this.onRight = this.el.sidePreview.classList.contains('prevue--right')
            })

            this.el.sidePreview.appendChild(dragger)

            this.el.sidePreviewTitleWrapper = document.createElement('div')

            const title = document.createElement('a')
            title.className = 'prevue--title'
            title.target = '_blank'
            this.el.sidePreviewTitleWrapper.appendChild(title)

            this.el.sidePreviewTitleWrapper.className = 'prevue--wrapper-title'
            this.el.sidePreview.appendChild(this.el.sidePreviewTitleWrapper)

            this.el.sidePreviewIframe = document.createElement('iframe')
            this.el.sidePreviewIframe.className = 'prevue--iframe'
            this.el.sidePreviewIframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share'
            this.el.sidePreview.appendChild(this.el.sidePreviewIframe)

            this.el.sidePreviewImageWrapper = document.createElement('div')
            this.el.sidePreviewImageWrapper.className = 'prevue--image-wrapper'
            this.el.sidePreview.appendChild(this.el.sidePreviewImageWrapper)

            this.el.sidePreview.onmousemove = e => this.imageZoomPanningHandler(e)

            this.el.sidePreviewImage = document.createElement('img')
            this.el.sidePreviewImage.className = 'prevue--image'

            this.el.sidePreviewImage.onclick = e => {
                const image = e.target

                if (this.getImageZoomPerc() < 100 || image.dataset.panning) {
                    image.dataset.panning = image.dataset.panning === 'true' ? 'false' : 'true'
                }

                setTimeout(() => this.imageZoomPanningHandler(e), 1)
                setTimeout(() => this.setTitle(` (${this.getImageZoomPerc()}%)`), 100)
            }

            this.el.sidePreviewImage.onload = () => this.setTitle(` (${this.getImageZoomPerc()}%)`)
            this.el.sidePreviewImage.onerror = () => this.updatePreview('url')

            this.el.sidePreviewImageWrapper.appendChild(this.el.sidePreviewImage)

            // Action buttons
            this.el.sidePreviewActions = document.createElement('div')
            this.el.sidePreviewActions.className = 'prevue--actions'

            let action = document.createElement('div')
            action.innerHTML = this.closeIconSvg()
            action.className = 'prevue--action-close'
            action.onclick = e => this.close(e)
            this.el.sidePreviewActions.appendChild(action)

            action = document.createElement('div')
            action.innerHTML = this.switchSidesIconSvg()
            action.className = 'prevue--action-switch-sides'
            action.onclick = e => this.switchSides(e)
            this.el.sidePreviewActions.appendChild(action)

            action = document.createElement('div')
            action.innerHTML = this.chevronLeftIconSvg()
            action.className = 'prevue--action-minimize-maximize'
            action.onclick = e => this.minimizeMaximize(e)
            this.el.sidePreviewActions.appendChild(action)

            action = document.createElement('div')
            action.innerHTML = this.cogIconSvg()
            action.className = 'prevue--action-settings'
            action.title = 'Prevue Options'
            action.onclick = () => {
                if (this.url.startsWith(chrome.runtime.getURL('options.html'))) {
                    this.url = this.previousUrl + ''
                    this.sidePreview(this.previousUrlType)
                } else {
                    this.url = chrome.runtime.getURL('options.html')
                    this.changedSettings = true
                    this.sidePreview('url')
                }
            }

            this.el.sidePreviewActions.appendChild(action)

            this.el.sidePreview.appendChild(this.el.sidePreviewActions)

            // Scroll buttons (bottom-right, visible on hover)
            this.el.scrollButtons = document.createElement('div')
            this.el.scrollButtons.className = 'prevue--scroll-buttons'

            const scrollTopBtn = document.createElement('div')
            scrollTopBtn.className = 'prevue--scroll-btn'
            scrollTopBtn.innerHTML = this.scrollTopIconSvg()
            scrollTopBtn.title = 'Scroll to top'
            scrollTopBtn.onclick = () => this.scrollPreviewTo('top')
            this.el.scrollButtons.appendChild(scrollTopBtn)

            const scrollBottomBtn = document.createElement('div')
            scrollBottomBtn.className = 'prevue--scroll-btn'
            scrollBottomBtn.innerHTML = this.scrollBottomIconSvg()
            scrollBottomBtn.title = 'Scroll to bottom'
            scrollBottomBtn.onclick = () => this.scrollPreviewTo('bottom')
            this.el.scrollButtons.appendChild(scrollBottomBtn)

            this.el.sidePreview.appendChild(this.el.scrollButtons)

            ; (document.body || document.documentElement).appendChild(this.el.sidePreview)
        }

        getImageZoomPerc() {
            const image = this.el.sidePreviewImage

            // Immagine non (ancora) caricata: naturalWidth/Height = 0 e la
            // divisione produrrebbe NaN nel titolo ("(NaN%)")
            if (!image.naturalWidth || !image.naturalHeight) return 100

            const xPerc = image.clientWidth / image.naturalWidth * 100
            const yPerc = image.clientHeight / image.naturalHeight * 100

            return Math.round(Math.min(xPerc, yPerc))
        }

        retrieveOptions(cb) {
            try {
                chrome.storage.sync.get(null, options => cb(options || {}))
            } catch (e) {
                // Meglio partire con i default che restare inerti sulla pagina.
                cb({})
            }
        }

        // Rimette il wrapper nel DOM se ne è uscito. Serve sui siti che
        // sostituiscono <body> navigando (Turbo/Hotwire: GitHub, app Rails, …):
        // il nodo appeso al vecchio body resta vivo in memoria ma staccato,
        // quindi aggiungergli 'prevue--visible' non mostrava assolutamente
        // nulla. Sintomo: alt+↑ e drag sembrano non fare più niente finché non
        // si ricarica la pagina.
        ensureMounted() {
            const wrapper = this.el.sidePreview

            if (!wrapper || wrapper.isConnected) return

            document.getElementById('prevue--wrapper')?.remove()
                ; (document.body || document.documentElement).appendChild(wrapper)
        }

        sidePreview(type) {
            this.ensureMounted()

            this.el.sidePreview.classList.toggle('prevue--right', this.shouldOpenOnTheRight())

            if (type === 'image') {
                this.setTitle()

                this.el.sidePreviewImage.src = this.url
                this.el.sidePreview.classList.add('prevue--visible')
                this.el.sidePreviewIframe.style.display = 'none'
                this.el.sidePreviewImageWrapper.style.display = 'flex'

                return
            }

            this.openIframePopup()
        }

        openIframePopup() {
            this.el.sidePreviewImageWrapper.style.display = 'none'
            this.el.sidePreviewIframe.style.display = 'block'
            this.el.sidePreview.classList.add('prevue--visible')

            this.setTitle()

            // Sandbox solo per pagine web (blocca frame-busting tipo Cloudflare/StackExchange).
            // Skip sandbox per:
            //   - PDF (.pdf): il viewer interno di Edge viene bloccato dal sandbox
            //   - TI literature (ti.com/lit/...): redirect a PDF
            //   - YouTube: EME (DRM) non funziona in sandbox → schermata nera; inoltre
            //     la pagina watch va caricata senza sandbox per usare correttamente le
            //     Permission Policy. Il frame-busting di YouTube è gestito su due livelli:
            //       (1) youtube-fix.js (content_script MAIN world) blocca i self-reload
            //       (2) setupImprobableApology (background.js) blocca top-navigation
            //   - URL già riconosciuti come PDF dal background (vedi reloadWithoutSandbox):
            //     dalla seconda apertura in poi niente caricamento bloccato
            const knownPdf = this.knownPdfUrls.has(this.url)
            const skipSandbox = knownPdf
                || /\.pdf(\?[^#]*)?(#.*)?$/i.test(this.url)
                || /^https?:\/\/(www\.)?ti\.com\/lit\//i.test(this.url)
                || /^https?:\/\/(?:www\.|m\.)?youtube\.com\//i.test(this.url)
                || /^https?:\/\/youtu\.be\//i.test(this.url)
            if (skipSandbox) {
                this.el.sidePreviewIframe.removeAttribute('sandbox')
            } else {
                this.el.sidePreviewIframe.setAttribute('sandbox',
                    'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation')
            }

            // Il ruleset che rimuove X-Frame-Options / CSP è SEMPRE attivo
            // (abilitato all'avvio del service worker, vedi ensureCspRulesetEnabled
            // in background.js). Nessun toggle per-anteprima → nessuna race.
            this.el.sidePreviewIframe.src = this.previewFrameUrl(knownPdf)
        }

        // "&pdf" dice a iframe.js di aggiungere #view=FitH anche quando l'URL
        // non finisce in .pdf (base64 non contiene mai "&").
        previewFrameUrl(isPdf) {
            return `${this.iframeBaseUrl}?${btoa(this.url)}${isPdf ? '&pdf' : ''}`
        }

        // Il background ha visto che l'anteprima sandboxed sta caricando un PDF
        // (o che Edge l'ha bloccata): la ricarica senza sandbox. Succede al più
        // una volta per anteprima, perché senza sandbox non scatta più.
        reloadWithoutSandbox(isPdf) {
            const iframe = this.el?.sidePreviewIframe
            if (!this.url || !iframe?.hasAttribute('sandbox')) return
            if (!this.el.sidePreview?.classList.contains('prevue--visible')) return

            if (isPdf) this.knownPdfUrls.add(this.url)

            // Iframe NUOVO al posto di quello vecchio: la pagina "bloccata da
            // Edge" del primo tentativo sparisce subito, e il 'load' ascoltato
            // è sicuramente quello del caricamento buono (sul vecchio elemento
            // potrebbe scattare quello del tentativo bloccato). Resta nascosto
            // fino al load, con un fallback se non arriva.
            const fresh = iframe.cloneNode(false)
            fresh.removeAttribute('sandbox')
            fresh.style.visibility = 'hidden'
            const reveal = () => { fresh.style.visibility = '' }
            fresh.addEventListener('load', reveal, { once: true })
            setTimeout(reveal, 3000)
            fresh.src = this.previewFrameUrl(isPdf)

            iframe.replaceWith(fresh)
            this.el.sidePreviewIframe = fresh
        }

        shouldOpenOnTheRight() {
            if (this.options.openPosition === 'left') {
                return false
            }

            // 'auto': apri dal lato opposto al cursore. Guardia difensiva su
            // this.event per non crashare se manca (fallback: lato sinistro).
            return this.options.openPosition === 'right'
                || this.event?.clientX <= window.innerWidth / 2
        }

        visualUrl(append = '') {
            let isSecure = /^https:\/\//i.test(this.url)

            return (isSecure ? this.lockIconSvg() : '') + `<div>` + this.url
                .replace(new RegExp(`^${location.origin}`, 'i'), '')
                .replace(/^(https?:\/\/)www\./, '$1')
                .replace(/^http:\/\//i, '')
                .replace(/^https:\/\//i, '')
                .replace(/^(!?)([^/]+)/, '$1<strong>$2</strong>') + append + '</div>'
        }

        specialKeyPressed(e) {
            return (this.options.altTrigger && e.altKey)
                || (this.options.metaTrigger && e.metaKey)
                || (this.options.ctrlTrigger && e.ctrlKey)
                || (this.options.shiftTrigger && e.shiftKey)
        }

        updatePreview(type) {
            this.bg({ action: 'rememberUrl', url: this.url })

            this.previousUrl = this.url + ''
            this.previousUrlType = type

            this.bg('setupImprobableApology', () => this.sidePreview(type))
        }

        setTitle(append = '') {
            this.el.sidePreviewTitleWrapper.children[0].innerHTML = this.visualUrl(append)
            this.el.sidePreviewTitleWrapper.children[0].title = this.url
            this.el.sidePreviewTitleWrapper.children[0].href = this.url
        }

        isExternal() {
            if (!this.url) {
                return false
            }

            if (!this.url.toLowerCase().startsWith('http') && /^\/?[^/]+/.test(this.url)) {
                return false
            }

            return !new RegExp(`^(http)?s?:?//${location.hostname}`, 'i').test(this.url)
        }

        isInternal() {
            return !this.isExternal()
        }

        // PANNING OTTIMIZZATO CON THROTTLING MIGLIORATO
        imageZoomPanningHandler(e) {
            const now = Date.now();
            if (now - this._lastPanningTime < 50) return; // Throttling a 20fps
            this._lastPanningTime = now;

            const image = this.el.sidePreviewImage
            const deadOffset = 15

            if (!image.dataset?.panning) return

            const wrapperWidth = this.el.sidePreviewImageWrapper.offsetWidth
            const wrapperHeight = this.el.sidePreviewImageWrapper.offsetHeight
            const shouldHandleXPanning = image.naturalWidth > wrapperWidth
            const shouldHandleYPanning = image.naturalHeight > wrapperHeight

            if (shouldHandleXPanning && this.panningXOffset === undefined) {
                this.panningXOffset = this.el.sidePreview.classList.contains('prevue--right')
                    ? window.innerWidth - this.el.sidePreview.offsetWidth : 0
            }

            if (shouldHandleYPanning && this.panningYOffset === undefined) {
                this.panningYOffset = this.options.urlPosition === 'top' && this.options.displayUrl
                    ? this.el.sidePreviewTitleWrapper.offsetHeight : 0
            }

            if (shouldHandleXPanning) {
                let x = e.x - this.panningXOffset
                x < deadOffset && (x = 0)
                x > wrapperWidth - deadOffset && (x = wrapperWidth)
                const xPerc = x / wrapperWidth

                image.style.left = -xPerc * (image.offsetWidth - wrapperWidth) + 'px'
            } else {
                image.style.left = (wrapperWidth / 2 - image.offsetWidth / 2) + 'px'
            }

            if (shouldHandleYPanning) {
                let y = e.y - this.panningYOffset
                y < deadOffset && (y = 0)
                y > wrapperHeight - deadOffset && (y = wrapperHeight)
                const yPerc = y / wrapperHeight

                image.style.top = -yPerc * (image.offsetHeight - wrapperHeight) + 'px'
            } else {
                image.style.top = (wrapperHeight / 2 - image.offsetHeight / 2) + 'px'
            }
        }

        bg(data, cb = function () { }) {
            if (typeof data === 'string') {
                data = { action: data }
            }

            try {
                chrome.runtime.sendMessage(data, cb)
            } catch (e) { }
        }

        lockIconSvg() {
            return `<svg xmlns="http://www.w3.org/2000/svg" class="prevue--secure-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" /></svg>`
        }

        closeIconSvg() {
            return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`;
        }

        chevronLeftIconSvg() {
            return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>`;
        }

        switchSidesIconSvg() {
            return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>`;
        }

        scrollTopIconSvg() {
            return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>`
        }

        scrollBottomIconSvg() {
            return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>`
        }

        scrollPreviewTo(direction) {
            this.el.sidePreviewIframe.contentWindow?.postMessage({ action: 'prevueScroll', direction }, '*')
        }

        cogIconSvg() {
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" /></svg>`
        }

        isFramed() {
            try {
                return window.self !== window.top
            } catch (e) {
                return false
            }
        }

        initInsideIframe() {
            const isInsideExtensionsIframe = !!location.ancestorOrigins?.[0]?.startsWith('chrome-extension://')

            if (isInsideExtensionsIframe) {
                this.bg({ action: 'reportingIframeUrl', url: location.href })

                this.maybeShowFramingErrorFallback()
                this.passthroughEscapeKeyPressEvent()

                window.addEventListener('message', (e) => {
                    if (e.data?.action !== 'prevueScroll') return
                    if (e.data.direction === 'top') {
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                    } else {
                        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
                    }
                }, { passive: true })
            }
        }

        // FALLBACK ANTI-EMBEDDING: alcuni siti (es. AliExpress con il token
        // MTOP _m_h5_tk) non riescono a caricarsi dentro l'iframe cross-origin
        // e mostrano una pagina d'errore invece del contenuto. Non possiamo
        // recuperare quella pagina, ma possiamo rilevarla e offrire un'uscita
        // pulita: un overlay con "Apri in una nuova scheda" (dove il sito è
        // in contesto di prima parte e funziona normalmente).
        maybeShowFramingErrorFallback() {
            // Marcatori specifici per evitare falsi positivi su pagine valide.
            const ERROR_MARKERS = [
                'FAIL_SYS_TOKEN_EMPTY',
                '令牌为空',
            ]

            const originalUrl = location.href

            const pageHasError = () => {
                const text = (document.title || '') + ' ' + (document.body?.innerText || '')
                return ERROR_MARKERS.some(m => text.includes(m))
            }

            const buildOverlay = () => {
                if (document.getElementById('prevue--fallback-overlay')) return

                const overlay = document.createElement('div')
                overlay.id = 'prevue--fallback-overlay'
                overlay.style.cssText = [
                    'position:fixed', 'inset:0', 'z-index:2147483647',
                    'display:flex', 'flex-direction:column',
                    'align-items:center', 'justify-content:center',
                    'gap:16px', 'padding:24px', 'box-sizing:border-box',
                    'text-align:center', 'background:#1e1e1e', 'color:#f5f5f5',
                    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'
                ].join(';')

                const title = document.createElement('div')
                title.textContent = 'Impossibile mostrare questa pagina nell’anteprima'
                title.style.cssText = 'font-size:16px;font-weight:600;max-width:440px;line-height:1.4'

                const sub = document.createElement('div')
                sub.textContent = 'Il sito blocca il caricamento dentro un frame.'
                sub.style.cssText = 'font-size:13px;opacity:.7;max-width:440px;line-height:1.5'

                const btn = document.createElement('a')
                btn.textContent = 'Apri in una nuova scheda'
                btn.href = originalUrl
                btn.target = '_blank'
                btn.rel = 'noopener noreferrer'
                btn.style.cssText = [
                    'display:inline-block', 'margin-top:4px', 'padding:10px 20px',
                    'border-radius:8px', 'background:#e62e04', 'color:#fff',
                    'text-decoration:none', 'font-size:14px', 'font-weight:600',
                    'cursor:pointer'
                ].join(';')

                overlay.appendChild(title)
                overlay.appendChild(sub)
                overlay.appendChild(btn)
                    ; (document.body || document.documentElement).appendChild(overlay)
            }

            const check = () => {
                if (pageHasError()) {
                    buildOverlay()
                    return true
                }
                return false
            }

            // Controllo immediato + retry: l'errore token può comparire in modo
            // asincrono dopo il fallimento dell'handshake (~6s di finestra).
            if (check()) return

            let attempts = 0
            const interval = setInterval(() => {
                if (check() || ++attempts >= 12) clearInterval(interval)
            }, 500)
        }

        passthroughEscapeKeyPressEvent() {
            document.addEventListener('keyup', e => {
                e.key === 'Escape' && this.bg({ action: 'pressedEscape' })
            }, { passive: true })
        }

        listenForBackgroundMessages() {
            const listener = (req, sender, respond) => {
                if (req.action === 'reportingIframeUrl' && this.url !== req.url) {
                    // Controllo blacklist per URL iframe
                    if (isCompletelyBlocked(req.url)) {
                        console.log('Prevue: Iframe URL is blacklisted, ignoring:', req.url);
                        respond({ error: 'URL blacklisted' });
                        return true;
                    }

                    this.url = req.url
                    this.setTitle()
                }

                else if (req.action === 'pressedEscape') {
                    this.close()
                }

                else if (req.action === 'prevueUnsandbox') {
                    this.reloadWithoutSandbox(req.pdf)
                }

                respond()

                return true
            }

            chrome.runtime.onMessage.addListener(listener)

            // Anche questo va staccato quando lo script viene re-iniettato:
            // altrimenti le istanze vecchie continuano a rispondere ai messaggi
            // del background aggiornando wrapper ormai staccati dal DOM.
            prevueAbort.signal.addEventListener('abort', () => {
                try {
                    chrome.runtime.onMessage.removeListener(listener)
                } catch (e) { }
            })
        }

        listen(els, event, handler, options = {}) {
            els.map(el => el.addEventListener(event, e => this.isContextInvalidated() || handler(e), {
                passive: false,
                ...options,
                signal: prevueAbort.signal
            }))
        }

        // I trigger si agganciano a `document`, MAI a `document.body`: i siti
        // che navigano con Turbo/Hotwire (GitHub in testa, ma anche molti altri
        // SPA) rimpiazzano l'elemento <body> a ogni navigazione interna, e con
        // esso sparivano tutti i listener — drag compreso — finché non si
        // ricaricava la pagina. `document` non viene mai sostituito e tutti gli
        // eventi usati qui (drag*, click, keydown, mouse*, scroll) risalgono
        // fino a lì.
        listenTo(event, handler, options = {}) {
            this.listen([document], event, handler, options)
        }

        isContextInvalidated() {
            if (this.contextInvalidated) {
                return true
            }

            try {
                chrome.runtime.getURL('/')

                return false
            } catch (e) {
                this.contextInvalidated = true

                return true
            }
        }
    }

    window.App = new Prevue()

    App.isFramed()
        ? App.initInsideIframe()
        : App.init()

    // Il widget Turnstile può essere iniettato DOPO document_idle (form di
    // login, challenge che parte su interazione): in quel caso il controllo
    // iniziale non lo vede. Qualche verifica ritardata e limitata nel numero —
    // niente MutationObserver permanente, che su pagine con molto DOM churn
    // costerebbe più del problema che risolve.
    if (!App.isFramed()) {
        [800, 2500, 6000].forEach(delay => setTimeout(() => {
            if (!hasCloudflareChallenge()) return

            disablePrevueHere('verifica Cloudflare comparsa dopo il caricamento')
        }, delay))
    }

})()