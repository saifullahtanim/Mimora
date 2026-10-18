(function () {
    'use strict';

    const page = document.querySelector('.i2b-page');
    if (!page) return;

    const wasmBase = page.getAttribute('data-wasm-base') || '';

    const dropZone = document.getElementById('i2bDropZone');
    const fileInput = document.getElementById('i2bFileInput');
    const pickLink = dropZone ? dropZone.querySelector('.i2b-drop-pick') : null;
    const cardsContainer = document.getElementById('i2bCards');
    const errorEl = document.getElementById('i2bError');
    const actionsEl = document.getElementById('i2bActions');
    const clearAllBtn = document.getElementById('i2bClearAllBtn');
    const toastContainer = document.getElementById('i2bToastContainer');

    if (!dropZone || !fileInput || !cardsContainer) return;

    const ACCEPTED_MIMES = new Set([
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
        'image/gif', 'image/bmp', 'image/svg+xml',
    ]);
    const REENCODABLE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp']);
    const ENCODE_DEBOUNCE_MS = 220;

    const state = new Map();
    let nextId = 1;
    let mozjpegMod = null;
    let webpMod = null;
    let mozjpegLoading = null;
    let webpLoading = null;

    /* -------------------------------------------- File intake */

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.hidden = false;
        clearTimeout(showError._t);
        showError._t = setTimeout(function () { errorEl.hidden = true; }, 4000);
    }

    function clearError() {
        errorEl.hidden = true;
    }

    function handleFiles(fileList) {
        clearError();
        const files = Array.from(fileList || []);
        if (!files.length) return;

        let totalBytes = 0;
        state.forEach(function (entry) { totalBytes += entry.file.size; });

        let acceptedCount = 0;
        let rejectedCount = 0;

        files.forEach(function (file) {
            const mime = (file.type || '').toLowerCase();
            if (!ACCEPTED_MIMES.has(mime)) {
                rejectedCount += 1;
                return;
            }
            totalBytes += file.size;
            addCard(file);
            acceptedCount += 1;
        });

        if (rejectedCount && !acceptedCount) {
            showError('Only image files are supported (JPEG, PNG, WebP, GIF, BMP, SVG).');
        } else if (rejectedCount) {
            showError(rejectedCount + ' non-image file' + (rejectedCount > 1 ? 's were' : ' was') + ' skipped.');
        }

        if (totalBytes > 50 * 1024 * 1024) {
            showError('Heads up: total uploaded size is over 50 MB. Large files may be slow to encode.');
        }

        actionsEl.hidden = state.size === 0;
    }

    /* -------------------------------------------- Card lifecycle */

    function addCard(file) {
        const id = 'i2b-' + (nextId++);
        const url = URL.createObjectURL(file);
        const entry = {
            id: id,
            file: file,
            originalBlob: file,
            originalUrl: url,
            mime: (file.type || 'application/octet-stream').toLowerCase(),
            width: 0,
            height: 0,
            format: 'keep',
            quality: 85,
            outputBlob: file,
            outputBase64: '',
            encodeToken: 0,
            activeTab: 'datauri',
            status: 'idle',
            cachedImageData: null,
        };
        state.set(id, entry);

        const cardEl = renderCard(entry);
        cardsContainer.appendChild(cardEl);

        readImageMeta(entry, cardEl);
        runEncode(id, true);
    }

    function removeCard(id) {
        const entry = state.get(id);
        if (!entry) return;
        if (entry.originalUrl) URL.revokeObjectURL(entry.originalUrl);
        state.delete(id);
        const el = document.getElementById(id);
        if (el) el.remove();
        actionsEl.hidden = state.size === 0;
    }

    function clearAll() {
        const ids = Array.from(state.keys());
        ids.forEach(removeCard);
    }

    function readImageMeta(entry, cardEl) {
        if (entry.mime === 'image/svg+xml') {
            entry.width = 0;
            entry.height = 0;
            updateCardMeta(entry, cardEl);
            return;
        }
        const img = new Image();
        img.onload = function () {
            entry.width = img.naturalWidth;
            entry.height = img.naturalHeight;
            updateCardMeta(entry, cardEl);
        };
        img.onerror = function () {
            updateCardMeta(entry, cardEl);
        };
        img.src = entry.originalUrl;
    }

    /* -------------------------------------------- Render card */

    function renderCard(entry) {
        const wrap = document.createElement('div');
        wrap.className = 'i2b-card';
        wrap.id = entry.id;

        const reencodable = REENCODABLE_MIMES.has(entry.mime);
        const formatNote = reencodable
            ? ''
            : '<p class="i2b-format-note">Re-encoding is unavailable for ' + escapeHtml(prettyFormat(entry.mime)) + ' &mdash; original bytes are preserved.</p>';

        wrap.innerHTML =
            '<div class="i2b-card-head">' +
                '<div class="i2b-thumb"><img src="' + entry.originalUrl + '" alt=""></div>' +
                '<div class="i2b-meta">' +
                    '<p class="i2b-filename" title="' + escapeAttr(entry.file.name) + '">' + escapeHtml(entry.file.name) + '</p>' +
                    '<p class="i2b-meta-row" data-role="dims">' + escapeHtml(prettyFormat(entry.mime)) + '</p>' +
                    '<div class="i2b-size-readout">' +
                        '<span class="i2b-size-original" data-role="orig-size">' + formatBytes(entry.file.size) + '</span>' +
                        '<span class="i2b-size-arrow">&rarr;</span>' +
                        '<span class="i2b-size-output" data-role="out-size">&hellip;</span>' +
                        '<span class="i2b-savings-badge" data-role="savings" data-tier="neutral">&mdash;</span>' +
                    '</div>' +
                    '<p class="i2b-meta-row i2b-base64-len"><strong data-role="b64-len">&hellip;</strong> base64 chars</p>' +
                '</div>' +
                '<button type="button" class="i2b-card-remove" aria-label="Remove this image" data-role="remove">' +
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                '</button>' +
            '</div>' +
            '<div class="i2b-controls">' +
                '<label class="i2b-controls-label" for="' + entry.id + '-fmt">Re-encode</label>' +
                '<select class="i2b-format-select" id="' + entry.id + '-fmt" data-role="format" ' + (reencodable ? '' : 'disabled') + '>' +
                    '<option value="keep">Keep original</option>' +
                    '<option value="jpeg">JPEG (.jpg)</option>' +
                    '<option value="webp">WebP (.webp)</option>' +
                '</select>' +
                '<div class="i2b-quality-row" data-role="quality-row" hidden>' +
                    '<label class="i2b-controls-label" for="' + entry.id + '-q">Quality</label>' +
                    '<input class="i2b-quality-slider" id="' + entry.id + '-q" type="range" min="30" max="100" step="1" value="' + entry.quality + '" data-role="quality">' +
                    '<span class="i2b-quality-value" data-role="quality-value">' + entry.quality + '</span>' +
                '</div>' +
                formatNote +
            '</div>' +
            '<div class="i2b-snippets">' +
                '<div class="i2b-tabs" role="tablist">' +
                    '<button class="i2b-tab is-active" role="tab" data-tab="datauri" aria-selected="true">Data URI</button>' +
                    '<button class="i2b-tab" role="tab" data-tab="raw" aria-selected="false">Raw</button>' +
                    '<button class="i2b-tab" role="tab" data-tab="html" aria-selected="false">HTML</button>' +
                    '<button class="i2b-tab" role="tab" data-tab="css" aria-selected="false">CSS</button>' +
                    '<button class="i2b-tab" role="tab" data-tab="md" aria-selected="false">Markdown</button>' +
                '</div>' +
                '<div class="i2b-snippet-box" data-role="snippet" data-state="encoding">Encoding&hellip;</div>' +
                '<div class="i2b-copy-row">' +
                    '<button type="button" class="i2b-copy-btn" data-role="copy">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                        '<span>Copy</span>' +
                    '</button>' +
                '</div>' +
            '</div>';

        bindCardEvents(entry, wrap);
        return wrap;
    }

    function updateCardMeta(entry, cardEl) {
        const dims = cardEl.querySelector('[data-role="dims"]');
        if (dims) {
            const parts = [];
            if (entry.width && entry.height) parts.push(entry.width + ' &times; ' + entry.height);
            parts.push(escapeHtml(prettyFormat(entry.mime)));
            dims.innerHTML = parts.join(' &middot; ');
        }
    }

    function bindCardEvents(entry, cardEl) {
        const removeBtn = cardEl.querySelector('[data-role="remove"]');
        if (removeBtn) removeBtn.addEventListener('click', function () { removeCard(entry.id); });

        const formatSel = cardEl.querySelector('[data-role="format"]');
        const qualityRow = cardEl.querySelector('[data-role="quality-row"]');
        const qualitySlider = cardEl.querySelector('[data-role="quality"]');
        const qualityValue = cardEl.querySelector('[data-role="quality-value"]');

        if (formatSel) {
            formatSel.addEventListener('change', function () {
                entry.format = formatSel.value;
                qualityRow.hidden = entry.format === 'keep';
                runEncode(entry.id, true);
            });
        }

        if (qualitySlider) {
            qualitySlider.addEventListener('input', function () {
                entry.quality = parseInt(qualitySlider.value, 10);
                qualityValue.textContent = entry.quality;
                debouncedEncode(entry.id);
            });
        }

        cardEl.querySelectorAll('.i2b-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                const which = tab.getAttribute('data-tab');
                setActiveTab(entry, cardEl, which);
            });
            tab.addEventListener('keydown', function (e) {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                e.preventDefault();
                const tabs = Array.from(cardEl.querySelectorAll('.i2b-tab'));
                const idx = tabs.indexOf(tab);
                const nextIdx = e.key === 'ArrowRight'
                    ? (idx + 1) % tabs.length
                    : (idx - 1 + tabs.length) % tabs.length;
                tabs[nextIdx].focus();
                setActiveTab(entry, cardEl, tabs[nextIdx].getAttribute('data-tab'));
            });
        });

        const copyBtn = cardEl.querySelector('[data-role="copy"]');
        if (copyBtn) copyBtn.addEventListener('click', function () { copyCurrent(entry, cardEl); });
    }

    function setActiveTab(entry, cardEl, which) {
        entry.activeTab = which;
        cardEl.querySelectorAll('.i2b-tab').forEach(function (tab) {
            const on = tab.getAttribute('data-tab') === which;
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        renderSnippet(entry, cardEl);
    }

    /* -------------------------------------------- Encoding */

    const encodeTimers = new Map();
    function debouncedEncode(id) {
        if (encodeTimers.has(id)) clearTimeout(encodeTimers.get(id));
        encodeTimers.set(id, setTimeout(function () {
            encodeTimers.delete(id);
            runEncode(id, false);
        }, ENCODE_DEBOUNCE_MS));
    }

    async function runEncode(id, animateOnSettle) {
        const entry = state.get(id);
        if (!entry) return;
        const cardEl = document.getElementById(id);
        if (!cardEl) return;

        const token = ++entry.encodeToken;
        entry.status = 'encoding';
        const snippetBox = cardEl.querySelector('[data-role="snippet"]');
        if (snippetBox) {
            snippetBox.setAttribute('data-state', 'encoding');
            snippetBox.textContent = 'Encoding…';
        }

        try {
            let blob;
            if (entry.format === 'keep' || !REENCODABLE_MIMES.has(entry.mime)) {
                blob = entry.originalBlob;
            } else if (entry.format === 'jpeg') {
                blob = await encodeJpeg(entry, entry.quality);
            } else if (entry.format === 'webp') {
                blob = await encodeWebp(entry, entry.quality);
            } else {
                blob = entry.originalBlob;
            }

            if (token !== entry.encodeToken) return;

            const dataUrl = await blobToDataURL(blob);
            if (token !== entry.encodeToken) return;

            const commaIdx = dataUrl.indexOf(',');
            const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
            entry.outputBlob = blob;
            entry.outputBase64 = base64;
            entry.outputMime = blob.type || entry.mime;
            entry.status = 'idle';

            updateSizeReadout(entry, cardEl, animateOnSettle);
            renderSnippet(entry, cardEl);
        } catch (err) {
            if (token !== entry.encodeToken) return;
            console.error('[i2b] encode failed:', err);
            entry.status = 'error';
            if (snippetBox) {
                snippetBox.setAttribute('data-state', 'error');
                snippetBox.textContent = 'Encoding failed: ' + (err && err.message ? err.message : 'unknown error');
            }
        }
    }

    async function ensureMozjpeg() {
        if (mozjpegMod) return mozjpegMod;
        if (!mozjpegLoading) {
            mozjpegLoading = (async function () {
                const mod = await import(wasmBase + 'jsquash/jpeg/mozjpeg_enc.js');
                const inst = await mod.default();
                mozjpegMod = inst;
                return inst;
            })();
        }
        return mozjpegLoading;
    }

    async function ensureWebp() {
        if (webpMod) return webpMod;
        if (!webpLoading) {
            webpLoading = (async function () {
                const mod = await import(wasmBase + 'jsquash/webp/webp_enc.js');
                const inst = await mod.default();
                webpMod = inst;
                return inst;
            })();
        }
        return webpLoading;
    }

    async function getImageData(entry) {
        if (entry.cachedImageData) return entry.cachedImageData;
        const bitmap = await createImageBitmap(entry.originalBlob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        if (typeof bitmap.close === 'function') bitmap.close();
        entry.cachedImageData = data;
        if (!entry.width) entry.width = data.width;
        if (!entry.height) entry.height = data.height;
        return data;
    }

    async function encodeJpeg(entry, quality) {
        const mj = await ensureMozjpeg();
        const imageData = await getImageData(entry);
        const opts = {
            quality: quality,
            baseline: false,
            arithmetic: false,
            progressive: true,
            optimize_coding: true,
            smoothing: 0,
            color_space: 3,
            quant_table: 3,
            trellis_multipass: false,
            trellis_opt_zero: false,
            trellis_opt_table: false,
            trellis_loops: 1,
            auto_subsample: true,
            chroma_subsample: 2,
            separate_chroma_quality: false,
            chroma_quality: quality,
        };
        const encoded = mj.encode(imageData.data, imageData.width, imageData.height, opts);
        return new Blob([encoded.buffer || encoded], { type: 'image/jpeg' });
    }

    async function encodeWebp(entry, quality) {
        const wp = await ensureWebp();
        const imageData = await getImageData(entry);
        const opts = {
            quality: quality,
            target_size: 0,
            target_PSNR: 0,
            method: 4,
            sns_strength: 50,
            filter_strength: 60,
            filter_sharpness: 0,
            filter_type: 1,
            partitions: 0,
            segments: 4,
            pass: 1,
            show_compressed: 0,
            preprocessing: 0,
            autofilter: 0,
            partition_limit: 0,
            alpha_compression: 1,
            alpha_filtering: 1,
            alpha_quality: 100,
            lossless: 0,
            exact: 0,
            image_hint: 0,
            emulate_jpeg_size: 0,
            thread_level: 0,
            low_memory: 0,
            near_lossless: 100,
            use_delta_palette: 0,
            use_sharp_yuv: 0,
        };
        const encoded = wp.encode(imageData.data, imageData.width, imageData.height, opts);
        return new Blob([encoded.buffer || encoded], { type: 'image/webp' });
    }

    function blobToDataURL(blob) {
        return new Promise(function (resolve, reject) {
            const fr = new FileReader();
            fr.onload = function () { resolve(fr.result); };
            fr.onerror = function () { reject(fr.error || new Error('FileReader failed')); };
            fr.readAsDataURL(blob);
        });
    }

    /* -------------------------------------------- Readouts */

    function updateSizeReadout(entry, cardEl, animate) {
        const origEl = cardEl.querySelector('[data-role="orig-size"]');
        const outEl = cardEl.querySelector('[data-role="out-size"]');
        const badgeEl = cardEl.querySelector('[data-role="savings"]');
        const lenEl = cardEl.querySelector('[data-role="b64-len"]');
        if (origEl) origEl.textContent = formatBytes(entry.file.size);
        if (outEl) outEl.textContent = formatBytes(entry.outputBlob.size);
        if (lenEl) lenEl.textContent = entry.outputBase64.length.toLocaleString();

        if (badgeEl) {
            const orig = entry.file.size;
            const out = entry.outputBlob.size;
            const delta = out - orig;
            const pct = orig > 0 ? (delta / orig) * 100 : 0;
            let label;
            let tier;
            if (entry.format === 'keep') {
                label = 'original';
                tier = 'neutral';
            } else if (delta < 0) {
                label = '−' + Math.round(-pct) + '%';
                if (-pct >= 50) tier = 'great';
                else if (-pct >= 15) tier = 'good';
                else tier = 'neutral';
            } else if (delta > 0) {
                label = '+' + Math.round(pct) + '% larger';
                tier = 'warn';
            } else {
                label = 'no change';
                tier = 'neutral';
            }
            badgeEl.textContent = label;
            badgeEl.setAttribute('data-tier', tier);
            if (animate && (tier === 'great')) {
                badgeEl.classList.remove('is-pulse');
                void badgeEl.offsetWidth;
                badgeEl.classList.add('is-pulse');
            }
        }
    }

    function renderSnippet(entry, cardEl) {
        const box = cardEl.querySelector('[data-role="snippet"]');
        if (!box) return;
        if (!entry.outputBase64) {
            box.setAttribute('data-state', 'encoding');
            box.textContent = 'Encoding…';
            return;
        }
        box.setAttribute('data-state', 'ready');
        box.textContent = buildSnippet(entry);
    }

    function buildSnippet(entry) {
        const mime = entry.outputMime || entry.mime || 'application/octet-stream';
        const b64 = entry.outputBase64;
        const dataUri = 'data:' + mime + ';base64,' + b64;
        const filename = entry.file.name;
        const altText = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        const dims = (entry.width && entry.height) ? ' width="' + entry.width + '" height="' + entry.height + '"' : '';
        switch (entry.activeTab) {
            case 'raw': return b64;
            case 'datauri': return dataUri;
            case 'html': return '<img src="' + dataUri + '" alt="' + altText.replace(/"/g, '&quot;') + '"' + dims + '>';
            case 'css': return 'background-image: url("' + dataUri + '");';
            case 'md': return '![' + altText + '](' + dataUri + ')';
            default: return dataUri;
        }
    }

    function copyCurrent(entry, cardEl) {
        if (!entry.outputBase64) return;
        const text = buildSnippet(entry);
        const btn = cardEl.querySelector('[data-role="copy"]');
        const label = btn ? btn.querySelector('span') : null;
        const finalize = function (ok) {
            if (!btn) return;
            if (ok) {
                btn.setAttribute('data-state', 'copied');
                if (label) label.textContent = 'Copied';
                setTimeout(function () {
                    btn.removeAttribute('data-state');
                    if (label) label.textContent = 'Copy';
                }, 1400);
                showToast('Copied to clipboard');
            } else {
                showToast('Copy failed — select and copy manually');
            }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { finalize(true); }, function () { fallbackCopy(text, finalize); });
        } else {
            fallbackCopy(text, finalize);
        }
    }

    function fallbackCopy(text, done) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            done(ok);
        } catch (e) {
            done(false);
        }
    }

    function showToast(msg) {
        if (!toastContainer) return;
        const t = document.createElement('div');
        t.className = 'i2b-toast';
        t.textContent = msg;
        t.style.pointerEvents = 'auto';
        toastContainer.appendChild(t);
        setTimeout(function () {
            t.style.opacity = '0';
            t.style.transition = 'opacity 200ms ease';
            setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 240);
        }, 1700);
    }

    /* -------------------------------------------- Helpers */

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1) + ' MB';
    }

    function prettyFormat(mime) {
        const map = {
            'image/jpeg': 'JPEG', 'image/jpg': 'JPEG', 'image/png': 'PNG',
            'image/webp': 'WebP', 'image/gif': 'GIF', 'image/bmp': 'BMP',
            'image/svg+xml': 'SVG',
        };
        return map[mime] || mime;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function escapeAttr(s) { return escapeHtml(s); }

    /* -------------------------------------------- FAQ accordion */

    document.querySelectorAll('.i2b-faq-question').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const expanded = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            const ans = btn.nextElementSibling;
            if (!ans) return;
            if (expanded) {
                ans.style.maxHeight = '0';
            } else {
                ans.style.maxHeight = ans.scrollHeight + 'px';
            }
        });
    });

    /* -------------------------------------------- Drop zone events */

    dropZone.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('input')) return;
        fileInput.click();
    });
    dropZone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });
    if (pickLink) {
        pickLink.addEventListener('click', function (e) {
            e.stopPropagation();
            fileInput.click();
        });
    }
    fileInput.addEventListener('change', function () {
        handleFiles(fileInput.files);
        fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (evt) {
        dropZone.addEventListener(evt, function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('is-drag-over');
        });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (evt) {
        dropZone.addEventListener(evt, function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('is-drag-over');
        });
    });
    dropZone.addEventListener('drop', function (e) {
        const dt = e.dataTransfer;
        if (!dt) return;
        handleFiles(dt.files);
    });

    if (clearAllBtn) clearAllBtn.addEventListener('click', clearAll);

    /* -------------------------------------------- Cleanup */

    window.addEventListener('beforeunload', function () {
        state.forEach(function (entry) {
            if (entry.originalUrl) URL.revokeObjectURL(entry.originalUrl);
        });
    });

})();
