(function () {
    'use strict';

    const page = document.querySelector('.jwtdc-page');
    if (!page) return;

    const $ = (id) => document.getElementById(id);
    const input = $('jwtdcInput');
    const sampleBtn = $('jwtdcSampleBtn');
    const clearBtn = $('jwtdcClearBtn');
    const status = $('jwtdcStatus');
    const statusText = status.querySelector('.jwtdc-status-text');
    const highlight = $('jwtdcHighlight');
    const claimsBlock = $('jwtdcClaims');
    const claimsList = $('jwtdcClaimsList');
    const toastHost = $('jwtdcToastContainer');
    const panels = {
        header:    page.querySelector('.jwtdc-panel[data-part="header"]'),
        payload:   page.querySelector('.jwtdc-panel[data-part="payload"]'),
        signature: page.querySelector('.jwtdc-panel[data-part="signature"]')
    };

    const SAMPLE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNzEwMDAwMDAwLCJleHAiOjE3NDAwMDAwMDAsImF1ZCI6ImFwaS5leGFtcGxlLmNvbSIsImlzcyI6ImF1dGguZXhhbXBsZS5jb20ifQ.5J4Z5b2tKYH-rM8m3YZoL3CkZq7fUpN0eMG5rTrJHu0';

    const CLAIM_META = {
        iss: { name: 'Issuer' },
        sub: { name: 'Subject' },
        aud: { name: 'Audience' },
        exp: { name: 'Expires' },
        nbf: { name: 'Not before' },
        iat: { name: 'Issued at' },
        jti: { name: 'JWT ID' }
    };

    /* ──────────────────────────────────────────
       Base64URL decoding
       ────────────────────────────────────────── */

    function base64urlToBinary(str) {
        let s = str.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        return atob(s);
    }

    function base64urlToText(str) {
        const bin = base64urlToBinary(str);
        try {
            return decodeURIComponent(Array.prototype.map.call(bin, (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        } catch (e) {
            return bin;
        }
    }

    /* ──────────────────────────────────────────
       JSON pretty-printer with syntax highlighting
       ────────────────────────────────────────── */

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function highlightJson(raw) {
        const obj = JSON.parse(raw);
        const pretty = JSON.stringify(obj, null, 2);
        return escapeHtml(pretty).replace(
            /(&quot;[^&]*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/g,
            (match, str, colon, bool, num) => {
                if (str) {
                    if (colon) return '<span class="jsk">' + str + '</span>' + colon;
                    return '<span class="jss">' + str + '</span>';
                }
                if (bool) return '<span class="jsb">' + bool + '</span>';
                if (num) return '<span class="jsn">' + num + '</span>';
                return match;
            }
        );
    }

    /* ──────────────────────────────────────────
       Claims interpretation
       ────────────────────────────────────────── */

    function formatEpoch(ts) {
        const d = new Date(ts * 1000);
        if (isNaN(d.getTime())) return String(ts);
        return d.toISOString().replace('.000Z', 'Z');
    }

    function relativeFrom(ts) {
        const nowMs = Date.now();
        const diff = ts * 1000 - nowMs;
        const abs = Math.abs(diff);
        const future = diff > 0;
        const steps = [
            ['year',   365 * 24 * 3600 * 1000],
            ['month',  30  * 24 * 3600 * 1000],
            ['day',          24 * 3600 * 1000],
            ['hour',              3600 * 1000],
            ['minute',              60 * 1000],
            ['second',                   1000]
        ];
        for (const [label, ms] of steps) {
            if (abs >= ms) {
                const n = Math.round(abs / ms);
                const plural = n === 1 ? '' : 's';
                return future ? ('in ' + n + ' ' + label + plural) : (n + ' ' + label + plural + ' ago');
            }
        }
        return future ? 'in a moment' : 'just now';
    }

    function renderClaims(payload) {
        claimsList.innerHTML = '';
        const keys = Object.keys(CLAIM_META).filter((k) => payload[k] !== undefined);
        if (!keys.length) {
            claimsBlock.style.display = 'none';
            return 'valid';
        }
        claimsBlock.style.display = '';

        let overall = 'valid';
        const nowSec = Math.floor(Date.now() / 1000);

        keys.forEach((k) => {
            const meta = CLAIM_META[k];
            const row = document.createElement('div');
            row.className = 'jwtdc-claim';

            const keyEl = document.createElement('span');
            keyEl.className = 'jwtdc-claim-key';
            keyEl.textContent = k;

            const nameEl = document.createElement('span');
            nameEl.className = 'jwtdc-claim-name';
            nameEl.textContent = meta.name;

            const valEl = document.createElement('span');
            valEl.className = 'jwtdc-claim-value';

            const raw = payload[k];

            if (k === 'exp' || k === 'nbf' || k === 'iat') {
                if (typeof raw === 'number') {
                    valEl.textContent = formatEpoch(raw) + ' (' + relativeFrom(raw) + ')';
                    if (k === 'exp' && raw <= nowSec) {
                        const badge = document.createElement('span');
                        badge.className = 'claim-badge expired';
                        badge.textContent = 'Expired';
                        valEl.appendChild(badge);
                        overall = 'expired';
                    } else if (k === 'exp') {
                        const badge = document.createElement('span');
                        badge.className = 'claim-badge ok';
                        badge.textContent = 'Valid';
                        valEl.appendChild(badge);
                    } else if (k === 'nbf' && raw > nowSec) {
                        const badge = document.createElement('span');
                        badge.className = 'claim-badge pending';
                        badge.textContent = 'Not yet valid';
                        valEl.appendChild(badge);
                        if (overall !== 'expired') overall = 'pending';
                    }
                } else {
                    valEl.textContent = String(raw);
                }
            } else {
                valEl.textContent = typeof raw === 'string' ? raw : JSON.stringify(raw);
            }

            row.appendChild(keyEl);
            row.appendChild(nameEl);
            row.appendChild(valEl);
            claimsList.appendChild(row);
        });

        return overall;
    }

    /* ──────────────────────────────────────────
       State setters
       ────────────────────────────────────────── */

    function setStatus(state, text) {
        status.dataset.state = state;
        statusText.textContent = text;
    }

    function clearPanels() {
        Object.keys(panels).forEach((k) => {
            const body = panels[k].querySelector('[data-role="body"]');
            const btn = panels[k].querySelector('[data-role="copy"]');
            body.textContent = '';
            btn.disabled = true;
            btn.dataset.copy = '';
        });
        claimsBlock.style.display = 'none';
        claimsList.innerHTML = '';
        highlight.classList.remove('is-visible');
        highlight.innerHTML = '';
    }

    function renderHighlight(raw) {
        const parts = raw.split('.');
        const classes = ['hl-header', 'hl-payload', 'hl-signature'];
        let html = '';
        parts.forEach((p, i) => {
            if (i > 0) html += '<span class="hl-dot">.</span>';
            html += '<span class="' + (classes[i] || '') + '">' + escapeHtml(p) + '</span>';
        });
        highlight.innerHTML = html;
        highlight.classList.add('is-visible');
    }

    function decode(raw) {
        const trimmed = raw.trim();
        if (!trimmed) {
            clearPanels();
            setStatus('empty', 'Paste a JWT to begin');
            return;
        }

        const parts = trimmed.split('.');
        if (parts.length !== 3) {
            clearPanels();
            renderHighlight(trimmed);
            setStatus('invalid', 'Invalid JWT — a signed JWT must have 3 dot-separated parts (found ' + parts.length + ')');
            return;
        }

        renderHighlight(trimmed);

        let headerJson, payloadJson;
        try {
            headerJson = base64urlToText(parts[0]);
            JSON.parse(headerJson);
        } catch (e) {
            clearPanels();
            renderHighlight(trimmed);
            setStatus('invalid', 'Invalid JWT — header is not valid base64url-encoded JSON');
            return;
        }

        try {
            payloadJson = base64urlToText(parts[1]);
            JSON.parse(payloadJson);
        } catch (e) {
            clearPanels();
            renderHighlight(trimmed);
            setStatus('invalid', 'Invalid JWT — payload is not valid base64url-encoded JSON');
            return;
        }

        // Render header
        const headerBody = panels.header.querySelector('[data-role="body"]');
        const headerCopy = panels.header.querySelector('[data-role="copy"]');
        headerBody.innerHTML = highlightJson(headerJson);
        headerCopy.dataset.copy = JSON.stringify(JSON.parse(headerJson), null, 2);
        headerCopy.disabled = false;

        // Render payload
        const payloadBody = panels.payload.querySelector('[data-role="body"]');
        const payloadCopy = panels.payload.querySelector('[data-role="copy"]');
        payloadBody.innerHTML = highlightJson(payloadJson);
        payloadCopy.dataset.copy = JSON.stringify(JSON.parse(payloadJson), null, 2);
        payloadCopy.disabled = false;

        // Claims
        const overall = renderClaims(JSON.parse(payloadJson));

        // Render signature
        const sigBody = panels.signature.querySelector('[data-role="body"]');
        const sigCopy = panels.signature.querySelector('[data-role="copy"]');
        sigBody.textContent = parts[2] || '(empty)';
        sigCopy.dataset.copy = parts[2];
        sigCopy.disabled = !parts[2];

        if (overall === 'expired')      setStatus('expired', 'Valid structure — token is expired');
        else if (overall === 'pending') setStatus('expired', 'Valid structure — token is not yet valid (nbf in future)');
        else                            setStatus('valid', 'Valid structure — token is well-formed');
    }

    /* ──────────────────────────────────────────
       Events
       ────────────────────────────────────────── */

    input.addEventListener('input', () => decode(input.value));

    sampleBtn.addEventListener('click', () => {
        input.value = SAMPLE_TOKEN;
        decode(input.value);
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        decode('');
        input.focus();
    });

    /* Copy buttons */

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

    page.querySelectorAll('.jwtdc-copy').forEach((btn) => {
        btn.addEventListener('click', () => {
            const text = btn.dataset.copy;
            if (!text) return;
            copyText(text).then(() => {
                const prev = btn.textContent;
                btn.textContent = 'Copied';
                btn.classList.add('is-copied');
                setTimeout(() => {
                    btn.textContent = prev;
                    btn.classList.remove('is-copied');
                }, 1200);
            });
        });
    });

    /* Toast + FAQ */

    function toast(msg) {
        if (!toastHost) return;
        const el = document.createElement('div');
        el.className = 'jwtdc-toast';
        el.textContent = msg;
        toastHost.appendChild(el);
        setTimeout(() => {
            el.classList.add('jwtdc-toast-out');
            setTimeout(() => el.remove(), 300);
        }, 1600);
    }

    document.querySelectorAll('.jwtdc-faq-item').forEach((item) => {
        const btn = item.querySelector('.jwtdc-faq-question');
        if (!btn) return;
        btn.addEventListener('click', () => {
            item.classList.add('jwtdc-faq-touched');
            item.classList.toggle('jwtdc-faq-open');
        });
    });

    /* Initial */
    decode('');
})();
