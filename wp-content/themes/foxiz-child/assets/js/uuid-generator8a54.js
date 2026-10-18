(function () {
    'use strict';

    const page = document.querySelector('.uuidgen-page');
    if (!page) return;

    const $ = (id) => document.getElementById(id);
    const tabs = page.querySelectorAll('.uuidgen-tab');
    const versionDesc = $('uuidgenVersionDesc');
    const countInput = $('uuidgenCount');
    const countMinus = $('uuidgenCountMinus');
    const countPlus = $('uuidgenCountPlus');
    const upperCk = $('uuidgenUppercase');
    const noHyphensCk = $('uuidgenNoHyphens');
    const bracesCk = $('uuidgenBraces');
    const generateBtn = $('uuidgenGenerateBtn');
    const output = $('uuidgenOutput');
    const outputTitle = $('uuidgenOutputTitle');
    const list = $('uuidgenList');
    const copyAllBtn = $('uuidgenCopyAllBtn');
    const downloadBtn = $('uuidgenDownloadBtn');
    const toastHost = $('uuidgenToastContainer');

    let version = 'v4';
    let lastUuids = [];

    const DESCRIPTIONS = {
        v4: 'Random UUID — the most common format, 122 bits of entropy.',
        v7: 'Time-ordered UUID (RFC 9562). Sorts chronologically — best for new database primary keys.',
        v1: 'Timestamp + random node. Legacy format, kept for compatibility.',
        nil: 'The all-zero UUID — placeholder / "not set" sentinel.'
    };

    /* ──────────────────────────────────────────
       UUID generators
       ────────────────────────────────────────── */

    const HEX = [];
    for (let i = 0; i < 256; i++) HEX.push((i + 0x100).toString(16).slice(1));

    function bytesToFormatted(b) {
        return (
            HEX[b[0]] + HEX[b[1]] + HEX[b[2]] + HEX[b[3]] + '-' +
            HEX[b[4]] + HEX[b[5]] + '-' +
            HEX[b[6]] + HEX[b[7]] + '-' +
            HEX[b[8]] + HEX[b[9]] + '-' +
            HEX[b[10]] + HEX[b[11]] + HEX[b[12]] + HEX[b[13]] + HEX[b[14]] + HEX[b[15]]
        );
    }

    function v4() {
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40; // version 4
        b[8] = (b[8] & 0x3f) | 0x80; // variant 10
        return bytesToFormatted(b);
    }

    function v7() {
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        const ts = Date.now();
        // 48-bit unix timestamp (ms), big-endian in bytes 0-5
        b[0] = Math.floor(ts / 2 ** 40) & 0xff;
        b[1] = Math.floor(ts / 2 ** 32) & 0xff;
        b[2] = Math.floor(ts / 2 ** 24) & 0xff;
        b[3] = Math.floor(ts / 2 ** 16) & 0xff;
        b[4] = Math.floor(ts / 2 ** 8) & 0xff;
        b[5] = ts & 0xff;
        b[6] = (b[6] & 0x0f) | 0x70; // version 7
        b[8] = (b[8] & 0x3f) | 0x80; // variant 10
        return bytesToFormatted(b);
    }

    function v1() {
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        // 60-bit timestamp = 100-ns intervals since 1582-10-15
        const UUID_EPOCH_MS = 12219292800000n; // ms between 1582-10-15 and 1970-01-01
        const ticks = (BigInt(Date.now()) + UUID_EPOCH_MS) * 10000n;
        const tLow = Number(ticks & 0xffffffffn);
        const tMid = Number((ticks >> 32n) & 0xffffn);
        const tHi = Number((ticks >> 48n) & 0x0fffn);
        b[0] = (tLow >>> 24) & 0xff;
        b[1] = (tLow >>> 16) & 0xff;
        b[2] = (tLow >>> 8) & 0xff;
        b[3] = tLow & 0xff;
        b[4] = (tMid >>> 8) & 0xff;
        b[5] = tMid & 0xff;
        b[6] = ((tHi >>> 8) & 0x0f) | 0x10; // version 1
        b[7] = tHi & 0xff;
        b[8] = (b[8] & 0x3f) | 0x80; // variant 10
        // b[9]..b[15] stay random; set multicast bit on the "node" per RFC for random node
        b[10] |= 0x01;
        return bytesToFormatted(b);
    }

    function nilUuid() {
        return '00000000-0000-0000-0000-000000000000';
    }

    function make() {
        if (version === 'v4') return v4();
        if (version === 'v7') return v7();
        if (version === 'v1') return v1();
        return nilUuid();
    }

    function applyFormat(u) {
        let out = u;
        if (upperCk.checked) out = out.toUpperCase();
        if (noHyphensCk.checked) out = out.replace(/-/g, '');
        if (bracesCk.checked) out = '{' + out + '}';
        return out;
    }

    /* ──────────────────────────────────────────
       Rendering
       ────────────────────────────────────────── */

    function generate() {
        let count = parseInt(countInput.value, 10);
        if (isNaN(count) || count < 1) count = 1;
        if (count > 100) count = 100;
        countInput.value = count;

        const uuids = [];
        for (let i = 0; i < count; i++) uuids.push(applyFormat(make()));
        lastUuids = uuids;

        list.innerHTML = '';
        uuids.forEach((u, i) => {
            const row = document.createElement('div');
            row.className = 'uuidgen-item';

            const num = document.createElement('span');
            num.className = 'uuidgen-item-num';
            num.textContent = String(i + 1).padStart(2, '0');

            const text = document.createElement('span');
            text.className = 'uuidgen-item-text';
            text.textContent = u;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'uuidgen-item-copy';
            btn.textContent = 'Copy';
            btn.addEventListener('click', () => {
                copyText(u).then(() => {
                    btn.textContent = 'Copied';
                    btn.classList.add('is-copied');
                    setTimeout(() => {
                        btn.textContent = 'Copy';
                        btn.classList.remove('is-copied');
                    }, 1200);
                });
            });

            row.appendChild(num);
            row.appendChild(text);
            row.appendChild(btn);
            list.appendChild(row);
        });

        outputTitle.textContent = count + ' UUID' + (count === 1 ? '' : 's') + ' generated';
        output.style.display = '';
    }

    /* ──────────────────────────────────────────
       Utilities
       ────────────────────────────────────────── */

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(() => {
                fallbackCopy(text);
            });
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

    function toast(msg) {
        if (!toastHost) return;
        const el = document.createElement('div');
        el.className = 'uuidgen-toast';
        el.textContent = msg;
        toastHost.appendChild(el);
        setTimeout(() => {
            el.classList.add('uuidgen-toast-out');
            setTimeout(() => el.remove(), 300);
        }, 1600);
    }

    /* ──────────────────────────────────────────
       Event wiring
       ────────────────────────────────────────── */

    tabs.forEach((t) => {
        t.addEventListener('click', () => {
            tabs.forEach((x) => {
                x.classList.remove('is-active');
                x.setAttribute('aria-selected', 'false');
            });
            t.classList.add('is-active');
            t.setAttribute('aria-selected', 'true');
            version = t.dataset.version;
            versionDesc.textContent = DESCRIPTIONS[version] || '';
            generate();
        });
    });

    countMinus.addEventListener('click', () => {
        const v = Math.max(1, (parseInt(countInput.value, 10) || 1) - 1);
        countInput.value = v;
    });
    countPlus.addEventListener('click', () => {
        const v = Math.min(100, (parseInt(countInput.value, 10) || 1) + 1);
        countInput.value = v;
    });
    countInput.addEventListener('change', () => {
        let v = parseInt(countInput.value, 10);
        if (isNaN(v) || v < 1) v = 1;
        if (v > 100) v = 100;
        countInput.value = v;
    });

    [upperCk, noHyphensCk, bracesCk].forEach((c) => {
        c.addEventListener('change', () => {
            if (lastUuids.length > 0) generate();
        });
    });

    generateBtn.addEventListener('click', generate);

    copyAllBtn.addEventListener('click', () => {
        if (!lastUuids.length) return;
        copyText(lastUuids.join('\n')).then(() => toast('Copied ' + lastUuids.length + ' UUID' + (lastUuids.length === 1 ? '' : 's')));
    });

    downloadBtn.addEventListener('click', () => {
        if (!lastUuids.length) return;
        const blob = new Blob([lastUuids.join('\n') + '\n'], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'uuids.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    /* FAQ accordion */
    document.querySelectorAll('.uuidgen-faq-item').forEach((item) => {
        const btn = item.querySelector('.uuidgen-faq-question');
        if (!btn) return;
        btn.addEventListener('click', () => {
            item.classList.add('uuidgen-faq-touched');
            item.classList.toggle('uuidgen-faq-open');
        });
    });

    /* Initial generation */
    generate();
})();
