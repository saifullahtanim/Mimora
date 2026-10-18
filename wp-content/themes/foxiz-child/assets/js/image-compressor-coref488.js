(function () {
    'use strict';

    /* ── Helpers ── */

    var $ = function (sel) { return document.querySelector(sel); };

    function escHtml(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function sanitizeFilename(name) {
        return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    }

    /* ── Page format detection ── */

    var pageEl = document.querySelector('.ic-page');
    if (!pageEl) return;

    var PAGE_FORMAT = pageEl.getAttribute('data-format') || 'jpeg';
    var wasmBase = pageEl.getAttribute('data-wasm-base') || '';

    function normalizeFormat(f) {
        f = (f || '').toLowerCase().trim();
        if (f === 'jpg') return 'jpeg';
        return f;
    }

    PAGE_FORMAT = normalizeFormat(PAGE_FORMAT);

    var inputAttr = pageEl.getAttribute('data-input-formats');
    var INPUT_FORMATS = inputAttr
        ? inputAttr.split(',').map(normalizeFormat).filter(Boolean)
        : [PAGE_FORMAT];

    var OUTPUT_FORMAT = normalizeFormat(pageEl.getAttribute('data-output-format') || PAGE_FORMAT);

    var ACTION_VERB = (pageEl.getAttribute('data-action') || 'compress').toLowerCase();
    function verbCap() { return ACTION_VERB.charAt(0).toUpperCase() + ACTION_VERB.slice(1); }
    function verbIng() {
        if (ACTION_VERB === 'compress') return 'Compressing';
        if (ACTION_VERB === 'convert') return 'Converting';
        return verbCap() + 'ing';
    }
    function verbPast() {
        if (ACTION_VERB === 'compress') return 'compressed';
        if (ACTION_VERB === 'convert') return 'converted';
        return ACTION_VERB + 'ed';
    }

    /* ── Output helpers ── */

    function getOutputMime(codec) {
        if (codec === 'jpeg') return 'image/jpeg';
        if (codec === 'png') return 'image/png';
        if (codec === 'webp') return 'image/webp';
        return 'image/jpeg';
    }

    function getOutputExt(codec) {
        if (codec === 'jpeg') return '.jpg';
        if (codec === 'png') return '.png';
        if (codec === 'webp') return '.webp';
        return '.jpg';
    }

    /* ── State ── */

    var files = [];       // { id, file, name, size, status, resultBlob, resultUrl, resultSize, errorMsg }
    var nextId = 0;
    var quality = 80;     // integer 1-100
    var webpConvert = false;
    var STORAGE_KEY = 'ic_quality_' + OUTPUT_FORMAT;

    /* ── DOM refs ── */

    var dropZone       = $('#icDropZone');
    var fileInput      = $('#icFileInput');
    var browseBtn      = $('#icBrowseBtn');
    var qualityRange   = $('#icQuality');
    var qualityVal     = $('#icQualityValue');
    var webpToggle     = $('#icWebpToggle');
    var compressBtn    = $('#icCompressBtn');
    var progressWrap   = $('.ic-progress');
    var progressText   = $('#icProgressText');
    var progressFill   = $('#icProgressFill');
    var resultsWrap    = $('.ic-results');
    var resultsGrid    = $('#icResultsGrid');
    var downloadAllBtn = $('#icDownloadAllBtn');
    var clearAllBtn    = $('#icClearAllBtn');
    var toastContainer = $('#icToastContainer');

    if (!dropZone || !fileInput) return;

    /* ── Quality slider with localStorage persistence ── */

    var supportsQuality = (OUTPUT_FORMAT === 'jpeg' || OUTPUT_FORMAT === 'webp');

    if (qualityRange) {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            var parsed = parseInt(saved, 10);
            if (parsed >= 1 && parsed <= 100) {
                quality = parsed;
                qualityRange.value = parsed;
                if (qualityVal) qualityVal.textContent = parsed + '%';
            }
        } else {
            quality = parseInt(qualityRange.value, 10) || 80;
            if (qualityVal) qualityVal.textContent = quality + '%';
        }

        qualityRange.addEventListener('input', function () {
            quality = parseInt(this.value, 10);
            if (qualityVal) qualityVal.textContent = this.value + '%';
            localStorage.setItem(STORAGE_KEY, this.value);
        });
    }

    /* ── WebP toggle ── */

    if (webpToggle) {
        webpToggle.addEventListener('click', function () {
            webpConvert = !webpConvert;
            this.setAttribute('aria-checked', webpConvert ? 'true' : 'false');
        });
    }

    /* ── File acceptance ── */

    var ACCEPTED_TYPES = {
        jpeg: ['image/jpeg', 'image/jpg'],
        png:  ['image/png'],
        webp: ['image/webp'],
        avif: ['image/avif']
    };

    var ACCEPTED_EXT = {
        jpeg: ['.jpg', '.jpeg'],
        png:  ['.png'],
        webp: ['.webp'],
        avif: ['.avif']
    };

    function isAccepted(file) {
        var name = file.name.toLowerCase();
        var type = (file.type || '').toLowerCase();
        for (var k = 0; k < INPUT_FORMATS.length; k++) {
            var fmt = INPUT_FORMATS[k];
            var exts = ACCEPTED_EXT[fmt] || [];
            for (var i = 0; i < exts.length; i++) {
                if (name.endsWith(exts[i])) return true;
            }
            var mimes = ACCEPTED_TYPES[fmt] || [];
            for (var j = 0; j < mimes.length; j++) {
                if (type === mimes[j]) return true;
            }
        }
        return false;
    }

    function formatName(f) {
        if (f === 'jpeg') return 'JPEG';
        if (f === 'png') return 'PNG';
        if (f === 'webp') return 'WebP';
        if (f === 'avif') return 'AVIF';
        return f.toUpperCase();
    }

    function formatLabel() {
        return INPUT_FORMATS.map(formatName).join('/');
    }

    /* ── Add files ── */

    function addFiles(fileList) {
        var added = 0;
        for (var i = 0; i < fileList.length; i++) {
            var f = fileList[i];
            if (!isAccepted(f)) {
                toast('Skipped "' + f.name + '" — not a ' + formatLabel() + ' file');
                continue;
            }
            if (f.size > 10 * 1024 * 1024) {
                toast('Warning: "' + f.name + '" is large (' + formatFileSize(f.size) + ') — may be slow');
            }
            files.push({
                id: nextId++,
                file: f,
                name: f.name,
                size: f.size,
                status: 'pending',
                resultBlob: null,
                resultUrl: null,
                resultSize: 0,
                errorMsg: ''
            });
            added++;
        }
        if (added > 0) {
            renderUploadQueue();
            updateCompressBtn();
        }
    }

    /* ── Upload zone events ── */

    dropZone.addEventListener('click', function (e) {
        if (e.target !== browseBtn && !browseBtn.contains(e.target)) {
            fileInput.click();
        }
    });

    browseBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        fileInput.click();
    });

    fileInput.addEventListener('change', function () {
        if (this.files.length) addFiles(this.files);
        this.value = '';
    });

    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('ic-dragover');
    });

    dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('ic-dragover');
    });

    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('ic-dragover');
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    /* ── Upload queue rendering ── */

    var uploadQueue = document.querySelector('.ic-upload-queue');

    function renderUploadQueue() {
        if (!uploadQueue) return;
        uploadQueue.innerHTML = '';
        var pending = files.filter(function (f) { return f.status === 'pending'; });
        if (pending.length === 0) {
            uploadQueue.style.display = 'none';
            return;
        }
        uploadQueue.style.display = '';
        pending.forEach(function (f) {
            var el = document.createElement('div');
            el.className = 'ic-upload-item';
            el.innerHTML =
                '<span class="ic-upload-item-name">' + escHtml(f.name) + '</span>' +
                '<span class="ic-upload-item-size">' + formatFileSize(f.size) + '</span>' +
                '<button type="button" class="ic-upload-item-remove" data-id="' + f.id + '" title="Remove">&times;</button>';
            uploadQueue.appendChild(el);
        });

        uploadQueue.querySelectorAll('.ic-upload-item-remove').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = parseInt(this.getAttribute('data-id'), 10);
                files = files.filter(function (f) { return f.id !== id; });
                renderUploadQueue();
                updateCompressBtn();
            });
        });
    }

    /* ── Compress button state ── */

    function updateCompressBtn() {
        if (!compressBtn) return;
        var pending = files.filter(function (f) { return f.status === 'pending'; });
        compressBtn.disabled = pending.length === 0;
    }

    /* ── Progress helpers ── */

    function showProgress() {
        if (progressWrap) progressWrap.classList.add('is-active');
    }

    function hideProgress() {
        if (progressWrap) progressWrap.classList.remove('is-active');
    }

    function showResults() {
        if (resultsWrap) resultsWrap.classList.add('is-active');
    }

    function updateProgress(current, total) {
        var pct = total > 0 ? Math.round((current / total) * 100) : 0;
        if (progressText) progressText.textContent = verbIng() + ' ' + current + ' of ' + total + '...';
        if (progressFill) progressFill.style.width = pct + '%';
    }

    /* ── Image decode: File → ImageData ── */

    function decodeImage(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve(imageData);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to decode image'));
            };
            img.src = url;
        });
    }

    /* ── Canvas → PNG bytes (for oxipng pipeline) ── */

    function canvasToPngBytes(imageData) {
        return new Promise(function (resolve, reject) {
            var canvas = document.createElement('canvas');
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            var ctx = canvas.getContext('2d');
            ctx.putImageData(imageData, 0, 0);
            canvas.toBlob(function (blob) {
                if (!blob) { reject(new Error('PNG encoding failed')); return; }
                blob.arrayBuffer().then(function (buf) {
                    resolve(new Uint8Array(buf));
                });
            }, 'image/png');
        });
    }

    /* ── Codec loading (lazy, cached) ── */

    var mozjpegModule = null;
    var webpModule = null;
    var oxipngModule = null;

    async function getMozjpeg() {
        if (!mozjpegModule) {
            var mod = await import(wasmBase + 'jsquash/jpeg/mozjpeg_enc.js');
            mozjpegModule = await mod.default();
        }
        return mozjpegModule;
    }

    async function getWebp() {
        if (!webpModule) {
            var mod = await import(wasmBase + 'jsquash/webp/webp_enc.js');
            webpModule = await mod.default();
        }
        return webpModule;
    }

    async function getOxipng() {
        if (!oxipngModule) {
            oxipngModule = await import(wasmBase + 'jsquash/oxipng/squoosh_oxipng.js');
            await oxipngModule.default();
        }
        return oxipngModule;
    }

    /* ── Compression logic per format ── */

    async function compressFile(fileObj) {
        var imageData = await decodeImage(fileObj.file);
        var outputCodec = (webpToggle && webpConvert) ? 'webp' : OUTPUT_FORMAT;
        var outputBlob;

        switch (outputCodec) {
            case 'jpeg': {
                var mj = await getMozjpeg();
                var jpegOpts = {
                    quality: quality,
                    baseline: false,
                    arithmetic: false,
                    progressive: true,
                    optimize_coding: true,
                    smoothing: 0,
                    color_space: 3,
                    quant_table: 3,
                    trellis_multipass: false,
                    trellis_opt_zero: false,
                    trellis_opt_table: false,
                    trellis_loops: 1,
                    auto_subsample: true,
                    chroma_subsample: 2,
                    separate_chroma_quality: false,
                    chroma_quality: 75
                };
                var encoded = mj.encode(imageData.data, imageData.width, imageData.height, jpegOpts);
                outputBlob = new Blob([encoded.buffer || encoded], { type: 'image/jpeg' });
                break;
            }
            case 'png': {
                var oxi = await getOxipng();
                var pngBytes = await canvasToPngBytes(imageData);
                var level = Math.max(1, Math.min(6, Math.round((100 - quality) / 100 * 6) || 2));
                var optimized = oxi.optimise(pngBytes, level, false, false);
                outputBlob = new Blob([optimized], { type: 'image/png' });
                break;
            }
            case 'webp': {
                var wp = await getWebp();
                var webpOpts = {
                    quality: quality,
                    target_size: 0,
                    target_PSNR: 0,
                    method: 4,
                    sns_strength: 50,
                    filter_strength: 60,
                    filter_sharpness: 0,
                    filter_type: 1,
                    partitions: 0,
                    segments: 4,
                    pass: 1,
                    show_compressed: 0,
                    preprocessing: 0,
                    autofilter: 0,
                    partition_limit: 0,
                    alpha_compression: 1,
                    alpha_filtering: 1,
                    alpha_quality: 100,
                    lossless: 0,
                    exact: 0,
                    image_hint: 0,
                    emulate_jpeg_size: 0,
                    thread_level: 0,
                    low_memory: 0,
                    near_lossless: 100,
                    use_delta_palette: 0,
                    use_sharp_yuv: 0
                };
                var result = wp.encode(imageData.data, imageData.width, imageData.height, webpOpts);
                if (!result) throw new Error('WebP encoding failed');
                outputBlob = new Blob([result.buffer || result], { type: 'image/webp' });
                break;
            }
            default:
                throw new Error('Unsupported codec: ' + outputCodec);
        }

        return outputBlob;
    }

    /* ── Batch compression runner ── */

    async function runCompression() {
        var pending = files.filter(function (f) { return f.status === 'pending'; });
        if (pending.length === 0) {
            toast('No files to compress');
            return;
        }

        compressBtn.disabled = true;
        showProgress();
        updateProgress(0, pending.length);

        var done = 0;

        for (var i = 0; i < pending.length; i++) {
            var f = pending[i];
            f.status = 'compressing';
            renderResultCard(f);

            try {
                var blob = await compressFile(f);
                f.resultBlob = blob;
                f.resultUrl = URL.createObjectURL(blob);
                f.resultSize = blob.size;
                f.status = 'done';
            } catch (err) {
                f.status = 'error';
                f.errorMsg = err && err.message ? err.message : verbCap() + ' failed';
                console.error(verbCap() + ' error:', f.name, err);
            }

            done++;
            updateProgress(done, pending.length);
            renderResultCard(f);
        }

        hideProgress();
        showResults();
        compressBtn.disabled = false;
        toast(done + ' file' + (done > 1 ? 's' : '') + ' ' + verbPast());
        renderUploadQueue();
        updateCompressBtn();
    }

    if (compressBtn) {
        compressBtn.addEventListener('click', function () {
            runCompression();
        });
    }

    /* ── Result card rendering ── */

    function renderResultCard(f) {
        if (!resultsGrid) return;
        showResults();

        var outputCodec = (webpToggle && webpConvert) ? 'webp' : OUTPUT_FORMAT;
        var outName = sanitizeFilename(f.name) + getOutputExt(outputCodec);
        var existing = resultsGrid.querySelector('[data-file-id="' + f.id + '"]');
        var el = existing || document.createElement('div');
        el.className = 'ic-result-card';
        el.setAttribute('data-file-id', f.id);

        var previewHtml = '';
        var metaHtml = '';
        var actionsHtml = '';

        if (f.status === 'compressing') {
            previewHtml = '<div class="ic-result-preview"><div class="ic-result-status"><span class="ic-spinner"></span></div></div>';
            metaHtml = '<span>Compressing...</span>';
        } else if (f.status === 'done') {
            previewHtml = '<div class="ic-result-preview"><img src="' + f.resultUrl + '" alt="' + escHtml(outName) + '" loading="lazy"></div>';
            var savedPct = f.size > 0 ? Math.round((1 - f.resultSize / f.size) * 100) : 0;
            var savedClass = savedPct > 0 ? 'ic-result-saved is-positive' : 'ic-result-saved';
            metaHtml =
                '<div class="ic-result-sizes">' +
                    '<span>' + formatFileSize(f.size) + '</span>' +
                    '<span class="ic-result-arrow">&rarr;</span>' +
                    '<span>' + formatFileSize(f.resultSize) + '</span>' +
                '</div>' +
                (savedPct !== 0
                    ? '<span class="' + savedClass + '">' + (savedPct > 0 ? '-' + savedPct : '+' + Math.abs(savedPct)) + '%</span>'
                    : '');
            actionsHtml =
                '<div class="ic-result-actions">' +
                    '<button type="button" class="ic-result-download" data-id="' + f.id + '">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
                        'Download' +
                    '</button>' +
                '</div>';
        } else if (f.status === 'error') {
            previewHtml = '<div class="ic-result-preview"><div class="ic-result-status ic-result-error">' + escHtml(f.errorMsg || 'Error') + '</div></div>';
            metaHtml = '<span class="ic-result-error-label">Failed</span>';
        }

        el.innerHTML =
            previewHtml +
            '<div class="ic-result-info">' +
                '<div class="ic-result-name" title="' + escHtml(outName) + '">' + escHtml(outName) + '</div>' +
                '<div class="ic-result-meta">' + metaHtml + '</div>' +
            '</div>' +
            actionsHtml;

        if (!existing) {
            resultsGrid.appendChild(el);
        }

        // Bind download
        var dlBtn = el.querySelector('.ic-result-download');
        if (dlBtn) {
            dlBtn.addEventListener('click', function () {
                var id = parseInt(this.getAttribute('data-id'), 10);
                var item = files.find(function (x) { return x.id === id; });
                if (item && item.resultBlob) {
                    var codec = (webpToggle && webpConvert) ? 'webp' : OUTPUT_FORMAT;
                    saveAs(item.resultBlob, sanitizeFilename(item.name) + getOutputExt(codec));
                }
            });
        }
    }

    /* ── Download All as ZIP ── */

    if (downloadAllBtn) {
        downloadAllBtn.addEventListener('click', function () {
            var done = files.filter(function (f) { return f.status === 'done'; });
            if (done.length === 0) {
                toast('No ' + verbPast() + ' files to download');
                return;
            }

            var outputCodec = (webpToggle && webpConvert) ? 'webp' : OUTPUT_FORMAT;
            var zip = new JSZip();
            done.forEach(function (f) {
                var fname = sanitizeFilename(f.name) + getOutputExt(outputCodec);
                zip.file(fname, f.resultBlob);
            });

            zip.generateAsync({ type: 'blob' }).then(function (blob) {
                saveAs(blob, verbPast() + '-' + outputCodec + '.zip');
                toast(done.length + ' file' + (done.length > 1 ? 's' : '') + ' downloaded as ZIP');
            });
        });
    }

    /* ── Clear All ── */

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', function () {
            files.forEach(function (f) {
                if (f.resultUrl) URL.revokeObjectURL(f.resultUrl);
            });
            files = [];
            nextId = 0;
            if (resultsGrid) resultsGrid.innerHTML = '';
            if (resultsWrap) resultsWrap.classList.remove('is-active');
            if (uploadQueue) uploadQueue.innerHTML = '';
            updateCompressBtn();
            toast('All files cleared');
        });
    }

    /* ── Toast notifications ── */

    function toast(msg) {
        if (!toastContainer) return;
        var el = document.createElement('div');
        el.className = 'ic-toast';
        el.textContent = msg;
        toastContainer.appendChild(el);
        setTimeout(function () {
            el.classList.add('ic-toast-out');
            el.addEventListener('animationend', function () { el.remove(); });
        }, 3000);
    }

    /* ── FAQ accordion ── */

    var faqList = document.getElementById('icFaqList');
    if (faqList) {
        faqList.addEventListener('click', function (e) {
            var btn = e.target.closest('.ic-faq-question');
            if (!btn) return;
            var item = btn.closest('.ic-faq-item');
            if (!item) return;
            item.classList.add('ic-faq-touched');
            item.classList.toggle('ic-faq-open');
        });
    }

})();
