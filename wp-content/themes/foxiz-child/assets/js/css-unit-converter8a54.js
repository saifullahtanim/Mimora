(function () {
    'use strict';

    var root = document.querySelector('.cuc-main');
    if (!root) return;

    var baseInput = root.querySelector('#cuc-base');
    var vwInput = root.querySelector('#cuc-vw');
    var vhInput = root.querySelector('#cuc-vh');
    var precisionRange = root.querySelector('#cuc-precision');
    var precisionLabel = root.querySelector('#cuc-precision-value');
    var resetBtn = root.querySelector('#cuc-reset');

    var unitInputs = {
        px: root.querySelector('#cuc-val-px'),
        em: root.querySelector('#cuc-val-em'),
        rem: root.querySelector('#cuc-val-rem'),
        pt: root.querySelector('#cuc-val-pt'),
        percent: root.querySelector('#cuc-val-percent'),
        vh: root.querySelector('#cuc-val-vh'),
        vw: root.querySelector('#cuc-val-vw')
    };

    var DEFAULTS = { base: 16, vw: 1920, vh: 1080, anchorUnit: 'px', anchorValue: 16 };
    var precision = 4;
    var suppressEvent = false;

    function parseNum(value, fallback) {
        if (value === '' || value === null || value === undefined) return fallback;
        var n = parseFloat(String(value).replace(',', '.'));
        return Number.isFinite(n) ? n : fallback;
    }

    function getContext() {
        return {
            base: Math.max(1, parseNum(baseInput.value, DEFAULTS.base)),
            vw: Math.max(1, parseNum(vwInput.value, DEFAULTS.vw)),
            vh: Math.max(1, parseNum(vhInput.value, DEFAULTS.vh))
        };
    }

    // Convert a value in any unit to canonical px
    function toPx(value, unit, ctx) {
        switch (unit) {
            case 'px': return value;
            case 'em': return value * ctx.base;
            case 'rem': return value * ctx.base;
            case 'pt': return value * (96 / 72);
            case 'percent': return value * ctx.base / 100;
            case 'vh': return value * ctx.vh / 100;
            case 'vw': return value * ctx.vw / 100;
        }
        return value;
    }

    // Convert px back to target unit
    function fromPx(px, unit, ctx) {
        switch (unit) {
            case 'px': return px;
            case 'em': return px / ctx.base;
            case 'rem': return px / ctx.base;
            case 'pt': return px * (72 / 96);
            case 'percent': return px * 100 / ctx.base;
            case 'vh': return px * 100 / ctx.vh;
            case 'vw': return px * 100 / ctx.vw;
        }
        return px;
    }

    function formatNum(n) {
        if (!Number.isFinite(n)) return '';
        // Round to precision then trim trailing zeros
        var factor = Math.pow(10, precision);
        var rounded = Math.round(n * factor) / factor;
        if (precision === 0) return String(rounded);
        var str = rounded.toFixed(precision);
        // Strip trailing zeros but keep at least the integer part
        str = str.replace(/\.?0+$/, '');
        return str === '-0' ? '0' : str;
    }

    function recompute(anchorUnit, anchorValue) {
        var ctx = getContext();
        var px = toPx(anchorValue, anchorUnit, ctx);

        suppressEvent = true;
        Object.keys(unitInputs).forEach(function (unit) {
            if (unit === anchorUnit) return;
            var input = unitInputs[unit];
            if (!input) return;
            var converted = fromPx(px, unit, ctx);
            input.value = formatNum(converted);
        });
        suppressEvent = false;
    }

    // Track which unit was last edited so context-changes reuse it
    var lastAnchor = { unit: DEFAULTS.anchorUnit, value: DEFAULTS.anchorValue };

    function onUnitInput(event) {
        if (suppressEvent) return;
        var input = event.target;
        var unit = input.getAttribute('data-unit');
        var raw = input.value.trim();
        if (raw === '') {
            // Clear all other rows
            suppressEvent = true;
            Object.keys(unitInputs).forEach(function (u) {
                if (u !== unit && unitInputs[u]) unitInputs[u].value = '';
            });
            suppressEvent = false;
            lastAnchor = { unit: unit, value: NaN };
            return;
        }
        var value = parseNum(raw, NaN);
        if (!Number.isFinite(value)) return;
        lastAnchor = { unit: unit, value: value };
        recompute(unit, value);
    }

    function onContextChange() {
        if (!Number.isFinite(lastAnchor.value)) return;
        recompute(lastAnchor.unit, lastAnchor.value);
    }

    function onPrecisionChange() {
        precision = parseInt(precisionRange.value, 10);
        precisionLabel.textContent = String(precision);
        if (Number.isFinite(lastAnchor.value)) {
            recompute(lastAnchor.unit, lastAnchor.value);
            // Also reformat the anchor field itself so all 7 rows share the precision
            var anchorInput = unitInputs[lastAnchor.unit];
            if (anchorInput) {
                suppressEvent = true;
                anchorInput.value = formatNum(lastAnchor.value);
                suppressEvent = false;
            }
        }
    }

    function copyToClipboard(text, btn) {
        if (!text) return;
        var done = function () {
            btn.classList.add('is-copied');
            var span = btn.querySelector('.cuc-copy-text');
            var orig = span ? span.textContent : null;
            if (span) span.textContent = 'Copied';
            setTimeout(function () {
                btn.classList.remove('is-copied');
                if (span && orig !== null) span.textContent = orig;
            }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
        } else {
            fallbackCopy(text, done);
        }
    }

    function fallbackCopy(text, done) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); }
        catch (e) { /* noop */ }
        document.body.removeChild(ta);
    }

    function onCopyClick(event) {
        var btn = event.currentTarget;
        var targetId = btn.getAttribute('data-copy-target');
        if (!targetId) return;
        var input = document.getElementById(targetId);
        if (!input || !input.value) return;
        var unit = input.getAttribute('data-unit');
        var suffix = unit === 'percent' ? '%' : unit;
        copyToClipboard(input.value + suffix, btn);
    }

    function onReset() {
        suppressEvent = true;
        baseInput.value = String(DEFAULTS.base);
        vwInput.value = String(DEFAULTS.vw);
        vhInput.value = String(DEFAULTS.vh);
        precisionRange.value = '4';
        precision = 4;
        precisionLabel.textContent = '4';
        unitInputs.px.value = '16';
        suppressEvent = false;
        lastAnchor = { unit: DEFAULTS.anchorUnit, value: DEFAULTS.anchorValue };
        recompute(lastAnchor.unit, lastAnchor.value);
    }

    // Wire up
    Object.keys(unitInputs).forEach(function (unit) {
        var input = unitInputs[unit];
        if (!input) return;
        input.addEventListener('input', onUnitInput);
    });

    baseInput.addEventListener('input', onContextChange);
    vwInput.addEventListener('input', onContextChange);
    vhInput.addEventListener('input', onContextChange);
    precisionRange.addEventListener('input', onPrecisionChange);
    resetBtn.addEventListener('click', onReset);

    root.querySelectorAll('.cuc-copy-btn').forEach(function (btn) {
        btn.addEventListener('click', onCopyClick);
    });

    // Initial render: derive all rows from the px default of 16
    recompute(lastAnchor.unit, lastAnchor.value);
})();
