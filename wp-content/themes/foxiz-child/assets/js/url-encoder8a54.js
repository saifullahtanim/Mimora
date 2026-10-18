(function () {
    'use strict';

    var page = document.querySelector('.urle-page');
    if (!page) return;

    var mode = page.getAttribute('data-mode') || 'encode'; // 'encode' | 'decode'

    /* ── DOM refs ── */
    var input       = document.getElementById('urleInput');
    var output      = document.getElementById('urleOutput');
    var inputCount  = document.getElementById('urleInputCount');
    var outputCount = document.getElementById('urleOutputCount');
    var pasteBtn    = document.getElementById('urlePasteBtn');
    var clearBtn    = document.getElementById('urleClearBtn');
    var copyBtn     = document.getElementById('urleCopyBtn');
    var downloadBtn = document.getElementById('urleDownloadBtn');
    var actionBtn   = document.getElementById('urleEncodeBtn');
    var liveCheck   = document.getElementById('urleLive');
    var modeHint    = document.getElementById('urleModeHint');
    var toastCont   = document.getElementById('urleToastContainer');
    var faqList     = document.getElementById('urleFaqList');

    var statInput     = document.getElementById('urleStatInput');
    var statOutput    = document.getElementById('urleStatOutput');
    var statEncoded   = document.getElementById('urleStatEncoded');
    var statExpansion = document.getElementById('urleStatExpansion');

    /* ── Helpers ── */
    function fmt(n) {
        return n.toLocaleString();
    }

    function getMode() {
        var radio = document.querySelector('input[name="urleMode"]:checked');
        return radio ? radio.value : 'component';
    }

    function updateHint(val) {
        if (!modeHint) return;
        if (mode === 'encode') {
            if (val === 'component') {
                modeHint.innerHTML = 'Encodes all special characters including <code>? &amp; = # /</code>';
            } else {
                modeHint.innerHTML = 'Preserves URL structure characters <code>/ ? : @ &amp; = + $ , #</code>';
            }
        } else {
            if (val === 'form') {
                modeHint.innerHTML = 'Decodes percent-encoded sequences &amp; converts <code>+</code> to space (HTML form data)';
            } else {
                modeHint.innerHTML = 'Decodes percent-encoded sequences back to characters';
            }
        }
    }

    function doEncode(text) {
        var m = getMode();
        if (m === 'component') {
            return encodeURIComponent(text);
        } else {
            return encodeURI(text);
        }
    }

    function doDecode(text) {
        var m = getMode();
        if (m === 'form') {
            // Replace + with space before decoding
            text = text.replace(/\+/g, ' ');
        }
        return decodeURIComponent(text);
    }

    function countEncodedSequences(original, encoded) {
        // Count how many characters were changed (encoded)
        var count = 0;
        var i = 0, j = 0;
        while (i < original.length && j < encoded.length) {
            if (encoded[j] === '%') {
                count++;
                j += 3; // skip %XX
                i++;
            } else {
                i++;
                j++;
            }
        }
        return count;
    }

    function countDecodedSequences(encoded) {
        var matches = encoded.match(/%[0-9A-Fa-f]{2}/g);
        return matches ? matches.length : 0;
    }

    function updateStats(inputText, outputText, encodedCount) {
        var inLen  = inputText.length;
        var outLen = outputText.length;

        if (statInput)  statInput.textContent  = fmt(inLen);
        if (statOutput) statOutput.textContent = fmt(outLen);
        if (statEncoded) statEncoded.textContent = fmt(encodedCount);

        if (statExpansion) {
            if (inLen === 0) {
                statExpansion.textContent = '--';
            } else {
                var pct = (((outLen - inLen) / inLen) * 100);
                if (mode === 'encode') {
                    statExpansion.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
                } else {
                    // size reduction
                    var red = (((inLen - outLen) / inLen) * 100);
                    statExpansion.textContent = (red >= 0 ? '-' : '+') + Math.abs(red).toFixed(1) + '%';
                }
            }
        }
    }

    function process() {
        var text = input.value;
        inputCount.textContent = fmt(text.length) + ' character' + (text.length === 1 ? '' : 's');

        if (!text) {
            output.value = '';
            output.classList.remove('urle-error');
            outputCount.textContent = '0 characters';
            updateStats('', '', 0);
            return;
        }

        try {
            var result, encodedCount;
            if (mode === 'encode') {
                result = doEncode(text);
                encodedCount = countEncodedSequences(text, result);
            } else {
                encodedCount = countDecodedSequences(text);
                result = doDecode(text);
            }

            output.value = result;
            output.classList.remove('urle-error');
            outputCount.textContent = fmt(result.length) + ' character' + (result.length === 1 ? '' : 's');
            updateStats(text, result, encodedCount);
        } catch (e) {
            output.value = 'Error: ' + e.message;
            output.classList.add('urle-error');
            outputCount.textContent = '--';
            updateStats(text, '', 0);
        }
    }

    /* ── Input events ── */
    input.addEventListener('input', function () {
        if (liveCheck.checked) process();
        else {
            inputCount.textContent = fmt(input.value.length) + ' characters';
        }
    });

    /* ── Mode change ── */
    document.querySelectorAll('input[name="urleMode"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
            updateHint(this.value);
            if (liveCheck.checked) process();
        });
    });

    /* ── Live toggle ── */
    liveCheck.addEventListener('change', function () {
        if (this.checked) process();
    });

    /* ── Action button ── */
    actionBtn.addEventListener('click', process);

    /* ── Paste ── */
    pasteBtn.addEventListener('click', function () {
        if (!navigator.clipboard) { showToast('Clipboard not available'); return; }
        navigator.clipboard.readText().then(function (text) {
            input.value = text;
            if (liveCheck.checked) process();
            else inputCount.textContent = fmt(text.length) + ' characters';
            showToast('Pasted from clipboard');
        }).catch(function () {
            showToast('Clipboard access denied');
        });
    });

    /* ── Clear ── */
    clearBtn.addEventListener('click', function () {
        input.value = '';
        output.value = '';
        output.classList.remove('urle-error');
        inputCount.textContent = '0 characters';
        outputCount.textContent = '0 characters';
        updateStats('', '', 0);
        input.focus();
    });

    /* ── Copy ── */
    copyBtn.addEventListener('click', function () {
        if (!output.value || output.classList.contains('urle-error')) {
            showToast('Nothing to copy');
            return;
        }
        navigator.clipboard.writeText(output.value).then(function () {
            showToast('Copied to clipboard');
        }).catch(function () {
            output.select();
            document.execCommand('copy');
            showToast('Copied to clipboard');
        });
    });

    /* ── Download ── */
    downloadBtn.addEventListener('click', function () {
        if (!output.value || output.classList.contains('urle-error')) {
            showToast('Nothing to download');
            return;
        }
        var blob = new Blob([output.value], { type: 'text/plain' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href     = url;
        a.download = (mode === 'encode' ? 'encoded' : 'decoded') + '-url.txt';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Downloaded');
    });

    /* ── Toast ── */
    function showToast(msg) {
        var t = document.createElement('div');
        t.className   = 'urle-toast';
        t.textContent = msg;
        toastCont.appendChild(t);
        setTimeout(function () {
            t.classList.add('urle-toast-out');
            setTimeout(function () { t.remove(); }, 300);
        }, 2000);
    }

    /* ── FAQ accordion ── */
    if (faqList) {
        faqList.querySelectorAll('.urle-faq-question').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = this.closest('.urle-faq-item');
                item.classList.add('urle-faq-touched');
                item.classList.toggle('urle-faq-open');
            });
        });
    }

    /* ── Init ── */
    updateHint(getMode());

})();
