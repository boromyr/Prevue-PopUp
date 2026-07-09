// Impedisce a DarkReader di scurire l'anteprima di Prevue.
//
// DarkReader decide per-SCHEDA in base all'URL della pagina in cima, poi
// propaga quella decisione a tutti i frame: un'anteprima eredita quindi lo
// stato DarkReader del sito padre e IGNORA la lista di esclusione del sito
// effettivamente mostrato. Non possiamo leggere quella lista (è privata alla
// sua estensione), ma possiamo usare il meccanismo ufficiale di opt-out di
// DarkReader: il meta tag <meta name="darkreader-lock">. Iniettandolo nel
// documento dentro l'anteprima, DarkReader salta quel frame e il sito viene
// mostrato con il suo aspetto nativo.
//
// Gira a document_start su ogni frame per battere DarkReader ed evitare il
// flash scuro→chiaro; esce subito se il frame non è dentro Prevue.
(() => {
    if (window.self === window.top) return; // mai sul frame principale

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
