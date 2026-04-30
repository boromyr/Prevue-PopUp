const url = atob(location.search.slice(1))
const finalUrl = url.match(/\.pdf(\?[^#]*)?$/i)
    ? url.replace(/#.*$/, '') + '#view=FitH'
    : url

document.querySelector('iframe').src = finalUrl