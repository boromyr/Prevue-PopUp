const url = atob(location.search.slice(1))
// Stessa regex di skipSandbox in prevue.js: riconosce anche i PDF con
// frammento (es. x.pdf#page=3), che prima non ricevevano #view=FitH
const finalUrl = /\.pdf(\?[^#]*)?(#.*)?$/i.test(url)
    ? url.replace(/#.*$/, '') + '#view=FitH'
    : url

const innerFrame = document.querySelector('iframe')
innerFrame.src = finalUrl

window.addEventListener('message', (e) => {
    if (e.data?.action === 'prevueScroll') {
        innerFrame.contentWindow?.postMessage(e.data, '*')
    }
}, { passive: true })