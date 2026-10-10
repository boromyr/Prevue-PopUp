let options = {
    target: 'both',
    targetLinkTypes: 'both',
    openPosition: 'auto',
    openAnimation: true,
    displayUrl: true,
    urlPosition: 'top',
    escCloseTrigger: true,
    outsideClickCloseTrigger: true,
    outsideScrollCloseTrigger: false,
    width: 50,
    widthUnit: '%',
    triggerOpenDelay: 50,
    triggerReleaseDelay: 400,
    triggers: [
        { key: '', action: 'drag' },
        { key: 'alt', action: 'mouseover' },
    ],
}

// Restore the current settings or apply the defaults.
chrome.storage.sync.get(null).then(res => {
    options = { ...options, ...res }

    // Le versioni precedenti salvavano "links"/"images" per targetLinkTypes
    // (valori copiati per errore dal select "target"): prevue.js non li
    // riconosceva e con "Internal"/"External" non si apriva nessuna anteprima.
    options.targetLinkTypes = { links: 'internal', images: 'external' }[options.targetLinkTypes]
        || options.targetLinkTypes

    chrome.storage.sync.set(options)

    document.addEventListener('change', e => {
        const el = e.target

        if (el.tagName === 'SELECT') {
            if (el.name.startsWith('triggers[')) {
                options.triggers[el.dataset.index][el.dataset.prop] = el.value
            } else {
                options[el.name] = el.value
            }
        } else if (el.tagName === 'INPUT' && el.name) {
            // Gli input numerici/testuali non emettono 'click' quando si
            // digita: senza questo ramo un valore scritto a mano (es. width)
            // non veniva mai salvato.
            options[el.name] = el.type === 'checkbox' ? el.checked : el.value
        } else {
            return
        }

        chrome.storage.sync.set(options)
    })

    document.addEventListener('click', e => {
        // Senza name (es. input di terze parti) si salverebbe una chiave ""
        if (e.target.tagName !== 'INPUT' || !e.target.name) return

        options[e.target.name] = e.target.type === 'checkbox' ? e.target.checked : e.target.value

        chrome.storage.sync.set(options)
    })

    updateInputValues()
})

const title = document.querySelector('h1')

title.innerHTML = title.innerHTML.replace(/\bv\b/, chrome.runtime.getManifest().version)

document.querySelector('#see-more').addEventListener('click', e => {
    e.target.closest('#changelog-wrapper').classList.add('expanded')
    e.target.remove()
})

document.querySelector('#watch-demo').addEventListener('click', e => {
    document.querySelector('#video-demo').style.display = 'block'
    document.querySelector('#video-demo video').play()
})

function updateInputValues () {
    Object.keys(options).map(option => {
        const input = document.querySelector(`[name="${option}"]`)

        if (! input) return

        if (input?.type === 'checkbox') {
            input.checked = options[option]
        } else {
            input.value = options[option]
        }
    })

    updateTriggersSection()
}

function updateTriggersSection () {
    const section = document.querySelector('#triggers')
    let markup = '', i = 0

    for (let trigger of options.triggers) {
        markup += `
            <div class="f" style="margin-bottom: 1rem;">
                <div style="padding: 0">
                    <select name="triggers[][key]" data-index="${i}" data-prop="key" data-value="${trigger.key}" style="width: 100%">
                        <option value="">none</option>
                        <option value="alt">ALT</option>
                        <option value="meta">CMD / WIN</option>
                        <option value="ctrl">CTRL</option>
                        <option value="shift">SHIFT</option>
                    </select>
                </div>
                <div style="padding: 0; margin: .5rem; width: 20px; flex-grow: 0; text-align: center;">
                    <strong>&amp;</strong>
                </div>
                <div style="padding: 0">
                    <select name="triggers[][action]" data-index="${i}" data-prop="action" data-value="${trigger.action}" style="width: 100%">
                        <option value="">Choose</option>
                        <option value="click">Left Click</option>
                        <option value="mouseover">Cursor Over / Hover</option>
                        <option value="drag">Drag</option>
                    </select>
                </div>
                <div style="padding: 0; margin: 0 0 0 1rem; width: 40px; flex-grow: 0; text-align: center;">
                    <button type="button" class="danger delete-trigger" data-trigger="${i}" style="height: 100%">&times;</button>
                </div>
            </div>
        `

        i++
    }

    section.innerHTML = markup

    section.querySelectorAll('select').forEach(select => {
        select.value = select.dataset.value + ''
    })
}

document.querySelector('#add-trigger').addEventListener('click', () => {
    options.triggers.push({ key: '', action: '' })

    updateTriggersSection()
})

document.addEventListener('click', e => {
    if (e.target.classList.contains('delete-trigger')) {
        options.triggers.splice(+e.target.dataset.trigger, 1)

        updateTriggersSection()

        chrome.storage.sync.set(options)
    }
})
