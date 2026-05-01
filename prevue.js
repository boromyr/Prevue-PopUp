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

    // FUNZIONE DI CONTROLLO BLACKLIST
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

    // CONTROLLO IMMEDIATO - TERMINAZIONE PRECOCE
    if (location.href === 'about:blank' || isCompletelyBlocked(location.href)) {
        console.log('Prevue: Site completely blocked, extension disabled:', location.href);
        return; // TERMINA IMMEDIATAMENTE - ZERO OVERHEAD
    }

    // SOLO SE IL SITO NON È BLACKLISTED, PROCEDI CON L'INIZIALIZZAZIONE
    console.log('Prevue: Site allowed, initializing extension for:', location.href);

    window.Prevue = class {
        constructor() {
            this.el = {}
            this.onRight = false
            this.resizing = false
            this.iframeBaseUrl = chrome.runtime.getURL('/prevue.html')
            this._lastPanningTime = 0
            this._lastEventTime = {}
        }

        init() {
            // Controllo finale prima dell'inizializzazione
            if (isCompletelyBlocked(location.href)) {
                console.log('Prevue: Blocked during init, aborting');
                return;
            }

            this.listenForBackgroundMessages()

            this.retrieveOptions(options => {
                this.options = options
                this.targetLinks = ['both', 'links'].includes(this.options.target)
                this.targetImages = ['both', 'images'].includes(this.options.target)

                this.prebuildHtml((options.width || 50) + (options.widthUnit === 'px' ? 'px' : 'vw'))
                this.setupTriggers()

                // OTTIMIZZAZIONE AVANZATA: Performance automatica per siti pesanti
                const performanceOptimizationSites = [
                    'twitter.com',
                    'youtube.com',
                    'instagram.com',
                    'reddit.com',
                    'linkedin.com',
                    'amazon.com',
                    'pinterest.com',
                    'gmail.com',
                    'outlook.com',
                    'lcsc.com',

                ];

                const needsOptimization = performanceOptimizationSites.some(site =>
                    window.location.href.includes(site)
                );

                if (needsOptimization) {
                    console.log('Prevue: Performance optimization enabled for heavy site');
                    this.enablePerformanceMode();
                }

                // Gestione hover popup tramite JS - mouseenter/mouseleave non bubblano (fix flicker Google)
                // Eseguito dentro retrieveOptions così this.el.sidePreview esiste già
                this.setupHoverExpansion();
            })
        }

        setupHoverExpansion() {
            const popup = this.el.sidePreview;
            const isGoogle = window.location.href.includes("google.com/search");

            if (isGoogle) popup.style.width = '610px';

            let hoverCount = 0;
            let savedWidth = null;

            const onEnter = () => {
                if (hoverCount === 0) savedWidth = popup.style.width;
                hoverCount++;
                popup.style.width = '1100px';
            };

            const onLeave = () => {
                hoverCount = Math.max(0, hoverCount - 1);
                if (hoverCount === 0 && savedWidth !== null) {
                    popup.style.width = savedWidth;
                    savedWidth = null;
                }
            };

            const attach = (el) => {
                if (!el) return;
                el.addEventListener('mouseenter', onEnter);
                el.addEventListener('mouseleave', onLeave);
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
                observer.observe(document.body, { childList: true, subtree: true });
            }
        }

        // MODALITÀ PERFORMANCE PER SITI PESANTI
        enablePerformanceMode() {
            // Disabilita animazioni
            this.el.sidePreview.style.transition = 'none';

            // Throttling aggressivo per eventi ad alta frequenza
            const originalListen = this.listen.bind(this);
            this.listen = (els, event, handler) => {
                if (['mousemove', 'mouseover', 'scroll'].includes(event)) {
                    const throttledHandler = (e) => {
                        const now = Date.now();
                        if (!this._lastEventTime[event]) this._lastEventTime[event] = 0;

                        if (now - this._lastEventTime[event] < 200) return; // 200ms throttling
                        this._lastEventTime[event] = now;

                        handler(e);
                    };
                    originalListen(els, event, throttledHandler);
                } else {
                    originalListen(els, event, handler);
                }
            };
        }



        setupTriggers() {
            Object.keys(this.options.triggers).map(t => {
                const trigger = this.options.triggers[t]

                switch (trigger.action) {
                    case 'drag':
                        this.listenTo('dragstart', () => {
                            this.dragStart = new Date().getTime()
                            this.closeAllPreviews()
                        })
                        this.listenTo('drag', () => this.dragDelta = new Date().getTime() - this.dragStart)
                        this.listenTo('dragend', e => {
                            if (this.dragDelta >= this.options.triggerOpenDelay &&
                                this.dragDelta <= this.options.triggerReleaseDelay) {
                                this.searchLinkAndTriggerPopup(e, true, true)
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
                        this.searchLinkAndTriggerPopup(this._lastHoverEvent, true, false);
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
                            this.searchLinkAndTriggerPopup(e, true, false);
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
                this.listen([window, document.body], 'scroll', e => this.isMinimized() || this.close(), { passive: true })
            }

            if (this.options.outsideClickCloseTrigger) {
                this.listenTo('click', e => {
                    e.target.closest('#prevue--wrapper') || this.isMinimized() || this.close()
                })
            }

            // MOUSE EVENTS OTTIMIZZATI
            this.listen([window, document.body], 'mousemove', e => {
                if (!e.clientX || !this.resizing) return

                let width = this.onRight ? window.innerWidth - e.clientX : e.clientX
                width = width / window.innerWidth * 100

                this.el.sidePreview.style.width = width + 'vw'
            }, { passive: true })

            this.listen([window, document.body], 'mouseup', e => {
                if (!e.clientX || !this.resizing) return

                setTimeout(() => this.resizing = false, 200)

                if (!this.el.sidePreview.style.width.slice(0, -2)) {
                    return
                }

                chrome.storage.sync.set({
                    width: this.el.sidePreview.style.width.slice(0, -2),
                    widthUnit: '%'
                })
            })
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

        searchLinkAndTriggerPopup(e, isDragging = false, recordEvent = false) {
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
                    recordEvent && (this.event = e)

                    this.updatePreview(type)
                }
            }
        }

        prebuildHtml(defaultWidth) {
            // Remove everything first
            document.querySelectorAll('[id=prevue--wrapper]')?.forEach(wrapper => wrapper.remove())

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
            document.body.appendChild(this.el.sidePreview)
        }

        getImageZoomPerc() {
            const image = this.el.sidePreviewImage
            const xPerc = image.clientWidth / image.naturalWidth * 100
            const yPerc = image.clientHeight / image.naturalHeight * 100

            return Math.round(Math.min(xPerc, yPerc))
        }

        retrieveOptions(cb) {
            try {
                chrome.storage.sync.get(null, options => cb(options))
            } catch (e) { }
        }

        sidePreview(type) {
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
            clearTimeout(this.enableCspTimeout)

            this.el.sidePreviewImageWrapper.style.display = 'none'
            this.el.sidePreviewIframe.style.display = 'block'
            this.el.sidePreview.classList.add('prevue--visible')

            this.setTitle()

            // Sandbox solo per pagine web (blocca frame-busting tipo Cloudflare).
            // Niente sandbox per PDF: il viewer interno di Edge viene bloccato dal sandbox.
            const isPdf = /\.pdf(\?[^#]*)?(#.*)?$/i.test(this.url)
            if (isPdf) {
                this.el.sidePreviewIframe.removeAttribute('sandbox')
            } else {
                this.el.sidePreviewIframe.setAttribute('sandbox',
                    'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation')
            }

            this.bg('disableCsp', () => {
                this.el.sidePreviewIframe.src = `${this.iframeBaseUrl}?${btoa(this.url)}`

                this.enableCspTimeout = setTimeout(() => this.bg('enableCsp'), 8e3) // Ridotto a 8 secondi
            })
        }

        shouldOpenOnTheRight() {
            if (this.options.openPosition === 'left') {
                return false
            }

            return this.options.openPosition === 'right'
                || this.event.clientX <= window.innerWidth / 2
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

        cogIconSvg() {
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" /></svg>`
        }

        ts(append = '') {
            if (this.prevTs) {
                console.log(new Date().getTime() - this.prevTs + 'ms', append)
            } else {
                console.log('-------------- started debugging --------------')
                console.log(append)
            }

            this.prevTs = new Date().getTime()
        }

        isFramed() {
            try {
                return window.self !== window.top
            } catch (e) {
                return false
            }
        }

        initInsideIframe() {
            const isInsideExtensionsIframe = location.ancestorOrigins[0].startsWith('chrome-extension://')

            if (isInsideExtensionsIframe) {
                this.bg({ action: 'reportingIframeUrl', url: location.href })

                this.restyleEmbeddedSitesScrollbars()
                this.passthroughEscapeKeyPressEvent()
            }
        }

        passthroughEscapeKeyPressEvent() {
            document.addEventListener('keyup', e => {
                e.key === 'Escape' && this.bg({ action: 'pressedEscape' })
            }, { passive: true })
        }

        restyleEmbeddedSitesScrollbars() {
            // Scrollbar styling commentato per performance
        }

        listenForBackgroundMessages() {
            chrome.runtime.onMessage.addListener((req, sender, respond) => {
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

                respond()

                return true
            })
        }

        listen(els, event, handler, options = {}) {
            els.map(el => el.addEventListener(event, e => this.isContextInvalidated() || handler(e), {
                passive: false,
                ...options
            }))
        }

        listenTo(event, handler, options = {}) {
            this.listen([document.body], event, handler, options)
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

})()