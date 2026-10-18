(function () {
    'use strict';

    const page = document.querySelector('.colorcv-page');
    if (!page) return;

    const $ = (id) => document.getElementById(id);
    const swatch = $('colorcvSwatch');
    const nativePicker = $('colorcvNativePicker');
    const freeInput = $('colorcvInput');
    const grid = $('colorcvOutputGrid');
    const toastHost = $('colorcvToastContainer');
    const sliders = page.querySelectorAll('.colorcv-slider');
    const numInputs = page.querySelectorAll('.colorcv-num');

    /* ──────────────────────────────────────────
       Canonical state: { r, g, b, a }
       r,g,b: 0-255 integer; a: 0-1 float
       ────────────────────────────────────────── */

    const state = { r: 14, g: 165, b: 233, a: 1 };

    /* ──────────────────────────────────────────
       Conversions
       ────────────────────────────────────────── */

    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

    function rgbToHex(r, g, b) {
        const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
        return '#' + h(r) + h(g) + h(b);
    }

    function rgbToHexA(r, g, b, a) {
        const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
        const alpha = clamp(Math.round(a * 255), 0, 255).toString(16).padStart(2, '0');
        return '#' + h(r) + h(g) + h(b) + alpha;
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        let h, s;
        if (max === min) {
            h = 0; s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
                case g: h = ((b - r) / d + 2); break;
                default: h = ((r - g) / d + 4);
            }
            h *= 60;
        }
        return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360;
        s /= 100; l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        let r, g, b;
        if (h < 60)      { r = c; g = x; b = 0; }
        else if (h < 120){ r = x; g = c; b = 0; }
        else if (h < 180){ r = 0; g = c; b = x; }
        else if (h < 240){ r = 0; g = x; b = c; }
        else if (h < 300){ r = x; g = 0; b = c; }
        else             { r = c; g = 0; b = x; }
        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    }

    /* ──────────────────────────────────────────
       Parsing (accepts hex, rgb(), rgba(), hsl(), hsla(), named colors)
       ────────────────────────────────────────── */

    function parseColor(str) {
        if (!str) return null;
        const s = str.trim().toLowerCase();

        // #rgb / #rgba / #rrggbb / #rrggbbaa
        let m = s.match(/^#([0-9a-f]{3,8})$/);
        if (m) {
            const hex = m[1];
            let r, g, b, a = 1;
            if (hex.length === 3 || hex.length === 4) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
                if (hex.length === 4) a = parseInt(hex[3] + hex[3], 16) / 255;
            } else if (hex.length === 6 || hex.length === 8) {
                r = parseInt(hex.slice(0, 2), 16);
                g = parseInt(hex.slice(2, 4), 16);
                b = parseInt(hex.slice(4, 6), 16);
                if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
            } else {
                return null;
            }
            return { r, g, b, a };
        }

        // rgb(r,g,b) / rgba(r,g,b,a) / rgb(r g b) / rgb(r g b / a)
        m = s.match(/^rgba?\(\s*([-\d.]+%?)[ ,]+([-\d.]+%?)[ ,]+([-\d.]+%?)(?:\s*[ ,/]\s*([-\d.]+%?))?\s*\)$/);
        if (m) {
            const toByte = (v) => {
                if (v.endsWith('%')) return Math.round(parseFloat(v) / 100 * 255);
                return Math.round(parseFloat(v));
            };
            const toAlpha = (v) => {
                if (v.endsWith('%')) return parseFloat(v) / 100;
                return parseFloat(v);
            };
            return {
                r: clamp(toByte(m[1]), 0, 255),
                g: clamp(toByte(m[2]), 0, 255),
                b: clamp(toByte(m[3]), 0, 255),
                a: m[4] != null ? clamp(toAlpha(m[4]), 0, 1) : 1
            };
        }

        // hsl(h,s%,l%) / hsla(h,s%,l%,a) / hsl(h s% l%) / hsl(h s% l% / a)
        m = s.match(/^hsla?\(\s*([-\d.]+)(?:deg)?[ ,]+([-\d.]+)%[ ,]+([-\d.]+)%(?:\s*[ ,/]\s*([-\d.]+%?))?\s*\)$/);
        if (m) {
            const h = parseFloat(m[1]);
            const sat = parseFloat(m[2]);
            const lig = parseFloat(m[3]);
            let a = 1;
            if (m[4] != null) {
                a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
            }
            const rgb = hslToRgb(h, sat, lig);
            return { r: rgb.r, g: rgb.g, b: rgb.b, a: clamp(a, 0, 1) };
        }

        // named colors — use the browser's own parser
        return parseViaBrowser(s);
    }

    const _parseDiv = document.createElement('div');
    _parseDiv.style.display = 'none';
    document.body.appendChild(_parseDiv);

    function parseViaBrowser(s) {
        _parseDiv.style.color = '';
        _parseDiv.style.color = s;
        if (!_parseDiv.style.color) return null;
        const computed = getComputedStyle(_parseDiv).color;
        const m = computed.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\s*\)$/);
        if (!m) return null;
        return {
            r: Math.round(parseFloat(m[1])),
            g: Math.round(parseFloat(m[2])),
            b: Math.round(parseFloat(m[3])),
            a: m[4] != null ? parseFloat(m[4]) : 1
        };
    }

    /* ──────────────────────────────────────────
       Render
       ────────────────────────────────────────── */

    let suppress = false; // avoid feedback loops when UI inputs echo state

    function formatHslString(h, s, l, a, withAlpha) {
        const core = 'hsl' + (withAlpha ? 'a' : '') + '(' + h + ', ' + s + '%, ' + l + '%';
        return withAlpha ? core + ', ' + +a.toFixed(2) + ')' : core + ')';
    }

    function formatRgbString(r, g, b, a, withAlpha) {
        const core = 'rgb' + (withAlpha ? 'a' : '') + '(' + r + ', ' + g + ', ' + b;
        return withAlpha ? core + ', ' + +a.toFixed(2) + ')' : core + ')';
    }

    function render() {
        const { r, g, b, a } = state;
        const hex = rgbToHex(r, g, b);
        const hexa = rgbToHexA(r, g, b, a);
        const hsl = rgbToHsl(r, g, b);

        // CSS variables on the page scope for sliders + swatch
        const cssColor = 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
        page.style.setProperty('--colorcv-current', cssColor);
        page.style.setProperty('--colorcv-hue', hsl.h);
        page.style.setProperty('--colorcv-sat', hsl.s + '%');
        swatch.style.setProperty('--colorcv-current', cssColor);

        // Output values
        const outputs = {
            hex: hex,
            hexa: hexa,
            rgb: formatRgbString(r, g, b, a, false),
            rgba: formatRgbString(r, g, b, a, true),
            hsl: formatHslString(hsl.h, hsl.s, hsl.l, a, false),
            hsla: formatHslString(hsl.h, hsl.s, hsl.l, a, true)
        };
        Object.keys(outputs).forEach((k) => {
            const row = grid.querySelector('.colorcv-output[data-key="' + k + '"]');
            if (!row) return;
            row.querySelector('[data-role="val"]').textContent = outputs[k];
        });

        // Native picker value (hex-only, no alpha)
        if (nativePicker.value.toLowerCase() !== hex) nativePicker.value = hex;

        // Sync sliders & number inputs
        suppress = true;
        page.querySelector('.colorcv-slider[data-channel="r"]').value = r;
        page.querySelector('.colorcv-slider[data-channel="g"]').value = g;
        page.querySelector('.colorcv-slider[data-channel="b"]').value = b;
        page.querySelector('.colorcv-slider[data-channel="h"]').value = hsl.h;
        page.querySelector('.colorcv-slider[data-channel="s"]').value = hsl.s;
        page.querySelector('.colorcv-slider[data-channel="l"]').value = hsl.l;
        page.querySelector('.colorcv-slider[data-channel="a"]').value = a;
        page.querySelector('.colorcv-num[data-channel="r"]').value = r;
        page.querySelector('.colorcv-num[data-channel="g"]').value = g;
        page.querySelector('.colorcv-num[data-channel="b"]').value = b;
        page.querySelector('.colorcv-num[data-channel="h"]').value = hsl.h;
        page.querySelector('.colorcv-num[data-channel="s"]').value = hsl.s;
        page.querySelector('.colorcv-num[data-channel="l"]').value = hsl.l;
        page.querySelector('.colorcv-num[data-channel="a"]').value = a;
        suppress = false;
    }

    function setState(next, syncFreeInput) {
        state.r = clamp(Math.round(next.r), 0, 255);
        state.g = clamp(Math.round(next.g), 0, 255);
        state.b = clamp(Math.round(next.b), 0, 255);
        state.a = clamp(next.a != null ? next.a : 1, 0, 1);
        if (syncFreeInput) {
            freeInput.value = rgbToHex(state.r, state.g, state.b);
            freeInput.classList.remove('is-invalid');
        }
        render();
    }

    /* ──────────────────────────────────────────
       Input handlers
       ────────────────────────────────────────── */

    freeInput.addEventListener('input', () => {
        const raw = freeInput.value;
        if (!raw.trim()) {
            freeInput.classList.remove('is-invalid');
            return;
        }
        const parsed = parseColor(raw);
        if (parsed) {
            freeInput.classList.remove('is-invalid');
            setState(parsed, false);
        } else {
            freeInput.classList.add('is-invalid');
        }
    });

    nativePicker.addEventListener('input', () => {
        const parsed = parseColor(nativePicker.value);
        if (parsed) {
            // Native picker has no alpha — preserve current alpha
            setState({ r: parsed.r, g: parsed.g, b: parsed.b, a: state.a }, true);
        }
    });

    /* Slider + number input handling */

    function channelChanged(channel, value) {
        if (suppress) return;
        value = parseFloat(value);
        if (isNaN(value)) return;

        if (channel === 'r' || channel === 'g' || channel === 'b') {
            const next = { r: state.r, g: state.g, b: state.b, a: state.a };
            next[channel] = clamp(Math.round(value), 0, 255);
            setState(next, true);
            return;
        }

        if (channel === 'a') {
            setState({ r: state.r, g: state.g, b: state.b, a: clamp(value, 0, 1) }, true);
            return;
        }

        if (channel === 'h' || channel === 's' || channel === 'l') {
            const cur = rgbToHsl(state.r, state.g, state.b);
            if (channel === 'h') cur.h = clamp(Math.round(value), 0, 360);
            if (channel === 's') cur.s = clamp(Math.round(value), 0, 100);
            if (channel === 'l') cur.l = clamp(Math.round(value), 0, 100);
            const rgb = hslToRgb(cur.h, cur.s, cur.l);
            setState({ r: rgb.r, g: rgb.g, b: rgb.b, a: state.a }, true);
        }
    }

    sliders.forEach((el) => {
        el.addEventListener('input', () => channelChanged(el.dataset.channel, el.value));
    });
    numInputs.forEach((el) => {
        el.addEventListener('input', () => channelChanged(el.dataset.channel, el.value));
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

    grid.querySelectorAll('.colorcv-output').forEach((row) => {
        const btn = row.querySelector('[data-role="copy"]');
        const val = row.querySelector('[data-role="val"]');
        btn.addEventListener('click', () => {
            const text = val.textContent;
            if (!text || text === '—') return;
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

    /* Toast + FAQ */

    function toast(msg) {
        if (!toastHost) return;
        const el = document.createElement('div');
        el.className = 'colorcv-toast';
        el.textContent = msg;
        toastHost.appendChild(el);
        setTimeout(() => {
            el.classList.add('colorcv-toast-out');
            setTimeout(() => el.remove(), 300);
        }, 1600);
    }

    document.querySelectorAll('.colorcv-faq-item').forEach((item) => {
        const btn = item.querySelector('.colorcv-faq-question');
        if (!btn) return;
        btn.addEventListener('click', () => {
            item.classList.add('colorcv-faq-touched');
            item.classList.toggle('colorcv-faq-open');
        });
    });

    /* Initial render */
    render();
})();
