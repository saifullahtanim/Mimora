(function () {
    'use strict';

    const page = document.querySelector('.hashgen-page');
    if (!page) return;

    const $ = (id) => document.getElementById(id);
    const modeTabs = page.querySelectorAll('.hashgen-mode-tab');
    const inputWraps = page.querySelectorAll('.hashgen-input-wrap');
    const textArea = $('hashgenText');
    const textMeta = $('hashgenTextMeta');
    const clearBtn = $('hashgenClearBtn');
    const fileInput = $('hashgenFile');
    const dropZone = $('hashgenDrop');
    const fileMeta = $('hashgenFileMeta');
    const upperCk = $('hashgenUppercase');
    const base64Ck = $('hashgenBase64');
    const copyAllBtn = $('hashgenCopyAllBtn');
    const downloadBtn = $('hashgenDownloadBtn');
    const toastHost = $('hashgenToastContainer');

    const ALGOS = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'];
    const ALGO_LABELS = { md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };
    const SUBTLE_NAMES = { sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };

    let mode = 'text';
    let currentBuffer = new Uint8Array(0);   // bytes to hash
    let currentHashes = {};                  // algo -> Uint8Array
    let computeToken = 0;                    // cancels stale async work

    /* ──────────────────────────────────────────
       MD5 (RFC 1321) — compact implementation
       Input:  Uint8Array
       Output: Uint8Array (16 bytes)
       ────────────────────────────────────────── */

    function md5Bytes(bytes) {
        const n = bytes.length;
        // pad to 64-byte blocks with 1-bit, zeros, and 8-byte length
        const bitLen = n * 8;
        const padLen = (n + 8) % 64;
        const pad = padLen < 56 ? 56 - padLen : 120 - padLen;
        const total = n + pad + 8;
        const msg = new Uint8Array(total);
        msg.set(bytes);
        msg[n] = 0x80;
        // little-endian 64-bit length
        const loLen = bitLen >>> 0;
        const hiLen = Math.floor(bitLen / 0x100000000) >>> 0;
        msg[total - 8] = loLen & 0xff;
        msg[total - 7] = (loLen >>> 8) & 0xff;
        msg[total - 6] = (loLen >>> 16) & 0xff;
        msg[total - 5] = (loLen >>> 24) & 0xff;
        msg[total - 4] = hiLen & 0xff;
        msg[total - 3] = (hiLen >>> 8) & 0xff;
        msg[total - 2] = (hiLen >>> 16) & 0xff;
        msg[total - 1] = (hiLen >>> 24) & 0xff;

        const K = [
            0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
            0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
            0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
            0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
            0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
            0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
            0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
            0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
        ];
        const S = [
            7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
            5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
            4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
            6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
        ];

        let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

        const M = new Uint32Array(16);

        for (let chunk = 0; chunk < total; chunk += 64) {
            for (let i = 0; i < 16; i++) {
                const j = chunk + i * 4;
                M[i] = (msg[j]) | (msg[j + 1] << 8) | (msg[j + 2] << 16) | (msg[j + 3] << 24);
            }
            let A = a0, B = b0, C = c0, D = d0;
            for (let i = 0; i < 64; i++) {
                let F, g;
                if (i < 16)      { F = (B & C) | (~B & D);       g = i; }
                else if (i < 32) { F = (D & B) | (~D & C);       g = (5 * i + 1) % 16; }
                else if (i < 48) { F = B ^ C ^ D;                g = (3 * i + 5) % 16; }
                else             { F = C ^ (B | ~D);             g = (7 * i) % 16; }
                F = (F + A + K[i] + M[g]) >>> 0;
                A = D;
                D = C;
                C = B;
                const s = S[i];
                B = (B + (((F << s) | (F >>> (32 - s))) >>> 0)) >>> 0;
            }
            a0 = (a0 + A) >>> 0;
            b0 = (b0 + B) >>> 0;
            c0 = (c0 + C) >>> 0;
            d0 = (d0 + D) >>> 0;
        }

        const out = new Uint8Array(16);
        [a0, b0, c0, d0].forEach((v, i) => {
            out[i * 4]     = v & 0xff;
            out[i * 4 + 1] = (v >>> 8) & 0xff;
            out[i * 4 + 2] = (v >>> 16) & 0xff;
            out[i * 4 + 3] = (v >>> 24) & 0xff;
        });
        return out;
    }

    /* ──────────────────────────────────────────
       Formatters
       ────────────────────────────────────────── */

    const HEX = [];
    for (let i = 0; i < 256; i++) HEX.push((i + 0x100).toString(16).slice(1));

    function toHex(bytes) {
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += HEX[bytes[i]];
        return s;
    }

    function toBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function formatBytes(bytes) {
        if (!bytes) return '';
        if (base64Ck.checked) return toBase64(bytes);
        const hex = toHex(bytes);
        return upperCk.checked ? hex.toUpperCase() : hex;
    }

    /* ──────────────────────────────────────────
       Compute all 5 hashes
       ────────────────────────────────────────── */

    async function computeAll(bytes) {
        const token = ++computeToken;
        currentBuffer = bytes;

        const out = {};
        out.md5 = md5Bytes(bytes);

        if (window.crypto && window.crypto.subtle) {
            const subtlePromises = ['sha1', 'sha256', 'sha384', 'sha512'].map(async (algo) => {
                const digest = await crypto.subtle.digest(SUBTLE_NAMES[algo], bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
                return [algo, new Uint8Array(digest)];
            });
            const results = await Promise.all(subtlePromises);
            if (token !== computeToken) return;
            results.forEach(([algo, arr]) => { out[algo] = arr; });
        } else {
            ['sha1', 'sha256', 'sha384', 'sha512'].forEach((a) => { out[a] = null; });
        }

        if (token !== computeToken) return;
        currentHashes = out;
        render();
    }

    function render() {
        ALGOS.forEach((algo) => {
            const row = page.querySelector(`.hashgen-item[data-algo="${algo}"]`);
            if (!row) return;
            const textEl = row.querySelector('[data-role="hash"]');
            const copyBtn = row.querySelector('[data-role="copy"]');
            const bytes = currentHashes[algo];
            const formatted = bytes ? formatBytes(bytes) : '';
            textEl.textContent = formatted;
            copyBtn.disabled = !formatted;
        });
    }

    /* ──────────────────────────────────────────
       Mode switching
       ────────────────────────────────────────── */

    function setMode(next) {
        if (mode === next) return;
        mode = next;
        modeTabs.forEach((t) => {
            const active = t.dataset.mode === next;
            t.classList.toggle('is-active', active);
            t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        inputWraps.forEach((w) => {
            w.style.display = (w.dataset.mode === next) ? '' : 'none';
        });
        if (next === 'text') {
            const bytes = new TextEncoder().encode(textArea.value);
            computeAll(bytes);
        } else {
            if (fileInput.files && fileInput.files[0]) {
                loadFile(fileInput.files[0]);
            } else {
                computeAll(new Uint8Array(0));
            }
        }
    }

    modeTabs.forEach((t) => {
        t.addEventListener('click', () => setMode(t.dataset.mode));
    });

    /* ──────────────────────────────────────────
       Text input
       ────────────────────────────────────────── */

    function onTextInput() {
        const s = textArea.value;
        textMeta.textContent = s.length.toLocaleString() + ' character' + (s.length === 1 ? '' : 's');
        const bytes = new TextEncoder().encode(s);
        computeAll(bytes);
    }
    textArea.addEventListener('input', onTextInput);

    clearBtn.addEventListener('click', () => {
        textArea.value = '';
        onTextInput();
        textArea.focus();
    });

    /* ──────────────────────────────────────────
       File input
       ────────────────────────────────────────── */

    function formatSize(n) {
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
        return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    function loadFile(file) {
        fileMeta.textContent = file.name + ' · ' + formatSize(file.size);
        const reader = new FileReader();
        reader.onload = () => {
            const bytes = new Uint8Array(reader.result);
            computeAll(bytes);
        };
        reader.onerror = () => {
            toast('Could not read file');
        };
        reader.readAsArrayBuffer(file);
    }

    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
    });

    ['dragenter', 'dragover'].forEach((ev) => {
        dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('is-dragover');
        });
    });
    ['dragleave', 'drop'].forEach((ev) => {
        dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('is-dragover');
        });
    });
    dropZone.addEventListener('drop', (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) {
            fileInput.files = e.dataTransfer.files;
            loadFile(f);
        }
    });

    /* ──────────────────────────────────────────
       Format toggles re-render
       ────────────────────────────────────────── */

    [upperCk, base64Ck].forEach((c) => c.addEventListener('change', render));

    /* ──────────────────────────────────────────
       Copy / Download
       ────────────────────────────────────────── */

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        }
        fallbackCopy(text);
        return Promise.resolve();
    }

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
    }

    page.querySelectorAll('.hashgen-item').forEach((row) => {
        const algo = row.dataset.algo;
        const btn = row.querySelector('[data-role="copy"]');
        btn.addEventListener('click', () => {
            const bytes = currentHashes[algo];
            if (!bytes) return;
            const text = formatBytes(bytes);
            copyText(text).then(() => {
                btn.textContent = 'Copied';
                btn.classList.add('is-copied');
                setTimeout(() => {
                    btn.textContent = 'Copy';
                    btn.classList.remove('is-copied');
                }, 1200);
            });
        });
    });

    copyAllBtn.addEventListener('click', () => {
        const lines = ALGOS
            .filter((a) => currentHashes[a])
            .map((a) => ALGO_LABELS[a] + ': ' + formatBytes(currentHashes[a]));
        if (!lines.length) return;
        copyText(lines.join('\n')).then(() => toast('Copied all hashes'));
    });

    downloadBtn.addEventListener('click', () => {
        const lines = ALGOS
            .filter((a) => currentHashes[a])
            .map((a) => ALGO_LABELS[a] + ': ' + formatBytes(currentHashes[a]));
        if (!lines.length) return;
        const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hashes.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    /* ──────────────────────────────────────────
       Toast + FAQ
       ────────────────────────────────────────── */

    function toast(msg) {
        if (!toastHost) return;
        const el = document.createElement('div');
        el.className = 'hashgen-toast';
        el.textContent = msg;
        toastHost.appendChild(el);
        setTimeout(() => {
            el.classList.add('hashgen-toast-out');
            setTimeout(() => el.remove(), 300);
        }, 1600);
    }

    document.querySelectorAll('.hashgen-faq-item').forEach((item) => {
        const btn = item.querySelector('.hashgen-faq-question');
        if (!btn) return;
        btn.addEventListener('click', () => {
            item.classList.add('hashgen-faq-touched');
            item.classList.toggle('hashgen-faq-open');
        });
    });

    /* Initial compute (empty input still yields valid hashes) */
    onTextInput();
})();
