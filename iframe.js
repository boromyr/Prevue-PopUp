// prevue.html?<url in base64>[&pdf] — "&pdf" lo aggiunge prevue.js quando il
// background ha riconosciuto un PDF da un URL senza estensione .pdf
const [encodedUrl, ...flags] = location.search.slice(1).split('&')
const url = atob(encodedUrl)
// Stessa regex di skipSandbox in prevue.js: riconosce anche i PDF con
// frammento (es. x.pdf#page=3), che prima non ricevevano #view=FitH
const isPdf = flags.includes('pdf') || /\.pdf(\?[^#]*)?(#.*)?$/i.test(url)
const finalUrl = isPdf
    ? url.replace(/#.*$/, '') + '#view=FitH'
    : url

const innerFrame = document.querySelector('iframe')
innerFrame.src = finalUrl

window.addEventListener('message', (e) => {
    if (e.data?.action === 'prevueScroll') {
        innerFrame.contentWindow?.postMessage(e.data, '*')
    }
}, { passive: true })
