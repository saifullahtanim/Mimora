(function () {
    'use strict';

    /* ── Page detection ── */

    var pageEl = document.querySelector('.b64-page');
    if (!pageEl) return;

    var MODE = pageEl.getAttribute('data-mode') || 'encode'; // 'encode' or 'decode'

    /* ── Helpers ── */

    var $ = function (sel) { return document.querySelector(sel); };

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    /* ── UTF-8 safe encode/decode ── */

    function utf8Encode(str) {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, p1) {
            return String.fromCharCode(parseInt(p1, 16));
        }));
    }

    function utf8Decode(b64) {
        return decodeURIComponent(Array.prototype.map.call(atob(b64), function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    }

    function toUrlSafe(str) {
        return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function fromUrlSafe(str) {
        var s = str.replace(/-/g, '+').replace(/_/g, '/');
        var pad = s.length % 4;
        if (pad) s += '===='.slice(pad);
        return s;
    }

    /* ── DOM refs — Text tab ── */

    var inputEl       = $('#b64Input');
    var outputEl      = $('#b64Output');
    var inputCount    = $('#b64InputCount');
    var outputCount   = $('#b64OutputCount');
    var pasteBtn      = $('#b64PasteBtn');
    var clearInputBtn = $('#b64ClearInputBtn');
    var copyOutputBtn = $('#b64CopyOutputBtn');
    var dlOutputBtn   = $('#b64DownloadOutputBtn');
    var urlSafeCb     = $('#b64UrlSafe');
    var lineByLineCb  = $('#b64LineByLine');
    var liveCb        = $('#b64Live');
    var liveIndicator = $('#b64LiveIndicator');
    var actionRow     = $('#b64ActionRow');
    var actionBtn     = $('#b64EncodeBtn') || $('#b64DecodeBtn');
    var errorEl       = $('#b64Error');
    var errorTextEl   = $('#b64ErrorText');
    var toastContainer = $('#b64ToastContainer');

    /* ── DOM refs — File tab (Encode page) ── */

    var fileDrop        = $('#b64FileDrop');
    var fileBrowse      = $('#b64FileBrowse');
    var fileInput       = $('#b64FileInput');
    var fileInfo        = $('#b64FileInfo');
    var fileName        = $('#b64FileName');
    var fileSize        = $('#b64FileSize');
    var fileType        = $('#b64FileType');
    var fileRemove      = $('#b64FileRemove');
    var fileOptions     = $('#b64FileOptions');
    var dataUriCb       = $('#b64DataUri');
    var fileOutputWrap  = $('#b64FileOutputWrap');
    var fileOutputEl    = $('#b64FileOutput');
    var fileOutputCount = $('#b64FileOutputCount');
    var copyFileBtn     = $('#b64CopyFileOutputBtn');
    var dlFileBtn       = $('#b64DownloadFileOutputBtn');

    /* ── DOM refs — File tab (Decode page) ── */

    var fileInput64      = $('#b64FileInput64');
    var fileInput64Count = $('#b64FileInput64Count');
    var pasteFileBtn     = $('#b64PasteFileBtn');
    var clearFileBtn     = $('#b64ClearFileInputBtn');
    var decodeFileBtn    = $('#b64DecodeFileBtn');
    var filePreview      = $('#b64FilePreview');
    var filePreviewContent = $('#b64FilePreviewContent');
    var filePreviewMeta  = $('#b64FilePreviewMeta');
    var fileError        = $('#b64FileError');
    var fileErrorText    = $('#b64FileErrorText');

    /* ── State ── */

    var currentFile = null; // For encode file tab

    /* ── Tab switching ── */

    var tabs = document.querySelectorAll('.b64-tab');
    var panels = document.querySelectorAll('.b64-tab-panel');

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var target = this.getAttribute('data-tab');
            tabs.forEach(function (t) {
                t.classList.remove('b64-tab-active');
                t.setAttribute('aria-selected', 'false');
            });
            this.classList.add('b64-tab-active');
            this.setAttribute('aria-selected', 'true');
            panels.forEach(function (p) {
                p.classList.toggle('b64-tab-panel-active', p.getAttribute('data-panel') === target);
            });
        });
    });

    /* ── Toast ── */

    function toast(msg) {
        if (!toastContainer) return;
        var el = document.createElement('div');
        el.className = 'b64-toast';
        el.textContent = msg;
        toastContainer.appendChild(el);
        setTimeout(function () {
            el.classList.add('b64-toast-out');
            el.addEventListener('animationend', function () { el.remove(); });
        }, 3000);
    }

    /* ── Copy helper ── */

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                toast('Copied to clipboard');
            });
        } else {
            // Fallback
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            toast('Copied to clipboard');
        }
    }

    /* ── Download helper ── */

    function downloadText(text, filename) {
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* ── Update char counts ── */

    function updateCounts() {
        if (inputEl && inputCount) {
            var len = inputEl.value.length;
            inputCount.textContent = len + ' character' + (len !== 1 ? 's' : '');
        }
        if (outputEl && outputCount) {
            var len2 = outputEl.value.length;
            outputCount.textContent = len2 + ' character' + (len2 !== 1 ? 's' : '');
        }
    }

    /* ── Show/hide error ── */

    function showError(msg) {
        if (errorEl && errorTextEl) {
            errorTextEl.textContent = msg;
            errorEl.style.display = '';
        }
    }

    function hideError() {
        if (errorEl) errorEl.style.display = 'none';
    }

    /* ══════════════════════════════════════
       TEXT TAB — Encode / Decode
       ══════════════════════════════════════ */

    function processText() {
        if (!inputEl || !outputEl) return;
        hideError();

        var input = inputEl.value;
        if (!input) {
            outputEl.value = '';
            updateCounts();
            return;
        }

        var urlSafe = urlSafeCb ? urlSafeCb.checked : false;
        var lineByLine = lineByLineCb ? lineByLineCb.checked : false;

        try {
            var result;

            if (lineByLine) {
                var lines = input.split('\n');
                var processed = lines.map(function (line) {
                    if (!line) return '';
                    if (MODE === 'encode') {
                        var encoded = utf8Encode(line);
                        return urlSafe ? toUrlSafe(encoded) : encoded;
                    } else {
                        var toDecode = urlSafe ? fromUrlSafe(line.trim()) : line.trim();
                        return utf8Decode(toDecode);
                    }
                });
                result = processed.join('\n');
            } else {
                if (MODE === 'encode') {
                    result = utf8Encode(input);
                    if (urlSafe) result = toUrlSafe(result);
                } else {
                    var toDecode = urlSafe ? fromUrlSafe(input.trim()) : input.trim();
                    result = utf8Decode(toDecode);
                }
            }

            outputEl.value = result;
        } catch (e) {
            outputEl.value = '';
            var errMsg = MODE === 'decode'
                ? 'Invalid Base64 input — check for typos or enable URL-safe mode if needed.'
                : 'Encoding failed — ' + (e.message || 'unknown error');
            showError(errMsg);
        }

        updateCounts();
    }

    /* ── Live mode toggle ── */

    function updateLiveMode() {
        if (!liveCb || !liveIndicator || !actionRow) return;
        var live = liveCb.checked;
        liveIndicator.textContent = live ? 'ON' : 'OFF';
        liveIndicator.classList.toggle('b64-live-indicator-off', !live);
        actionRow.style.display = live ? 'none' : '';
        if (live) processText();
    }

    if (liveCb) {
        liveCb.addEventListener('change', updateLiveMode);
        updateLiveMode();
    }

    /* ── Input events ── */

    if (inputEl) {
        inputEl.addEventListener('input', function () {
            updateCounts();
            if (liveCb && liveCb.checked) processText();
        });
    }

    if (urlSafeCb) {
        urlSafeCb.addEventListener('change', function () {
            if (liveCb && liveCb.checked) processText();
        });
    }

    if (lineByLineCb) {
        lineByLineCb.addEventListener('change', function () {
            if (liveCb && liveCb.checked) processText();
        });
    }

    /* ── Action button ── */

    if (actionBtn) {
        actionBtn.addEventListener('click', processText);
    }

    /* ── Paste button ── */

    if (pasteBtn && inputEl) {
        pasteBtn.addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(function (text) {
                    inputEl.value = text;
                    updateCounts();
                    if (liveCb && liveCb.checked) processText();
                    toast('Pasted from clipboard');
                });
            }
        });
    }

    /* ── Clear button ── */

    if (clearInputBtn && inputEl) {
        clearInputBtn.addEventListener('click', function () {
            inputEl.value = '';
            if (outputEl) outputEl.value = '';
            hideError();
            updateCounts();
        });
    }

    /* ── Copy output ── */

    if (copyOutputBtn && outputEl) {
        copyOutputBtn.addEventListener('click', function () {
            if (outputEl.value) copyText(outputEl.value);
        });
    }

    /* ── Download output ── */

    if (dlOutputBtn && outputEl) {
        dlOutputBtn.addEventListener('click', function () {
            if (outputEl.value) {
                var ext = MODE === 'encode' ? 'base64' : 'txt';
                downloadText(outputEl.value, 'output.' + ext);
            }
        });
    }

    /* ══════════════════════════════════════
       FILE TAB — Encode page (file → base64)
       ══════════════════════════════════════ */

    if (MODE === 'encode' && fileDrop) {

        fileDrop.addEventListener('click', function (e) {
            if (e.target !== fileBrowse && !fileBrowse.contains(e.target)) {
                fileInput.click();
            }
        });

        if (fileBrowse) {
            fileBrowse.addEventListener('click', function (e) {
                e.stopPropagation();
                fileInput.click();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', function () {
                if (this.files.length) handleFile(this.files[0]);
                this.value = '';
            });
        }

        fileDrop.addEventListener('dragover', function (e) {
            e.preventDefault();
            fileDrop.classList.add('b64-dragover');
        });

        fileDrop.addEventListener('dragleave', function () {
            fileDrop.classList.remove('b64-dragover');
        });

        fileDrop.addEventListener('drop', function (e) {
            e.preventDefault();
            fileDrop.classList.remove('b64-dragover');
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });

        function handleFile(file) {
            currentFile = file;

            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = formatSize(file.size);
            if (fileType) fileType.textContent = file.type || 'unknown';
            if (fileInfo) fileInfo.style.display = '';
            if (fileOptions) fileOptions.style.display = '';
            if (fileDrop) fileDrop.style.display = 'none';

            encodeFile(file);
        }

        function encodeFile(file) {
            var reader = new FileReader();
            reader.onload = function () {
                var base64 = reader.result; // data:mime;base64,...
                var includePrefix = dataUriCb ? dataUriCb.checked : true;

                var output;
                if (includePrefix) {
                    output = base64;
                } else {
                    var commaIdx = base64.indexOf(',');
                    output = commaIdx !== -1 ? base64.slice(commaIdx + 1) : base64;
                }

                if (fileOutputEl) fileOutputEl.value = output;
                if (fileOutputWrap) fileOutputWrap.style.display = '';
                if (fileOutputCount) {
                    fileOutputCount.textContent = output.length + ' characters';
                }
            };
            reader.readAsDataURL(file);
        }

        if (dataUriCb) {
            dataUriCb.addEventListener('change', function () {
                if (currentFile) encodeFile(currentFile);
            });
        }

        if (fileRemove) {
            fileRemove.addEventListener('click', function () {
                currentFile = null;
                if (fileInfo) fileInfo.style.display = 'none';
                if (fileOptions) fileOptions.style.display = 'none';
                if (fileOutputWrap) fileOutputWrap.style.display = 'none';
                if (fileOutputEl) fileOutputEl.value = '';
                if (fileDrop) fileDrop.style.display = '';
            });
        }

        if (copyFileBtn && fileOutputEl) {
            copyFileBtn.addEventListener('click', function () {
                if (fileOutputEl.value) copyText(fileOutputEl.value);
            });
        }

        if (dlFileBtn && fileOutputEl) {
            dlFileBtn.addEventListener('click', function () {
                if (fileOutputEl.value) {
                    downloadText(fileOutputEl.value, (currentFile ? currentFile.name : 'file') + '.base64.txt');
                }
            });
        }
    }

    /* ══════════════════════════════════════
       FILE TAB — Decode page (base64 → file)
       ══════════════════════════════════════ */

    if (MODE === 'decode') {

        if (fileInput64) {
            fileInput64.addEventListener('input', function () {
                if (fileInput64Count) {
                    var len = fileInput64.value.length;
                    fileInput64Count.textContent = len + ' character' + (len !== 1 ? 's' : '');
                }
            });
        }

        if (pasteFileBtn && fileInput64) {
            pasteFileBtn.addEventListener('click', function () {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText().then(function (text) {
                        fileInput64.value = text;
                        if (fileInput64Count) {
                            fileInput64Count.textContent = text.length + ' characters';
                        }
                        toast('Pasted from clipboard');
                    });
                }
            });
        }

        if (clearFileBtn && fileInput64) {
            clearFileBtn.addEventListener('click', function () {
                fileInput64.value = '';
                if (fileInput64Count) fileInput64Count.textContent = '0 characters';
                if (filePreview) filePreview.style.display = 'none';
                if (fileError) fileError.style.display = 'none';
            });
        }

        if (decodeFileBtn && fileInput64) {
            decodeFileBtn.addEventListener('click', function () {
                if (fileError) fileError.style.display = 'none';
                if (filePreview) filePreview.style.display = 'none';

                var input = fileInput64.value.trim();
                if (!input) {
                    if (fileError && fileErrorText) {
                        fileErrorText.textContent = 'Please paste a Base64 string to decode.';
                        fileError.style.display = '';
                    }
                    return;
                }

                try {
                    var mime = 'application/octet-stream';
                    var b64Data = input;
                    var ext = 'bin';

                    // Check for data URI prefix
                    var dataUriMatch = input.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
                    if (dataUriMatch) {
                        mime = dataUriMatch[1] || mime;
                        b64Data = dataUriMatch[2];
                    }

                    // Decode
                    var binaryString = atob(b64Data);
                    var bytes = new Uint8Array(binaryString.length);
                    for (var i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    var blob = new Blob([bytes], { type: mime });

                    // Determine extension from MIME
                    var mimeExts = {
                        'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
                        'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp',
                        'application/pdf': 'pdf', 'text/plain': 'txt', 'text/html': 'html',
                        'text/css': 'css', 'text/javascript': 'js', 'application/json': 'json',
                        'application/zip': 'zip', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
                        'video/mp4': 'mp4', 'video/webm': 'webm'
                    };
                    if (mimeExts[mime]) ext = mimeExts[mime];

                    // Show preview for images
                    if (mime.startsWith('image/') && filePreview && filePreviewContent) {
                        var imgUrl = URL.createObjectURL(blob);
                        filePreviewContent.innerHTML = '<img src="' + imgUrl + '" alt="Decoded preview">';
                        if (filePreviewMeta) {
                            filePreviewMeta.textContent = mime + ' — ' + formatSize(blob.size);
                        }
                        filePreview.style.display = '';
                    }

                    // Download
                    downloadBlob(blob, 'decoded-file.' + ext);
                    toast('File decoded and downloaded');

                } catch (e) {
                    if (fileError && fileErrorText) {
                        fileErrorText.textContent = 'Failed to decode — invalid Base64 string. Check for typos or incomplete data.';
                        fileError.style.display = '';
                    }
                }
            });
        }
    }

    /* ══════════════════════════════════════
       FAQ Accordion
       ══════════════════════════════════════ */

    var faqList = document.getElementById('b64FaqList');
    if (faqList) {
        faqList.addEventListener('click', function (e) {
            var btn = e.target.closest('.b64-faq-question');
            if (!btn) return;
            var item = btn.closest('.b64-faq-item');
            if (!item) return;
            item.classList.add('b64-faq-touched');
            item.classList.toggle('b64-faq-open');
        });
    }

})();
