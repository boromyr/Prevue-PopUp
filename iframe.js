const url = atob(location.search.slice(1))
const finalUrl = url.match(/\.pdf(\?[^#]*)?$/i)
    ? url.replace(/#.*$/, '') + '#view=FitH'
    : url

const innerFrame = document.querySelector('iframe')
innerFrame.src = finalUrl

window.addEventListener('message', (e) => {
    if (e.data?.action === 'prevueScroll') {
        innerFrame.contentWindow?.postMessage(e.data, '*')
    }
}, { passive: true })