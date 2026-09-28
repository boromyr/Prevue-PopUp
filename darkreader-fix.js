// Forza la modalità CHIARA di DarkReader per una lista esplicita di siti
// dentro l'anteprima di Prevue.
//
// DarkReader decide per-SCHEDA in base all'URL della pagina in cima, poi
// propaga quella decisione a tutti i frame: un'anteprima eredita quindi lo
// stato DarkReader del sito padre e IGNORA la lista di esclusione del sito
// effettivamente mostrato. Non possiamo leggere quella lista (è privata alla
// sua estensione), quindi non possiamo sapere in automatico quali siti
// l'utente ha escluso in DarkReader.
//
// Per questo usiamo una WHITELIST esplicita (FORCE_LIGHT_SITES) invece di
// applicare il lock ovunque: un lock universale forzerebbe la modalità
// chiara anche sui siti dove DarkReader dovrebbe applicarsi normalmente
// (es. Wikipedia), rompendo il comportamento atteso nella maggioranza dei
// casi. Aggiungi qui solo i domini per cui hai verificato il problema.
const FORCE_LIGHT_SITES = [
    '192.168.1.6',
    'www.falstad.com',
    'claude.ai',
    'github.com'
];

// Gira a document_start su ogni frame per battere DarkReader ed evitare il
// flash scuro→chiaro; esce subito se il frame non è dentro Prevue o non è
// nella whitelist.
(() => {
    if (window.self === window.top) return; // mai sul frame principale

    // Confronto con confine di dominio: "aliexpress.com" combacia con
    // "aliexpress.com" e "it.aliexpress.com", NON con "notaliexpress.com".
    // I PDF sono sempre esclusi da DarkReader (invertirebbe i colori del
    // documento), indipendentemente dal dominio: bypassano la whitelist.
    const isPdf = document.contentType === 'application/pdf'
        || /\.pdf$/i.test(location.pathname);
    const host = location.hostname;
    if (!isPdf && !FORCE_LIGHT_SITES.some((site) => host === site || host.endsWith('.' + site))) return;

    // Attivo SOLO dentro un iframe di QUESTA estensione (prevue.html), non
    // quando il sito è embeddato da altre estensioni.
    let inPrevue = false;
    try {
        const ourOrigin = 'chrome-extension://' + chrome.runtime.id;
        const ancestors = location.ancestorOrigins;
        if (ancestors) {
            for (let i = 0; i < ancestors.length; i++) {
                if (ancestors[i] === ourOrigin) {
                    inPrevue = true;
                    break;
                }
            }
        }
    } catch (e) { }

    if (!inPrevue) return;

    const addLock = () => {
        if (document.querySelector('meta[name="darkreader-lock"]')) return;
        const meta = document.createElement('meta');
        meta.name = 'darkreader-lock';
        (document.head || document.documentElement).appendChild(meta);
    };

    addLock();

    // A document_start il <head> può non esistere ancora: riprova appena pronto.
    if (!document.head) {
        document.addEventListener('DOMContentLoaded', addLock, { once: true });
    }
})();
