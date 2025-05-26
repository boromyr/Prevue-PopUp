"about:blank" !== location.href &&
	((window.Prevue = class {
		constructor() {
			(this.el = {}), (this.onRight = !1), (this.resizing = !1), (this.iframeBaseUrl = chrome.runtime.getURL("/prevue.html"));
		}
		init() {
			this.listenForBackgroundMessages(),
				this.retrieveOptions((e) => {
					(this.options = e),
						(this.targetLinks = ["both", "links"].includes(this.options.target)),
						(this.targetImages = ["both", "images"].includes(this.options.target)),
						this.prebuildHtml((e.width || 50) + ("px" === e.widthUnit ? "px" : "vw")),
						this.setupTriggers();
				});
		}
		setupTriggers() {
			Object.keys(this.options.triggers).map((e) => {
				const i = this.options.triggers[e];
				switch (i.action) {
					case "click":
						this.listenTo("mousedown", (e) => {
							(!e[i.key + "Key"] && i.key) ||
								(this.searchLinkAndTriggerPopup(e, !1, !0), this.url && e.preventDefault());
						});
						break;
					// case "mouseover":
					// 	this.listenTo("mouseover", (e) => {
					// 		if (e.key === "ctrl") {
					// 			this.searchLinkAndTriggerPopup(e, false, true);
					// 		}
					// 	});
					// 	break;
					case "drag":
						this.listenTo("dragstart", () => {
							(this.dragStart = new Date().getTime()), this.closeAllPreviews();
						}),
							this.listenTo("drag", () => (this.dragDelta = new Date().getTime() - this.dragStart)),
							this.listenTo("dragend", (e) => {
								this.dragDelta >= this.options.triggerOpenDelay &&
									this.dragDelta <= this.options.triggerReleaseDelay &&
									this.searchLinkAndTriggerPopup(e, !0, !0);
							});
				}
			}),
				/* ===================================== shift */
				window.location.href.includes("filecr.com") ||
					window.location.href.includes("web.whatsapp.com") ||
					this.listenTo("mouseover", (e) => {
						document.addEventListener("mouseover", (i) => {
							document.addEventListener("keydown", (e) => {
								"Shift" !== e.key ||
									e.ctrlKey ||
									e.altKey ||
									e.metaKey ||
									this.searchLinkAndTriggerPopup(i, !0, !0);
							});
						});
					});
			/* ==================================== Google */
			let i;
			this.listenTo("mouseover", (e) => {
				const currentURL = e.target.href;
				// if (!e.getURL.includes("google.com")) 
				{
					window.location.href.includes("google.com/search?q") &&
						(clearTimeout(i),
						(i = setTimeout(() => {
							this.searchLinkAndTriggerPopup(e, !0, !0);
						}, 1900)));
				}
			}),
				this.listenTo("mouseout", () => {
					clearTimeout(i);
				}),
				/* --------------------------------------- */
				this.options.escCloseTrigger && this.listenTo("keydown", (e) => "Escape" === e.key && this.close()),
				this.options.outsideScrollCloseTrigger &&
					(this.listenTo("scroll", (e) => this.isMinimized() || this.close()),
					this.listen([window, document.body], "scroll", (e) => this.isMinimized() || this.close())),
				this.options.outsideClickCloseTrigger &&
					this.listenTo("click", (e) => {
						e.target.closest("#prevue--wrapper") || this.isMinimized() || this.close();
					}),
				this.listen([window, document.body], "mousemove", (e) => {
					e.clientX &&
						this.resizing &&
						((e = ((e = this.onRight ? window.innerWidth - e.clientX : e.clientX) / window.innerWidth) * 100),
						(this.el.sidePreview.style.width = e + "vw"));
				}),
				this.listen([window, document.body], "mouseup", (e) => {
					e.clientX &&
						this.resizing &&
						(setTimeout(() => (this.resizing = !1), 200), this.el.sidePreview.style.width.slice(0, -2)) &&
						chrome.storage.sync.set({ width: this.el.sidePreview.style.width.slice(0, -2), widthUnit: "%" });
				});
		}
		closeAllPreviews() {
			(this.url = null),
				this.el.sidePreviewImage.removeAttribute("src"),
				this.el.sidePreviewIframe.removeAttribute("src"),
				this.el.sidePreview.classList.remove("prevue--visible"),
				this.changedSettings && ((this.changedSettings = !1), this.bg("reinjectPrevueHere"));
		}
		isOpen() {
			return this.el.sidePreview.classList.contains("prevue--visible");
		}
		close() {
			this.resizing || (this.isOpen() && this.closeAllPreviews());
		}
		isMinimized() {
			return this.el.sidePreview.classList.contains("prevue--minimized");
		}
		switchSides() {
			this.el.sidePreview.classList.toggle("prevue--right"),
				// Resetting some cache.
				(this.panningXOffset = void 0),
				(this.panningYOffset = void 0);
		}
		minimizeMaximize() {
			this.el.sidePreview.classList.toggle("prevue--minimized");
		}
		searchLinkAndTriggerPopup(t, s = !1, r = !1) {
			if (!this.resizing && (this.specialKeyPressed(t) || s)) {
				let e, i;
				this.targetImages && "IMG" === t.target.tagName
					? (i =
							this.targetLinks && t.target.closest("a[href]")
								? ((e = t.target.closest("a[href]").href), "url")
								: ((e = t.target.src), "image"))
					: this.targetLinks &&
					  ((s = "A" === t.target.tagName ? t.target : t.target.closest("a[href]")), (e = s?.href), (i = "url")),
					"img" === t.target.dataset?.role && (i = "image"),
					e &&
						this.url !== e &&
						("both" === this.options.targetLinkTypes ||
							("external" === this.options.targetLinkTypes && this.isExternal()) ||
							("internal" === this.options.targetLinkTypes && this.isInternal())) &&
						((this.url = e), r && (this.event = t), this.updatePreview(i));
			}
		}
		prebuildHtml(e) {
			// Remove everything first.
			document.querySelectorAll("[id=prevue--wrapper]")?.forEach((e) => e.remove()),
				(this.el.sidePreview = document.createElement("div")),
				(this.el.sidePreview.id = "prevue--wrapper"),
				(this.el.sidePreview.style.width = e),
				this.options.displayUrl || this.el.sidePreview.classList.add("prevue--hidden-title"),
				"bottom" === this.options.urlPosition && this.el.sidePreview.classList.add("prevue--url-bottom"),
				this.options.openAnimation && (this.el.sidePreview.style.transition = "opacity .2s, left .2s, right .2s"),
				((e = document.createElement("div")).id = "prevue--dragger"),
				e.addEventListener("mousedown", (e) => {
					(this.resizing = !0), (this.onRight = this.el.sidePreview.classList.contains("prevue--right"));
				}),
				this.el.sidePreview.appendChild(e),
				(this.el.sidePreviewTitleWrapper = document.createElement("div")),
				((e = document.createElement("a")).className = "prevue--title"),
				(e.target = "_blank"),
				this.el.sidePreviewTitleWrapper.appendChild(e),
				(this.el.sidePreviewTitleWrapper.className = "prevue--wrapper-title"),
				this.el.sidePreview.appendChild(this.el.sidePreviewTitleWrapper),
				(this.el.sidePreviewIframe = document.createElement("iframe")),
				(this.el.sidePreviewIframe.className = "prevue--iframe"),
				this.el.sidePreview.appendChild(this.el.sidePreviewIframe),
				(this.el.sidePreviewImageWrapper = document.createElement("div")),
				(this.el.sidePreviewImageWrapper.className = "prevue--image-wrapper"),
				this.el.sidePreview.appendChild(this.el.sidePreviewImageWrapper),
				(this.el.sidePreview.onmousemove = (e) => this.imageZoomPanningHandler(e)),
				(this.el.sidePreviewImage = document.createElement("img")),
				(this.el.sidePreviewImage.className = "prevue--image"),
				(this.el.sidePreviewImage.onclick = (e) => {
					var i = e.target;
					(this.getImageZoomPerc() < 100 || i.dataset.panning) &&
						(i.dataset.panning = "true" === i.dataset.panning ? "false" : "true"),
						setTimeout(() => this.imageZoomPanningHandler(e), 1),
						setTimeout(() => this.setTitle(` (${this.getImageZoomPerc()}%)`), 100);
				}),
				(this.el.sidePreviewImage.onload = () => this.setTitle(` (${this.getImageZoomPerc()}%)`)),
				(this.el.sidePreviewImage.onerror = () => this.updatePreview("url")),
				this.el.sidePreviewImageWrapper.appendChild(this.el.sidePreviewImage),
				// Create the action buttons wrapper.
				(this.el.sidePreviewActions = document.createElement("div")),
				(this.el.sidePreviewActions.className = "prevue--actions");
			let i = document.createElement("div");
			(i.innerHTML = this.closeIconSvg()),
				(i.className = "prevue--action-close"),
				(i.onclick = (e) => this.close(e)),
				this.el.sidePreviewActions.appendChild(i),
				((i = document.createElement("div")).innerHTML = this.switchSidesIconSvg()),
				(i.className = "prevue--action-switch-sides"),
				(i.onclick = (e) => this.switchSides(e)),
				this.el.sidePreviewActions.appendChild(i),
				((i = document.createElement("div")).innerHTML = this.chevronLeftIconSvg()),
				(i.className = "prevue--action-minimize-maximize"),
				(i.onclick = (e) => this.minimizeMaximize(e)),
				this.el.sidePreviewActions.appendChild(i),
				((i = document.createElement("div")).innerHTML = this.cogIconSvg()),
				(i.className = "prevue--action-settings"),
				(i.title = "Prevue Options"),
				(i.onclick = () => {
					this.url.startsWith(chrome.runtime.getURL("options.html"))
						? ((this.url = this.previousUrl + ""), this.sidePreview(this.previousUrlType))
						: ((this.url = chrome.runtime.getURL("options.html")), (this.changedSettings = !0), this.sidePreview("url"));
				}),
				this.el.sidePreviewActions.appendChild(i),
				this.el.sidePreview.appendChild(this.el.sidePreviewActions),
				document.body.appendChild(this.el.sidePreview);
		}
		getImageZoomPerc() {
			var e = ((i = this.el.sidePreviewImage).clientWidth / i.naturalWidth) * 100,
				i = (i.clientHeight / i.naturalHeight) * 100;
			return Math.round(Math.min(e, i));
		}
		retrieveOptions(i) {
			try {
				chrome.storage.sync.get(null, (e) => i(e));
			} catch (e) {}
		}
		sidePreview(e) {
			// If the mouse is positioned on the right side of the page, add a CSS class.
			this.el.sidePreview.classList.toggle("prevue--right", this.shouldOpenOnTheRight()),
				"image" === e
					? (this.setTitle(),
					  (this.el.sidePreviewImage.src = this.url),
					  this.el.sidePreview.classList.add("prevue--visible"),
					  (this.el.sidePreviewIframe.style.display = "none"),
					  (this.el.sidePreviewImageWrapper.style.display = "flex"))
					: this.openIframePopup();
		}
		openIframePopup() {
			clearTimeout(this.enableCspTimeout),
				(this.el.sidePreviewImageWrapper.style.display = "none"),
				(this.el.sidePreviewIframe.style.display = "block"),
				this.el.sidePreview.classList.add("prevue--visible"),
				this.setTitle(),
				this.bg("disableCsp", () => {
					(this.el.sidePreviewIframe.src = this.iframeBaseUrl + "?" + btoa(this.url)),
						(this.enableCspTimeout = setTimeout(() => this.bg("enableCsp"), 1e4));
				});
		}
		shouldOpenOnTheRight() {
			return "left" !== this.options.openPosition && ("right" === this.options.openPosition || this.event.clientX <= window.innerWidth / 2);
		}
		visualUrl(e = "") {
			return (
				(/^https:\/\//i.test(this.url) ? this.lockIconSvg() : "") +
				"<div>" +
				this.url
					.replace(new RegExp("^" + location.origin, "i"), "")
					.replace(/^(https?:\/\/)www\./, "$1")
					.replace(/^http:\/\//i, "")
					.replace(/^https:\/\//i, "")
					.replace(/^(!?)([^/]+)/, "$1<strong>$2</strong>") +
				e +
				"</div>"
			);
		}
		specialKeyPressed(e) {
			return (
				(this.options.altTrigger && e.altKey) ||
				(this.options.metaTrigger && e.metaKey) ||
				(this.options.ctrlTrigger && e.ctrlKey) ||
				(this.options.shiftTrigger && e.shiftKey)
			);
		}
		updatePreview(e) {
			this.bg({ action: "rememberUrl", url: this.url }),
				(this.previousUrl = this.url + ""),
				(this.previousUrlType = e),
				this.bg("setupImprobableApology", () => this.sidePreview(e));
		}
		setTitle(e = "") {
			(this.el.sidePreviewTitleWrapper.children[0].innerHTML = this.visualUrl(e)),
				(this.el.sidePreviewTitleWrapper.children[0].title = this.url),
				(this.el.sidePreviewTitleWrapper.children[0].href = this.url);
		}
		isExternal() {
			return (
				!!this.url &&
				// Begins with something other than http or //
				!(
					(!this.url.toLowerCase().startsWith("http") && /^\/?[^/]+/.test(this.url)) ||
					new RegExp("^(http)?s?:?//" + location.hostname, "i").test(this.url)
				)
			);
		}
		isInternal() {
			return !this.isExternal();
		}
		imageZoomPanningHandler(e) {
			var i,
				t,
				s,
				r,
				n,
				l = this.el.sidePreviewImage;
			l.dataset?.panning &&
				((i = this.el.sidePreviewImageWrapper.offsetWidth),
				(t = this.el.sidePreviewImageWrapper.offsetHeight),
				(r = l.naturalWidth > i),
				(s = l.naturalHeight > t),
				r &&
					void 0 === this.panningXOffset &&
					(this.panningXOffset = this.el.sidePreview.classList.contains("prevue--right")
						? window.innerWidth - this.el.sidePreview.offsetWidth
						: 0),
				s &&
					void 0 === this.panningYOffset &&
					(this.panningYOffset =
						"top" === this.options.urlPosition && this.options.displayUrl
							? this.el.sidePreviewTitleWrapper.offsetHeight
							: 0),
				r
					? ((r = (n = (n = (n = e.x - this.panningXOffset) < 15 ? 0 : n) > i - 15 ? i : n) / i),
					  (l.style.left = -r * (l.offsetWidth - i) + "px"))
					: (l.style.left = i / 2 - l.offsetWidth / 2 + "px"),
				s
					? ((r = (n = (n = (n = e.y - this.panningYOffset) < 15 ? 0 : n) > t - 15 ? t : n) / t),
					  (l.style.top = -r * (l.offsetHeight - t) + "px"))
					: (l.style.top = t / 2 - l.offsetHeight / 2 + "px"));
		}
		bg(e, i = function () {}) {
			"string" == typeof e && (e = { action: e });
			try {
				chrome.runtime.sendMessage(e, i);
			} catch (e) {}
		}
		lockIconSvg() {
			return '<svg xmlns="http://www.w3.org/2000/svg" class="prevue--secure-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" /></svg>';
		}
		closeIconSvg() {
			return '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>';
		}
		chevronLeftIconSvg() {
			return '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>';
		}
		switchSidesIconSvg() {
			return '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>';
		}
		cogIconSvg() {
			return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" /></svg>';
		}
		/**
		 * Simple debugging tool for measuring times.
		 */ ts(e = "") {
			this.prevTs
				? console.log(new Date().getTime() - this.prevTs + "ms", e)
				: (console.log("-------------- started debugging --------------"), console.log(e)),
				(this.prevTs = new Date().getTime());
		}
		isFramed() {
			try {
				return window.self !== window.top;
			} catch (e) {
				return !1;
			}
		}
		initInsideIframe() {
			location.ancestorOrigins[0].startsWith("chrome-extension://") &&
				(this.bg({ action: "reportingIframeUrl", url: location.href }),
				this.restyleEmbeddedSitesScrollbars(),
				this.passthroughEscapeKeyPressEvent());
		}
		passthroughEscapeKeyPressEvent() {
			document.addEventListener("keyup", (e) => {
				"Escape" === e.key && this.bg({ action: "pressedEscape" });
			});
		}
		restyleEmbeddedSitesScrollbars() {
			var e = document.createElement("style");
			(e.innerHTML = `
              html::-webkit-scrollbar,
              body::-webkit-scrollbar { background: transparent !important; width: 6px !important; height: 6px !important; }
              html::-webkit-scrollbar-track,
              body::-webkit-scrollbar-track { background-color: transparent !important; }
              html::-webkit-scrollbar-thumb,
              body::-webkit-scrollbar-thumb { background: #444 !important; transition: all .2s !important; border-radius: 0 !important; }
              html::-webkit-scrollbar-thumb:hover,
              body::-webkit-scrollbar-thumb:hover { background: #222 !important; }
              @media (prefers-color-scheme: dark) {
                  html::-webkit-scrollbar-thumb,
                  body::-webkit-scrollbar-thumb { background: #aaa !important; transition: all .2s !important; }
                  html::-webkit-scrollbar-thumb:hover,
                  body::-webkit-scrollbar-thumb:hover { background: #ddd !important; }
              }
          `),
				document.body.appendChild(e);
		}
		listenForBackgroundMessages() {
			chrome.runtime.onMessage.addListener(
				(e, i, t) => (
					"reportingIframeUrl" === e.action && this.url !== e.url
						? ((this.url = e.url), this.setTitle())
						: "pressedEscape" === e.action && this.close(),
					t(),
					!0
				)
			);
		}
		listen(e, i, t) {
			e.map((e) => e.addEventListener(i, (e) => this.isContextInvalidated() || t(e), !1));
		}
		listenTo(e, i) {
			this.listen([document.body], e, i);
		}
		/**
		 * The chrome.* API calls fail when the extension gets updated or reloaded,
		 * which basically translates to the fact that this specific
		 * content script injection is not usable anymore.
		 * So I'm invalidating its event listeners.
		 *
		 * Note that a subsequent content injection will typically take place
		 * when this happens, which basically "replaces" this one.
		 * This check was added because they're actually
		 * being executed in parallel.
		 */ isContextInvalidated() {
			if (this.contextInvalidated) return !0;
			try {
				return chrome.runtime.getURL("/"), !1;
			} catch (e) {
				return (this.contextInvalidated = !0);
			}
		}
	}),
	(window.App = new Prevue()),
	App.isFramed() ? App.initInsideIframe() : App.init());
