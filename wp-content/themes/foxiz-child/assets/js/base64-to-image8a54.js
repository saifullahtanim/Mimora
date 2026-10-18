(function () {
    'use strict';

    const page = document.querySelector('.b2i-page');
    if (!page) return;

    const input = document.getElementById('b2iInput');
    const statusEl = document.getElementById('b2iStatus');
    const statusText = statusEl ? statusEl.querySelector('.b2i-status-text') : null;
    const resultEl = document.getElementById('b2iResult');
    const previewImg = document.getElementById('b2iPreview');
    const metaMime = document.getElementById('b2iMetaMime');
    const metaDims = document.getElementById('b2iMetaDims');
    const metaSize = document.getElementById('b2iMetaSize');
    const metaLen = document.getElementById('b2iMetaLen');
    const downloadBtn = document.getElementById('b2iDownloadBtn');
    const downloadLabel = document.getElementById('b2iDownloadLabel');
    const copyDataUriBtn = document.getElementById('b2iCopyDataUriBtn');
    const pasteBtn = document.getElementById('b2iPasteBtn');
    const sampleBtn = document.getElementById('b2iSampleBtn');
    const clearBtn = document.getElementById('b2iClearBtn');
    const toastContainer = document.getElementById('b2iToastContainer');

    if (!input || !statusEl || !resultEl) return;

    const DEBOUNCE_MS = 200;
    const SAMPLE_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAABF0lEQVR4nO2YwQ7DIAxDkfb//9wdkSpVQGIcCNJ8ldKQkBSnpQ/HcRzHcdaglhI2K+EXqLTWuvbdzYGZYjHnCWBlYmYJYP/9mwOzxGLOEsDqxMwSwM7EzBLAzsTMEsDuxMwSwM7EzBLA7sTMEsDOxMwSwO7EzBLAzsTMEoB1YmYJwDoxswRgnZhZAphpYmYJYHViZgmgWyZ27HsDMxJzcMb7AphZAtidmFkC2JmYWQLYmZhZAtidmFkC2JmYWQLYnZhZAtiZmFkC2J2YWQLYmZhZAtidmFkCmJmYWQKYaWJmCWB1YmYJYHViZglgZmJmCWBmYmYJYGZiZgnAOjGzBGCdmFkCsE7MLAFYJ2aWAKwTM0sA1omZJYBfaQAY2eW16r0xQQAAAABJRU5ErkJggg==';

    let currentResult = null;
    let debounceTimer = null;

    /* -------------------------------------------- Lifecycle */

    function setStatus(state, message) {
        if (!statusEl) return;
        statusEl.setAttribute('data-state', state);
        if (statusText) statusText.innerHTML = message;
    }

    function showResult(result) {
        currentResult = result;
        previewImg.src = result.objectUrl;
        metaMime.textContent = result.mime;
        metaDims.textContent = (result.width && result.height) ? (result.width + ' × ' + result.height) : '—';
        metaSize.textContent = formatBytes(result.bytes.length);
        metaLen.textContent = result.normalizedLength.toLocaleString() + ' chars';
        downloadLabel.textContent = 'Download as ' + extensionFor(result.mime).toUpperCase();
        resultEl.hidden = false;
        setStatus('ok', 'Decoded successfully — ' + prettyFormat(result.mime) + ', ' + formatBytes(result.bytes.length) + '.');
    }

    function clearResult() {
        if (currentResult && currentResult.objectUrl) {
            URL.revokeObjectURL(currentResult.objectUrl);
        }
        currentResult = null;
        resultEl.hidden = true;
        previewImg.removeAttribute('src');
    }

    function clearAll() {
        input.value = '';
        clearResult();
        setStatus('empty', 'Paste a Base64 string to begin');
    }

    /* -------------------------------------------- Decode pipeline */

    function scheduleDecode() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runDecode, DEBOUNCE_MS);
    }

    async function runDecode() {
        const raw = input.value;
        if (!raw || !raw.trim()) {
            clearResult();
            setStatus('empty', 'Paste a Base64 string to begin');
            return;
        }

        try {
            const result = await decode(raw);
            // revoke previous
            if (currentResult && currentResult.objectUrl && currentResult.objectUrl !== result.objectUrl) {
                URL.revokeObjectURL(currentResult.objectUrl);
            }
            showResult(result);
        } catch (err) {
            clearResult();
            setStatus('error', err && err.userMessage ? err.userMessage : (err && err.message ? err.message : 'Decode failed'));
        }
    }

    function normalize(raw) {
        let s = String(raw).trim();
        s = s.replace(/^data:[^;,]*(;[^,]*)?,/i, '');
        s = s.replace(/\s+/g, '');
        s = s.replace(/-/g, '+').replace(/_/g, '/');
        const padNeeded = (4 - (s.length % 4)) % 4;
        if (padNeeded > 0 && padNeeded < 4) s += '='.repeat(padNeeded);
        return s;
    }

    async function decode(raw) {
        const cleaned = normalize(raw);
        if (!cleaned) {
            const err = new Error('empty');
            err.userMessage = 'Paste a Base64 string to begin';
            throw err;
        }
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
            const err = new Error('invalid charset');
            err.userMessage = "That doesn't look like valid Base64. Check for stray characters or paste again.";
            throw err;
        }

        let binStr;
        try {
            binStr = atob(cleaned);
        } catch (e) {
            const err = new Error('atob failed');
            err.userMessage = "Couldn't decode that Base64 string — it may be truncated or contain invalid characters.";
            throw err;
        }

        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

        const mime = sniffMime(bytes, cleaned);
        if (!mime) {
            const err = new Error('not an image');
            err.userMessage = 'Decoded successfully, but the result isn\'t a recognized image format. For non-image Base64 data, try the <a href="../../base64-decode/index.html">Base64 Decoder</a> instead.';
            throw err;
        }

        const blob = new Blob([bytes], { type: mime });
        const objectUrl = URL.createObjectURL(blob);

        let width = 0;
        let height = 0;
        try {
            const dims = await getImageDimensions(objectUrl);
            width = dims.w;
            height = dims.h;
        } catch (e) {
            // dims optional — SVG without intrinsic size, or unrenderable buffer
        }

        return {
            bytes: bytes,
            blob: blob,
            objectUrl: objectUrl,
            mime: mime,
            width: width,
            height: height,
            normalizedLength: cleaned.length,
        };
    }

    /* -------------------------------------------- Magic-byte sniffing */

    function sniffMime(bytes, cleanedBase64) {
        if (bytes.length < 4) return null;

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
            bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
            return 'image/png';
        }
        // JPEG: FF D8 FF
        if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
            return 'image/jpeg';
        }
        // GIF: 47 49 46 38
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
            return 'image/gif';
        }
        // BMP: 42 4D
        if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
            return 'image/bmp';
        }
        // WebP: RIFF....WEBP
        if (bytes.length >= 12 &&
            bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
            bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
            return 'image/webp';
        }
        // ICO: 00 00 01 00
        if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) {
            return 'image/x-icon';
        }
        // SVG: text-based — try UTF-8 decode of the first 256 bytes and look for <svg or <?xml
        try {
            const sample = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 512)));
            if (/^\s*(<\?xml|<!DOCTYPE\s+svg|<svg\b)/i.test(sample)) {
                return 'image/svg+xml';
            }
        } catch (e) {
            // ignore
        }

        return null;
    }

    function getImageDimensions(url) {
        return new Promise(function (resolve, reject) {
            const img = new Image();
            img.onload = function () { resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
            img.onerror = function () { reject(new Error('image load failed')); };
            img.src = url;
        });
    }

    /* -------------------------------------------- Actions */

    function downloadCurrent() {
        if (!currentResult) return;
        const ext = extensionFor(currentResult.mime);
        const a = document.createElement('a');
        a.href = currentResult.objectUrl;
        a.download = 'decoded.' + ext;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function copyDataUri() {
        if (!currentResult) return;
        const dataUri = 'data:' + currentResult.mime + ';base64,' + bytesToBase64(currentResult.bytes);
        copyText(dataUri, copyDataUriBtn, 'Data URI copied');
    }

    function bytesToBase64(bytes) {
        let bin = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(bin);
    }

    function copyText(text, btn, toastMsg) {
        const finalize = function (ok) {
            if (ok) {
                if (btn) {
                    const label = btn.querySelector('span');
                    const orig = label ? label.textContent : null;
                    btn.setAttribute('data-state', 'copied');
                    if (label) label.textContent = 'Copied';
                    setTimeout(function () {
                        btn.removeAttribute('data-state');
                        if (label && orig !== null) label.textContent = orig;
                    }, 1400);
                }
                showToast(toastMsg || 'Copied to clipboard');
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
        t.className = 'b2i-toast';
        t.textContent = msg;
        toastContainer.appendChild(t);
        setTimeout(function () {
            t.style.opacity = '0';
            t.style.transition = 'opacity 200ms ease';
            setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 240);
        }, 1700);
    }

    /* -------------------------------------------- Helpers */

    function extensionFor(mime) {
        const map = {
            'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
            'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
            'image/x-icon': 'ico',
        };
        return map[mime] || 'bin';
    }

    function prettyFormat(mime) {
        const map = {
            'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/gif': 'GIF',
            'image/webp': 'WebP', 'image/bmp': 'BMP', 'image/svg+xml': 'SVG',
            'image/x-icon': 'ICO',
        };
        return map[mime] || mime;
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1) + ' MB';
    }

    /* -------------------------------------------- FAQ accordion */

    document.querySelectorAll('.b2i-faq-question').forEach(function (btn) {
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

    /* -------------------------------------------- Wire up */

    input.addEventListener('input', scheduleDecode);
    input.addEventListener('paste', function () {
        // paste fires before the value updates; queue another decode after the DOM settles
        setTimeout(scheduleDecode, 0);
    });

    if (downloadBtn) downloadBtn.addEventListener('click', downloadCurrent);
    if (copyDataUriBtn) copyDataUriBtn.addEventListener('click', copyDataUri);
    if (clearBtn) clearBtn.addEventListener('click', clearAll);

    if (sampleBtn) sampleBtn.addEventListener('click', function () {
        input.value = SAMPLE_DATA_URI;
        scheduleDecode();
    });

    if (pasteBtn) pasteBtn.addEventListener('click', async function () {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
            showToast('Clipboard read not supported — paste with Ctrl/⌘+V');
            input.focus();
            return;
        }
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                showToast('Clipboard is empty');
                return;
            }
            input.value = text;
            scheduleDecode();
        } catch (e) {
            showToast('Could not read clipboard — paste with Ctrl/⌘+V');
            input.focus();
        }
    });

    /* -------------------------------------------- Cleanup */

    window.addEventListener('beforeunload', function () {
        if (currentResult && currentResult.objectUrl) {
            URL.revokeObjectURL(currentResult.objectUrl);
        }
    });

})();
