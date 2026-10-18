(function () {
	'use strict';

	// ---------------------------------------------------------------
	// URL parsing
	// ---------------------------------------------------------------

	/**
	 * Extract an 11-character YouTube video ID from any common URL form
	 * or a raw ID. Returns the ID string, or null if nothing matched.
	 */
	function extractVideoId(input) {
		if (typeof input !== 'string') return null;
		var s = input.trim();
		if (!s) return null;

		// Raw 11-char ID
		if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;

		// URL forms — accept with or without protocol/www/m subdomain
		var re = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/|v\/))([A-Za-z0-9_-]{11})/;
		var m = s.match(re);
		return m ? m[1] : null;
	}

	// ---------------------------------------------------------------
	// Inline contract tests (run once at load, removable for prod)
	// ---------------------------------------------------------------

	(function runContractTests() {
		var cases = [
			['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
			['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
			['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
			['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
			['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
			['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
			['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
			['https://www.youtube.com/watch?list=PLxxx&v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
			['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
			['  dQw4w9WgXcQ  ', 'dQw4w9WgXcQ'],
			['', null],
			['not a url', null],
			['https://vimeo.com/123456', null],
			['https://www.youtube.com/watch?v=tooShort', null]
		];
		var failed = 0;
		cases.forEach(function (c) {
			var got = extractVideoId(c[0]);
			if (got !== c[1]) {
				console.error('[ytg] extractVideoId failed:', JSON.stringify(c[0]), 'expected', c[1], 'got', got);
				failed++;
			}
		});
		if (failed === 0) console.log('[ytg] URL parser contract: OK (' + cases.length + ' cases)');
	})();

	// ---------------------------------------------------------------
	// Thumbnail size catalogue
	// ---------------------------------------------------------------

	var SIZES = [
		{ key: 'maxres',  file: 'maxresdefault.jpg', label: 'Max-Res',  w: 1280, h: 720 },
		{ key: 'sd',      file: 'sddefault.jpg',     label: 'Standard', w: 640,  h: 480 },
		{ key: 'hq',      file: 'hqdefault.jpg',     label: 'High',     w: 480,  h: 360 },
		{ key: 'mq',      file: 'mqdefault.jpg',     label: 'Medium',   w: 320,  h: 180 },
		{ key: 'default', file: 'default.jpg',       label: 'Default',  w: 120,  h: 90  }
	];

	var BASE_URL = 'https://img.youtube.com/vi/';
	var PROBE_TIMEOUT_MS = 8000;

	function thumbUrl(id, file) {
		return BASE_URL + encodeURIComponent(id) + '/' + file;
	}

	/**
	 * Load an image and resolve with { ok, naturalWidth, naturalHeight } or
	 * { ok: false } on error/timeout. "ok" means the image loaded AND is not
	 * YouTube's 120x90 gray placeholder.
	 */
	function probeImage(url) {
		return new Promise(function (resolve) {
			var img = new Image();
			var settled = false;
			var done = function (val) {
				if (settled) return;
				settled = true;
				img.onload = img.onerror = null;
				resolve(val);
			};
			var timer = setTimeout(function () { done({ ok: false }); }, PROBE_TIMEOUT_MS);
			img.onload = function () {
				clearTimeout(timer);
				// Placeholder is exactly 120x90. Any larger image is real.
				// (default.jpg IS 120x90 legitimately — handled by the
				//  caller, which probes sizes with expected width >120
				//  for placeholder detection and accepts default at face value.)
				done({ ok: true, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
			};
			img.onerror = function () {
				clearTimeout(timer);
				done({ ok: false });
			};
			img.src = url;
		});
	}

	/**
	 * Probe one size. Returns { size, url, available, naturalWidth, naturalHeight }.
	 * For sizes whose expected width is >120, naturalWidth===120 means placeholder.
	 * For the `default` size (legitimately 120x90), any successful load counts.
	 */
	function probeSize(id, size) {
		var url = thumbUrl(id, size.file);
		return probeImage(url).then(function (res) {
			if (!res.ok) return { size: size, url: url, available: false };
			var isPlaceholder = (size.w > 120 && res.naturalWidth === 120);
			return {
				size: size,
				url: url,
				available: !isPlaceholder,
				naturalWidth: res.naturalWidth,
				naturalHeight: res.naturalHeight
			};
		});
	}

	// ---------------------------------------------------------------
	// DOM rendering
	// ---------------------------------------------------------------

	function el(tag, attrs, children) {
		var node = document.createElement(tag);
		if (attrs) {
			Object.keys(attrs).forEach(function (k) {
				if (k === 'class') node.className = attrs[k];
				else if (k === 'text') node.textContent = attrs[k];
				else if (k === 'html') node.innerHTML = attrs[k];
				else node.setAttribute(k, attrs[k]);
			});
		}
		if (children) children.forEach(function (c) { if (c) node.appendChild(c); });
		return node;
	}

	function renderResultCard(result, index) {
		var s = result.size;
		var card = el('div', { class: 'ytg-result-card', 'data-quality': s.key });

		var imgWrap = el('div', { class: 'ytg-result-img-wrap' });
		var img = el('img', {
			class: 'ytg-result-img',
			src: result.url,
			alt: 'YouTube thumbnail ' + s.label + ' ' + s.w + 'x' + s.h,
			width: String(s.w),
			height: String(s.h),
			loading: index >= 3 ? 'lazy' : 'eager',
			fetchpriority: index === 0 ? 'high' : 'auto'
		});
		var badge = el('span', { class: 'ytg-result-badge', text: s.label.toUpperCase() + ' ' + s.w + '\xd7' + s.h });
		imgWrap.appendChild(img);
		imgWrap.appendChild(badge);

		var actions = el('div', { class: 'ytg-result-actions' });
		var dlBtn = el('button', { type: 'button', class: 'ytg-btn ytg-btn-primary ytg-btn-sm', 'data-action': 'download', 'data-url': result.url, 'data-key': s.key, text: 'Download JPG' });
		var copyBtn = el('button', { type: 'button', class: 'ytg-btn ytg-btn-secondary ytg-btn-sm', 'data-action': 'copy', 'data-url': result.url, text: 'Copy URL' });
		actions.appendChild(dlBtn);
		actions.appendChild(copyBtn);

		card.appendChild(imgWrap);
		card.appendChild(actions);
		return card;
	}

	// ---------------------------------------------------------------
	// State + DOM refs (set on DOMContentLoaded)
	// ---------------------------------------------------------------

	var refs = {};
	var currentId = null;
	var currentResults = [];   // available probe results for the current ID

	function setStatus(msg, level) {
		if (!refs.status) return;
		refs.status.textContent = msg || '';
		refs.status.className = 'ytg-status' + (msg ? ' is-' + (level || 'info') : '');
	}

	function clearResults() {
		if (refs.results) {
			refs.results.innerHTML = '';
			refs.results.hidden = true;
		}
		if (refs.zipRow) refs.zipRow.hidden = true;
		currentResults = [];
	}

	function runLookup() {
		var raw = refs.input.value;
		var id = extractVideoId(raw);
		if (!id) {
			setStatus('Couldn’t find a YouTube video ID in that input. Double-check it’s a real YouTube link.', 'error');
			clearResults();
			return;
		}
		currentId = id;
		clearResults();
		setStatus('Loading thumbnails…', 'info');

		var probes = SIZES.map(function (size) { return probeSize(id, size); });

		Promise.all(probes).then(function (results) {
			// Guard against a stale lookup landing after a newer one started.
			if (id !== currentId) return;

			var available = results.filter(function (r) { return r.available; });
			currentResults = available;

			if (available.length === 0) {
				setStatus('No thumbnails found for this video. It may be private, deleted, or age-restricted.', 'error');
				return;
			}

			setStatus('', null);
			refs.results.innerHTML = '';
			refs.results.hidden = false;
			available.forEach(function (r, i) {
				refs.results.appendChild(renderResultCard(r, i));
			});

			if (available.length >= 2 && refs.zipRow) {
				refs.zipRow.hidden = false;
			}
		});
	}

	// ---------------------------------------------------------------
	// Toast
	// ---------------------------------------------------------------

	var toastEl = null;
	var toastTimer = null;

	function showToast(msg) {
		if (!toastEl) {
			toastEl = el('div', { class: 'ytg-toast', role: 'status', 'aria-live': 'polite' });
			document.body.appendChild(toastEl);
		}
		toastEl.textContent = msg;
		toastEl.classList.add('is-visible');
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(function () {
			toastEl.classList.remove('is-visible');
		}, 1800);
	}

	// ---------------------------------------------------------------
	// Per-card actions
	// ---------------------------------------------------------------

	function downloadUrl(url, filename) {
		// Fetch as blob so the browser uses our chosen filename (cross-origin
		// <a download> ignores the attribute on YouTube-served images).
		return fetch(url, { mode: 'cors' })
			.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
			.then(function (blob) {
				if (window.saveAs) {
					window.saveAs(blob, filename);
				} else {
					var a = document.createElement('a');
					var objUrl = URL.createObjectURL(blob);
					a.href = objUrl;
					a.download = filename;
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
					setTimeout(function () { URL.revokeObjectURL(objUrl); }, 1000);
				}
			});
	}

	function copyToClipboard(text) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			return navigator.clipboard.writeText(text);
		}
		return new Promise(function (resolve, reject) {
			var ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.left = '-9999px';
			document.body.appendChild(ta);
			ta.select();
			try {
				var ok = document.execCommand('copy');
				document.body.removeChild(ta);
				ok ? resolve() : reject(new Error('copy failed'));
			} catch (e) {
				document.body.removeChild(ta);
				reject(e);
			}
		});
	}

	function handleResultsClick(e) {
		var btn = e.target.closest('button[data-action]');
		if (!btn) return;
		var url = btn.getAttribute('data-url');
		if (!url) return;

		if (btn.getAttribute('data-action') === 'download') {
			var key = btn.getAttribute('data-key') || 'thumbnail';
			var filename = currentId + '-' + key + '.jpg';
			btn.disabled = true;
			downloadUrl(url, filename)
				.catch(function () { showToast('Download failed'); })
				.then(function () { btn.disabled = false; });
		} else if (btn.getAttribute('data-action') === 'copy') {
			copyToClipboard(url)
				.then(function () { showToast('Copied!'); })
				.catch(function () { showToast('Couldn’t copy'); });
		}
	}

	function buildZip() {
		if (!currentResults.length || typeof JSZip === 'undefined') return;
		var zip = new JSZip();
		var origLabel = refs.zipBtn.textContent;
		refs.zipBtn.disabled = true;
		refs.zipBtn.textContent = 'Building ZIP…';

		var fetches = currentResults.map(function (r) {
			return fetch(r.url, { mode: 'cors' })
				.then(function (resp) { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.blob(); })
				.then(function (blob) {
					zip.file(currentId + '-' + r.size.key + '.jpg', blob);
				});
		});

		Promise.all(fetches)
			.then(function () { return zip.generateAsync({ type: 'blob' }); })
			.then(function (zipBlob) {
				if (window.saveAs) {
					window.saveAs(zipBlob, currentId + '-thumbnails.zip');
				}
			})
			.catch(function () { showToast('ZIP build failed'); })
			.then(function () {
				refs.zipBtn.disabled = false;
				refs.zipBtn.textContent = origLabel;
			});
	}

	// ---------------------------------------------------------------
	// Wire up DOM
	// ---------------------------------------------------------------

	function init() {
		refs.input   = document.getElementById('ytgUrlInput');
		refs.getBtn  = document.getElementById('ytgGetBtn');
		refs.status  = document.getElementById('ytgStatus');
		refs.results = document.getElementById('ytgResults');
		refs.zipRow  = document.getElementById('ytgZipRow');
		refs.zipBtn  = document.getElementById('ytgZipBtn');

		if (!refs.input || !refs.getBtn) return; // not on this page

		refs.input.addEventListener('input', function () {
			refs.getBtn.disabled = refs.input.value.trim() === '';
		});

		refs.input.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' && !refs.getBtn.disabled) {
				e.preventDefault();
				runLookup();
			}
		});

		refs.getBtn.addEventListener('click', runLookup);

		if (refs.results) {
			refs.results.addEventListener('click', handleResultsClick);
		}

		if (refs.zipBtn) {
			refs.zipBtn.addEventListener('click', buildZip);
		}

		// FAQ accordion (matches the pattern used across other tool pages)
		document.querySelectorAll('.ytg-faq-item').forEach(function (item) {
			var btn = item.querySelector('.ytg-faq-question');
			if (!btn) return;
			btn.addEventListener('click', function () {
				item.classList.add('ytg-faq-touched');
				item.classList.toggle('ytg-faq-open');
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})();
