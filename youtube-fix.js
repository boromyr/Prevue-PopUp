// Content script in MAIN world per YouTube dentro Prevue.
// Strategia aggressiva e definitiva: blocca QUALSIASI navigazione
// non-user-initiated e sopprime i pause automatici sul <video>.

(() => {
    // Log immediato per verificare che lo script sia stato iniettato.
    console.log('[Prevue/YT] youtube-fix.js loaded, frame:', window.location.href, 'top===self:', window.self === window.top);

    if (window.self === window.top) return;

    // Detect Prevue via ancestorOrigins
    let isInPrevue = false;
    let ancestorsInfo = '(none)';
    try {
        const ancestors = window.location.ancestorOrigins;
        if (ancestors && ancestors.length > 0) {
            ancestorsInfo = Array.from(ancestors).join(', ');
            for (let i = 0; i < ancestors.length; i++) {
                if (ancestors[i] && ancestors[i].startsWith('chrome-extension://')) {
                    isInPrevue = true;
                    break;
                }
            }
        }
    } catch (e) {
        console.warn('[Prevue/YT] ancestorOrigins check failed:', e);
    }

    console.log('[Prevue/YT] ancestors:', ancestorsInfo, 'isInPrevue:', isInPrevue);

    if (!isInPrevue) return;

    // ============================================================
    // (1) NAVIGATION API: blocca TUTTE le navigazioni programmatiche
    // ============================================================
    // userInitiated = navigazione causata da gesto utente (click su link,
    // submit di form da tasto, F5). Le lasciamo passare. Tutto il resto
    // (lo "script-initiated") viene bloccato — è esattamente il framebust.
    if (window.navigation && typeof navigation.addEventListener === 'function') {
        try {
            navigation.addEventListener('navigate', (e) => {
                const dest = (e.destination && e.destination.url) || '(?)';
                if (e.userInitiated) {
                    return; // navigazione voluta dall'utente, OK
                }
                console.warn('[Prevue/YT] Bloccata script-nav:', e.navigationType, dest);
                try {
                    e.preventDefault();
                } catch (err) {
                    try { e.intercept({ handler: () => new Promise(() => { }) }); } catch (er) { }
                }
            });
            console.log('[Prevue/YT] Navigation API listener attivo');
        } catch (e) {
            console.warn('[Prevue/YT] Navigation API setup failed:', e);
        }
    } else {
        console.warn('[Prevue/YT] Navigation API non disponibile');
    }

    // ============================================================
    // (2) Location.prototype patches: fallback / belt-and-suspenders
    // ============================================================
    const LP = window.Location && window.Location.prototype;
    if (LP) {
        LP.reload = function () {
            console.warn('[Prevue/YT] Bloccato Location.reload()');
        };
        const _assign = LP.assign;
        LP.assign = function (url) {
            console.warn('[Prevue/YT] Bloccato Location.assign:', url);
        };
        const _replace = LP.replace;
        LP.replace = function (url) {
            console.warn('[Prevue/YT] Bloccato Location.replace:', url);
        };
        try {
            const hrefDesc = Object.getOwnPropertyDescriptor(LP, 'href');
            if (hrefDesc && hrefDesc.configurable) {
                Object.defineProperty(LP, 'href', {
                    configurable: true,
                    enumerable: hrefDesc.enumerable,
                    get: hrefDesc.get,
                    set: function (url) {
                        console.warn('[Prevue/YT] Bloccato Location.href setter:', url);
                    }
                });
            }
        } catch (e) { }
    }

    // ============================================================
    // (3) History.go(): blocca reload via history
    // ============================================================
    try {
        const HP = window.History && window.History.prototype;
        if (HP) {
            const _go = HP.go;
            HP.go = function (delta) {
                if (delta === 0 || delta === undefined || delta === null) {
                    console.warn('[Prevue/YT] Bloccato history.go reload');
                    return;
                }
                return _go.call(this, delta);
            };
        }
    } catch (e) { }

    // ============================================================
    // (4) Strategia "pass-through + event swallow + immediate reverse":
    //     - prototype play/pause sempre pass-through (UI YT sempre ok)
    //     - capture phase 'pause'/'play' event listener: se l'evento va
    //       CONTRO l'intento utente, stopImmediatePropagation impedisce
    //       a YouTube di vederlo → UI YT non si aggiorna alla pause errata
    //     - immediate reverse: _origPlay/_origPause subito dopo stop
    //
    //     Questo elimina sia il problema dell'icona/spinner (perché gli
    //     eventi user-initiated propagano normalmente) sia il problema
    //     della pausa che torna (perché le pause anti-iframe sono
    //     reverse-ate prima che il video sia visibilmente pausato).
    //
    //     Gesture window 500ms + consumed-once + no-op detection per
    //     evitare race condition.
    // ============================================================
    try {
        const MP = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
        if (!MP) throw new Error('HTMLMediaElement.prototype non disponibile');

        const _origPlay = MP.play;
        const _origPause = MP.pause;

        const userPaused = new WeakSet();        // video → utente vuole pausa
        const userPlayed = new WeakSet();        // video → utente ha mai interagito
        const reverting = new WeakSet();         // video → stiamo facendo reverse (evita loop)

        let lastGestureTime = 0;
        let gestureUsedAt = 0;

        // Tracking del gesto utente con DEBOUNCE: un singolo click fisico
        // genera pointerdown→mousedown→click (3 eventi in <50ms). Senza
        // debounce, lastGestureTime viene aggiornato 3 volte, permettendo
        // a consumeGesture di tornare true 3 volte → l'anti-iframe pause
        // viene classificato erroneamente come user-initiated. Con debounce
        // di 150ms, solo il primo evento del cluster conta.
        const trackGesture = (e) => {
            if (!e || !e.isTrusted) return;
            const now = Date.now();
            if (now - lastGestureTime < 150) return; // stesso cluster, ignora
            lastGestureTime = now;
        };
        ['pointerdown', 'mousedown', 'click', 'keydown', 'touchstart'].forEach((type) => {
            try {
                document.addEventListener(type, trackGesture, { capture: true, passive: true });
            } catch (err) { }
        });

        // Consuma il gesto SOLO se:
        //  - non è un no-op (evita race con anti-iframe su stato già giusto)
        //  - userActivation è effettivamente attiva (API browser, ignora
        //    completamente eventi sintetici/non-isTrusted)
        //  - non l'abbiamo già consumato per questo stesso gesto
        const consumeGesture = (isNoOp) => {
            if (isNoOp) return false;
            // Doppia verifica via API browser: se non c'è user activation
            // attiva, NON è un gesto utente, punto.
            try {
                if (navigator.userActivation && !navigator.userActivation.isActive) {
                    return false;
                }
            } catch (e) { /* fallback al timestamp */ }
            const sinceGesture = Date.now() - lastGestureTime;
            if (sinceGesture < 500 && gestureUsedAt < lastGestureTime) {
                gestureUsedAt = lastGestureTime;
                return true;
            }
            return false;
        };

        // === OVERRIDE play()/pause() === pass-through, traccia intent
        const myPlay = function () {
            const isNoOp = !this.paused;
            if (consumeGesture(isNoOp)) {
                userPaused.delete(this);
                userPlayed.add(this);
                console.log('[Prevue/YT] play() user-initiated → intent=play');
            }
            return _origPlay.apply(this, arguments);
        };

        const myPause = function () {
            const isNoOp = this.paused;
            if (consumeGesture(isNoOp)) {
                userPaused.add(this);
                userPlayed.add(this);
                console.log('[Prevue/YT] pause() user-initiated → intent=pause');
            }
            return _origPause.apply(this, arguments);
        };

        const lockMethod = (name, fn) => {
            try {
                Object.defineProperty(MP, name, {
                    value: fn,
                    writable: false,
                    configurable: false,
                    enumerable: false
                });
                console.log('[Prevue/YT] override ' + name + '() lockato');
            } catch (e) {
                console.warn('[Prevue/YT] lock ' + name + '() fallito, fallback:', e.message);
                try { MP[name] = fn; } catch (er) { }
            }
        };
        lockMethod('play', myPlay);
        lockMethod('pause', myPause);

        // === EVENT SWALLOW + IMMEDIATE REVERSE ===
        // Capture phase: l'evento ci arriva PRIMA di YouTube. Se va contro
        // l'intento utente, stopImmediatePropagation impedisce a YT di vederlo
        // (così la sua UI non si aggiorna allo stato sbagliato), e subito dopo
        // ripristiniamo lo stato corretto via _origPlay/_origPause.
        document.addEventListener('pause', (e) => {
            const v = e.target;
            if (!(v instanceof HTMLMediaElement)) return;
            if (!userPlayed.has(v)) return;
            if (userPaused.has(v)) return; // pausa voluta, lascia passare
            if (reverting.has(v)) return;  // stiamo già revertendo, evita loop

            // Pausa programmatica contro intent → blocca event + ri-play
            console.warn('[Prevue/YT] pause event SWALLOWED + reverse to play');
            e.stopImmediatePropagation();
            reverting.add(v);
            _origPlay.call(v).then(() => {
                reverting.delete(v);
            }).catch((err) => {
                reverting.delete(v);
                console.warn('[Prevue/YT] reverse-play failed:', err.message);
            });
        }, { capture: true });

        document.addEventListener('play', (e) => {
            const v = e.target;
            if (!(v instanceof HTMLMediaElement)) return;
            if (!userPlayed.has(v)) return;
            if (!userPaused.has(v)) return; // play voluto, lascia passare
            if (reverting.has(v)) return;

            // Play programmatico contro intent (user voleva pause) → blocca + ri-pause
            console.warn('[Prevue/YT] play event SWALLOWED + reverse to pause');
            e.stopImmediatePropagation();
            reverting.add(v);
            try { _origPause.call(v); } catch (err) { }
            setTimeout(() => reverting.delete(v), 50);
        }, { capture: true });

        // Safety net polling per casi esotici (es. mutazione totale del video element).
        // Polling lento perché gli event listener fanno il grosso del lavoro.
        setInterval(() => {
            document.querySelectorAll('video').forEach((v) => {
                if (v.ended) return;
                if (!userPlayed.has(v)) return;
                if (reverting.has(v)) return;

                if (userPaused.has(v) && !v.paused) {
                    try { _origPause.call(v); } catch (e) { }
                } else if (!userPaused.has(v) && v.paused) {
                    _origPlay.call(v).catch(() => { });
                }
            });
        }, 500);

        console.log('[Prevue/YT] Event-swallow + immediate-reverse attivo');
    } catch (e) {
        console.warn('[Prevue/YT] Setup failed:', e);
    }

    // ============================================================
    // (5) Spoof window.top / window.parent → window
    //     Se Chromium lo permette, YouTube non rileva più di essere
    //     in iframe (top === self) e disattiva tutta la logica
    //     anti-embed inclusi i pause periodici.
    // ============================================================
    try {
        Object.defineProperty(window, 'top', { get: () => window, configurable: true });
        console.log('[Prevue/YT] window.top spoofed');
    } catch (e) {
        console.warn('[Prevue/YT] window.top spoof failed:', e.message);
    }
    try {
        Object.defineProperty(window, 'parent', { get: () => window, configurable: true });
        console.log('[Prevue/YT] window.parent spoofed');
    } catch (e) {
        console.warn('[Prevue/YT] window.parent spoof failed:', e.message);
    }

    // ============================================================
    // (6) document.referrer spoof
    // ============================================================
    try {
        Object.defineProperty(document, 'referrer', {
            configurable: true,
            get: () => 'https://www.youtube.com/'
        });
        console.log('[Prevue/YT] document.referrer spoofed');
    } catch (e) {
        console.warn('[Prevue/YT] document.referrer spoof failed:', e);
    }

    // ============================================================
    // (7) Cinema/Theater mode automatico
    //     Un solo click alla volta (cooldown 1500ms) per evitare
    //     il toggle on/off/on che causa l'attivazione casuale e
    //     la latenza visiva sul pulsante play/pause.
    // ============================================================
    let theaterDone = false;
    let lastTheaterClick = 0;
    const THEATER_COOLDOWN = 1500; // ms minimi tra un click e il successivo

    const attemptTheater = () => {
        if (theaterDone) return;

        const watchEl = document.querySelector('ytd-watch-flexy');
        const btn = document.querySelector('.ytp-size-button');

        // Già attiva → segnalo e smetto
        if (watchEl && watchEl.hasAttribute('theater')) {
            console.log('[Prevue/YT] Theater attiva.');
            theaterDone = true;
            return;
        }

        // Player non pronto → riprovo al prossimo tick
        if (!watchEl || !btn) return;

        // Cooldown: non cliccare se abbiamo già cliccato di recente
        // (previene il toggle on→off→on per click multipli ravvicinati)
        const now = Date.now();
        if (now - lastTheaterClick < THEATER_COOLDOWN) return;

        // Bottone con title "predefinita/default/normal" → già in theater mode
        const label = (btn.getAttribute('title') || btn.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes('default') || label.includes('predefinita') || label.includes('normal')) {
            console.log('[Prevue/YT] Theater attiva (da btn title).');
            theaterDone = true;
            return;
        }

        console.log('[Prevue/YT] Click theater button:', btn.getAttribute('title'));
        lastTheaterClick = now;
        btn.click();
    };

    // Polling leggero: controlla ogni 300ms fino a conferma o timeout 20s
    const theaterInterval = setInterval(() => {
        attemptTheater();
        if (theaterDone) clearInterval(theaterInterval);
    }, 300);
    setTimeout(() => clearInterval(theaterInterval), 20000);

    // Alla navigazione SPA (es. click su video correlato) riparte
    document.addEventListener('yt-navigate-finish', () => {
        theaterDone = false;
        lastTheaterClick = 0;
        console.log('[Prevue/YT] yt-navigate-finish: theater reset');
    });

    console.log('[Prevue/YT] All patches active');
})();
