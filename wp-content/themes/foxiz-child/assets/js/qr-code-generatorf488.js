/* QR Code Generator
-------------------------------------- */
(function () {
    'use strict';

    if (typeof QRCode === 'undefined') {
        return;
    }

    var $input    = document.getElementById('qrgenInput');
    var $type     = document.getElementById('qrgenType');
    var $typeHint = document.getElementById('qrgenTypeHint');
    var $size     = document.getElementById('qrgenSize');
    var $sizeVal  = document.getElementById('qrgenSizeVal');
    var $fg       = document.getElementById('qrgenFg');
    var $bg       = document.getElementById('qrgenBg');
    var $fgChip   = document.getElementById('qrgenFgChip');
    var $bgChip   = document.getElementById('qrgenBgChip');
    var $fgHex    = document.getElementById('qrgenFgHex');
    var $bgHex    = document.getElementById('qrgenBgHex');
    var $ec       = document.getElementById('qrgenEc');
    var $canvas   = document.getElementById('qrgenCanvas');
    var $caption  = document.getElementById('qrgenPreviewCaption');
    var $dlPng    = document.getElementById('qrgenDownloadPng');
    var $dlSvg    = document.getElementById('qrgenDownloadSvg');
    var $emptyOverlay = document.getElementById('qrgenPreviewEmpty');

    if (!$input || !$canvas) { return; }

    // userOverrodeType: true once the user manually changes the Type dropdown.
    // Cleared whenever the user edits the input (next keystroke re-detects).
    var userOverrodeType = false;

    function detectType(raw) {
        var s = (raw || '').trim();
        if (!s) { return 'text'; }
        if (/^(https?|ftp):\/\//i.test(s)) { return 'url'; }
        if (/^mailto:/i.test(s) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) { return 'email'; }
        if (/^tel:/i.test(s) || /^\+?[\d\s\-()]{6,}$/.test(s)) { return 'phone'; }
        if (/^sms:/i.test(s)) { return 'sms'; }
        return 'text';
    }

    function formatInput(raw, type) {
        var s = (raw || '').trim();
        if (!s) { return ''; }
        switch (type) {
            case 'email':
                return /^mailto:/i.test(s) ? s : 'mailto:' + s;
            case 'phone':
                return /^tel:/i.test(s) ? s : 'tel:' + s.replace(/\s/g, '');
            case 'sms':
                return /^sms:/i.test(s) ? s : 'sms:' + s.replace(/\s/g, '');
            case 'url':
            case 'text':
            default:
                return s;
        }
    }

    function syncColorDisplay() {
        $fgChip.style.background = $fg.value;
        $bgChip.style.background = $bg.value;
        $fgHex.textContent = $fg.value.toLowerCase();
        $bgHex.textContent = $bg.value.toLowerCase();
    }

    function render() {
        var size = parseInt($size.value, 10) || 256;
        var ec   = $ec.value || 'M';

        $sizeVal.textContent = size;
        $caption.textContent = size + ' px · EC level ' + ec;
        $typeHint.textContent = userOverrodeType ? 'manual' : 'auto-detected';

        var resolved = $type.value;
        var payload  = formatInput($input.value, resolved);

        var isEmpty = $input.value.trim() === '';
        var qrPayload = isEmpty
            ? (window.location.origin || 'https://example.com')
            : (payload || ' ');

        if ($emptyOverlay) {
            $emptyOverlay.style.display = isEmpty ? '' : 'none';
        }

        syncColorDisplay();

        QRCode.toCanvas($canvas, qrPayload, {
            width: size,
            margin: 2,
            errorCorrectionLevel: ec,
            color: { dark: $fg.value, light: $bg.value }
        }, function (err) {
            if (err) { console.error('QR render error:', err); }
        });
    }

    function downloadDataUrl(dataUrl, filename) {
        var a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function downloadPng() {
        var payload = formatInput($input.value, $type.value);
        if (!payload) { return; }
        var size = parseInt($size.value, 10) || 256;
        QRCode.toDataURL(payload, {
            width: size,
            margin: 2,
            errorCorrectionLevel: $ec.value,
            color: { dark: $fg.value, light: $bg.value }
        }, function (err, url) {
            if (err) { console.error(err); return; }
            downloadDataUrl(url, 'qr-code.png');
        });
    }

    function downloadSvg() {
        var payload = formatInput($input.value, $type.value);
        if (!payload) { return; }
        QRCode.toString(payload, {
            type: 'svg',
            margin: 2,
            errorCorrectionLevel: $ec.value,
            color: { dark: $fg.value, light: $bg.value }
        }, function (err, svgString) {
            if (err) { console.error(err); return; }
            var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
            downloadDataUrl(url, 'qr-code.svg');
        });
    }

    var debounceTimer = null;
    function debouncedRender() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(render, 150);
    }

    $input.addEventListener('input', function () {
        // Re-detect on every keystroke and reset any prior manual override.
        userOverrodeType = false;
        $type.value = detectType($input.value);
        debouncedRender();
    });

    $type.addEventListener('change', function () {
        userOverrodeType = true;
        render();
    });

    $size.addEventListener('input', debouncedRender);
    $fg.addEventListener('input', debouncedRender);
    $bg.addEventListener('input', debouncedRender);
    $ec.addEventListener('change', render);
    $dlPng.addEventListener('click', downloadPng);
    $dlSvg.addEventListener('click', downloadSvg);

    render();
})();
