(function () {
    'use strict';

    const page = document.querySelector('.tscv-page');
    if (!page) return;

    const $ = (id) => document.getElementById(id);

    const nowEl = $('tscvNow');
    const nowCopy = $('tscvNowCopy');
    const tsInput = $('tscvTsInput');
    const useNowBtn = $('tscvUseNow');
    const dateInput = $('tscvDateInput');
    const dateNowBtn = $('tscvDateNow');
    const tzNameEl = $('tscvTzName');
    const unixOut = $('tscvUnixOut');
    const dateOut = $('tscvDateOut');
    const toastHost = $('tscvToastContainer');
    const unitTabs = page.querySelectorAll('.tscv-unit');
    const tzTabs = page.querySelectorAll('.tscv-tz');

    let unit = 'auto';    // auto | s | ms
    let tz = 'local';      // local | utc

    const LOCAL_TZ = (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'; }
        catch (e) { return 'Local'; }
    })();
    tzNameEl.textContent = LOCAL_TZ;

    /* ──────────────────────────────────────────
       Live "now" ticker
       ────────────────────────────────────────── */

    function tickNow() {
        const s = Math.floor(Date.now() / 1000);
        nowEl.textContent = s;
    }
    tickNow();
    setInterval(tickNow, 1000);

    /* ──────────────────────────────────────────
       Formatters
       ────────────────────────────────────────── */

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const pad = (n, w = 2) => String(n).padStart(w, '0');

    function toISO(d) {
        return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
            'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) +
            '.' + pad(d.getUTCMilliseconds(), 3) + 'Z';
    }

    function toUTCHuman(d) {
        return DAYS[d.getUTCDay()] + ', ' + pad(d.getUTCDate()) + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() +
            ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + ' UTC';
    }

    function toLocalHuman(d) {
        try {
            return new Intl.DateTimeFormat(undefined, {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZoneName: 'short'
            }).format(d);
        } catch (e) {
            return d.toString();
        }
    }

    function toRelative(d) {
        const diffMs = d.getTime() - Date.now();
        const absMs = Math.abs(diffMs);
        const future = diffMs > 0;
        const units = [
            ['year',   365 * 24 * 3600 * 1000],
            ['month',  30  * 24 * 3600 * 1000],
            ['day',          24 * 3600 * 1000],
            ['hour',              3600 * 1000],
            ['minute',              60 * 1000],
            ['second',                   1000]
        ];
        for (const [label, ms] of units) {
            if (absMs >= ms) {
                const n = Math.round(absMs / ms);
                const plural = n === 1 ? '' : 's';
                return future ? ('in ' + n + ' ' + label + plural) : (n + ' ' + label + plural + ' ago');
            }
        }
        return 'just now';
    }

    /* ──────────────────────────────────────────
       Unix → Human
       ────────────────────────────────────────── */

    function detectUnit(raw) {
        if (unit === 's') return 's';
        if (unit === 'ms') return 'ms';
        // auto: 13 digits or more → ms; else s
        const digits = raw.replace(/-/g, '').length;
        return digits >= 13 ? 'ms' : 's';
    }

    function parseTs(raw) {
        raw = raw.trim();
        if (!raw) return null;
        if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
        const detected = detectUnit(raw);
        const n = Number(raw);
        if (!isFinite(n)) return null;
        const ms = detected === 's' ? n * 1000 : n;
        const d = new Date(ms);
        if (isNaN(d.getTime())) return null;
        return d;
    }

    function renderUnixOut(d) {
        const rows = unixOut.querySelectorAll('.tscv-output-row');
        rows.forEach((row) => {
            const key = row.dataset.key;
            const val = row.querySelector('[data-role="val"]');
            const btn = row.querySelector('[data-role="copy"]');
            let text = '';
            if (d) {
                if (key === 'iso') text = toISO(d);
                else if (key === 'utc') text = toUTCHuman(d);
                else if (key === 'local') text = toLocalHuman(d);
                else if (key === 'relative') text = toRelative(d);
            }
            val.textContent = text;
            btn.disabled = !text;
        });
    }

    function onTsInput() {
        const raw = tsInput.value;
        const d = parseTs(raw);
        tsInput.classList.toggle('is-invalid', raw.trim() !== '' && !d);
        renderUnixOut(d);
    }
    tsInput.addEventListener('input', onTsInput);

    unitTabs.forEach((t) => {
        t.addEventListener('click', () => {
            unitTabs.forEach((x) => {
                x.classList.remove('is-active');
                x.setAttribute('aria-selected', 'false');
            });
            t.classList.add('is-active');
            t.setAttribute('aria-selected', 'true');
            unit = t.dataset.unit;
            onTsInput();
        });
    });

    useNowBtn.addEventListener('click', () => {
        tsInput.value = unit === 'ms' ? Date.now() : Math.floor(Date.now() / 1000);
        onTsInput();
    });

    /* ──────────────────────────────────────────
       Human → Unix (flatpickr)
       ────────────────────────────────────────── */

    function partsToDate(parts, tzMode) {
        const { y, mo, da, h, mi, s } = parts;
        if (tzMode === 'utc') {
            return new Date(Date.UTC(y, mo, da, h, mi, s, 0));
        }
        return new Date(y, mo, da, h, mi, s, 0);
    }

    function datePartsFromFlatpickr(d) {
        // flatpickr gives a local-clock Date — we read its fields back as "wall clock" parts,
        // independent of timezone interpretation.
        return {
            y: d.getFullYear(),
            mo: d.getMonth(),
            da: d.getDate(),
            h: d.getHours(),
            mi: d.getMinutes(),
            s: d.getSeconds()
        };
    }

    function renderDateOut(d) {
        const rows = dateOut.querySelectorAll('.tscv-output-row');
        rows.forEach((row) => {
            const key = row.dataset.key;
            const val = row.querySelector('[data-role="val"]');
            const btn = row.querySelector('[data-role="copy"]');
            let text = '';
            if (d) {
                if (key === 'seconds') text = String(Math.floor(d.getTime() / 1000));
                else if (key === 'millis') text = String(d.getTime());
                else if (key === 'iso') text = toISO(d);
            }
            val.textContent = text;
            btn.disabled = !text;
        });
    }

    let fp = null;
    let fpSelectedParts = null; // { y, mo, da, h, mi, s }

    function recomputeFromParts() {
        if (!fpSelectedParts) {
            renderDateOut(null);
            return;
        }
        renderDateOut(partsToDate(fpSelectedParts, tz));
    }

    if (typeof window.flatpickr === 'function') {
        fp = window.flatpickr(dateInput, {
            enableTime: true,
            enableSeconds: true,
            time_24hr: true,
            dateFormat: 'Y-m-d H:i:S',
            defaultDate: new Date(),
            onReady: (selectedDates) => {
                if (selectedDates && selectedDates[0]) {
                    fpSelectedParts = datePartsFromFlatpickr(selectedDates[0]);
                    recomputeFromParts();
                }
            },
            onChange: (selectedDates) => {
                if (selectedDates && selectedDates[0]) {
                    fpSelectedParts = datePartsFromFlatpickr(selectedDates[0]);
                    recomputeFromParts();
                }
            }
        });
    }

    tzTabs.forEach((t) => {
        t.addEventListener('click', () => {
            tzTabs.forEach((x) => {
                x.classList.remove('is-active');
                x.setAttribute('aria-selected', 'false');
            });
            t.classList.add('is-active');
            t.setAttribute('aria-selected', 'true');
            tz = t.dataset.tz;
            recomputeFromParts();
        });
    });

    function setDateInputToNow() {
        const d = new Date();
        let parts;
        if (tz === 'utc') {
            parts = {
                y: d.getUTCFullYear(),
                mo: d.getUTCMonth(),
                da: d.getUTCDate(),
                h: d.getUTCHours(),
                mi: d.getUTCMinutes(),
                s: d.getUTCSeconds()
            };
        } else {
            parts = {
                y: d.getFullYear(),
                mo: d.getMonth(),
                da: d.getDate(),
                h: d.getHours(),
                mi: d.getMinutes(),
                s: d.getSeconds()
            };
        }
        fpSelectedParts = parts;
        if (fp) {
            // Feed flatpickr a local-time Date matching the desired wall-clock parts
            const localDisplay = new Date(parts.y, parts.mo, parts.da, parts.h, parts.mi, parts.s, 0);
            fp.setDate(localDisplay, false);
        }
        recomputeFromParts();
    }
    dateNowBtn.addEventListener('click', setDateInputToNow);

    /* ──────────────────────────────────────────
       Copy buttons (generic)
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

    page.querySelectorAll('.tscv-output-row').forEach((row) => {
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

    nowCopy.addEventListener('click', () => {
        copyText(nowEl.textContent).then(() => toast('Copied current timestamp'));
    });

    /* ──────────────────────────────────────────
       Toast + FAQ
       ────────────────────────────────────────── */

    function toast(msg) {
        if (!toastHost) return;
        const el = document.createElement('div');
        el.className = 'tscv-toast';
        el.textContent = msg;
        toastHost.appendChild(el);
        setTimeout(() => {
            el.classList.add('tscv-toast-out');
            setTimeout(() => el.remove(), 300);
        }, 1600);
    }

    document.querySelectorAll('.tscv-faq-item').forEach((item) => {
        const btn = item.querySelector('.tscv-faq-question');
        if (!btn) return;
        btn.addEventListener('click', () => {
            item.classList.add('tscv-faq-touched');
            item.classList.toggle('tscv-faq-open');
        });
    });

    /* Initial state: preload Unix panel with "now". Human panel is wired by flatpickr.onReady. */
    tsInput.value = Math.floor(Date.now() / 1000);
    onTsInput();
})();
