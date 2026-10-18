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

    function getTargetMime() {
        var fmt = PAGE_FORMAT;
        if (fmt === 'jpg') return 'image/jpeg';
        if (fmt === 'png') return 'image/png';
        if (fmt === 'webp') return 'image/webp';
        if (fmt === 'gif') return 'image/gif';
        return 'image/jpeg';
    }

    function getTargetExt() {
        var fmt = PAGE_FORMAT;
        if (fmt === 'jpg') return '.jpg';
        if (fmt === 'png') return '.png';
        if (fmt === 'webp') return '.webp';
        if (fmt === 'gif') return '.gif';
        return '.jpg';
    }

    /* ── Page format detection ── */

    var pageEl = document.querySelector('.hic-page');
    if (!pageEl) return;

    var PAGE_FORMAT = pageEl.getAttribute('data-format') || 'jpg';

    /* ── State ── */

    var files = [];       // { id, file, name, size, status, resultBlob, resultUrl, resultSize }
    var nextId = 0;
    var quality = 0.92;
    var STORAGE_KEY = 'hic_quality';

    /* ── DOM refs ── */

    var dropZone     = $('#hicDropZone');
    var fileInput     = $('#hicFileInput');
    var browseBtn     = $('#hicBrowseBtn');
    var settingsEl    = $('#hicSettingsSection');
    var qualityRange  = $('#hicQuality');
    var qualityVal    = $('#hicQualityValue');
    var convertBtn    = $('#hicConvertBtn');
    var progressEl    = $('#hicProgressSection');
    var progressText  = $('#hicProgressText');
    var progressFill  = $('#hicProgressFill');
    var resultsEl     = $('#hicResultsSection');
    var resultsGrid   = $('#hicResultsGrid');
    var downloadAllBtn = $('#hicDownloadAllBtn');
    var clearAllBtn   = $('#hicClearAllBtn');
    var toastContainer = $('#hicToastContainer');

    if (!dropZone || !fileInput) return;

    /* ── Quality (JPG/WebP only) ── */

    var supportsQuality = (PAGE_FORMAT === 'jpg' || PAGE_FORMAT === 'webp');

    if (qualityRange && supportsQuality) {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            var parsed = parseInt(saved, 10);
            if (parsed >= 1 && parsed <= 100) {
                quality = parsed / 100;
                qualityRange.value = parsed;
                if (qualityVal) qualityVal.textContent = parsed + '%';
            }
        }
        qualityRange.addEventListener('input', function () {
            quality = parseInt(this.value, 10) / 100;
            if (qualityVal) qualityVal.textContent = this.value + '%';
            localStorage.setItem(STORAGE_KEY, this.value);
        });
    }

    /* ── File acceptance ── */

    var ACCEPTED_EXT = ['.heic', '.heif'];

    function isAccepted(file) {
        var name = file.name.toLowerCase();
        for (var i = 0; i < ACCEPTED_EXT.length; i++) {
            if (name.endsWith(ACCEPTED_EXT[i])) return true;
        }
        // Also check MIME
        var type = (file.type || '').toLowerCase();
        if (type === 'image/heic' || type === 'image/heif') return true;
        return false;
    }

    /* ── Add files ── */

    function addFiles(fileList) {
        var added = 0;
        for (var i = 0; i < fileList.length; i++) {
            var f = fileList[i];
            if (!isAccepted(f)) {
                toast('Skipped "' + f.name + '" — not a HEIC/HEIF file');
                continue;
            }
            files.push({
                id: nextId++,
                file: f,
                name: f.name,
                size: f.size,
                status: 'pending',
                resultBlob: null,
                resultUrl: null,
                resultSize: 0
            });
            added++;
        }
        if (added > 0) {
            showSettings();
            renderUploadQueue();
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
        dropZone.classList.add('hic-dragover');
    });

    dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('hic-dragover');
    });

    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('hic-dragover');
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    /* ── Upload queue rendering ── */

    var uploadQueue = document.querySelector('.hic-upload-queue');

    function renderUploadQueue() {
        if (!uploadQueue) return;
        uploadQueue.innerHTML = '';
        var pending = files.filter(function (f) { return f.status === 'pending'; });
        pending.forEach(function (f) {
            var el = document.createElement('div');
            el.className = 'hic-upload-item';
            el.innerHTML =
                '<span class="hic-upload-item-name">' + escHtml(f.name) + '</span>' +
                '<span class="hic-upload-item-size">' + formatFileSize(f.size) + '</span>' +
                '<button type="button" class="hic-upload-item-remove" data-id="' + f.id + '" title="Remove">&times;</button>';
            uploadQueue.appendChild(el);
        });

        uploadQueue.querySelectorAll('.hic-upload-item-remove').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = parseInt(this.getAttribute('data-id'), 10);
                files = files.filter(function (f) { return f.id !== id; });
                renderUploadQueue();
                if (files.filter(function (f) { return f.status === 'pending'; }).length === 0 &&
                    files.filter(function (f) { return f.status === 'done'; }).length === 0) {
                    hideSettings();
                }
            });
        });
    }

    /* ── Show/hide sections ── */

    function showSettings() {
        if (settingsEl) settingsEl.style.display = '';
    }

    function hideSettings() {
        if (settingsEl) settingsEl.style.display = 'none';
    }

    function showProgress() {
        if (progressEl) progressEl.style.display = '';
    }

    function hideProgress() {
        if (progressEl) progressEl.style.display = 'none';
    }

    function showResults() {
        if (resultsEl) resultsEl.style.display = '';
    }

    function updateProgress(current, total) {
        var pct = total > 0 ? Math.round((current / total) * 100) : 0;
        if (progressText) progressText.textContent = 'Converting ' + current + ' of ' + total + '...';
        if (progressFill) progressFill.style.width = pct + '%';
    }

    /* ── Conversion ── */

    function convertFile(f) {
        var targetMime = getTargetMime();
        var opts = {
            blob: f.file,
            toType: targetMime
        };
        if (supportsQuality) {
            opts.quality = quality;
        }

        return HeicTo(opts).then(function (result) {
            // heic2any returns a Blob or array of Blobs (for multi-image HEIC)
            var blob;
            if (Array.isArray(result)) {
                blob = result[0]; // take first image for single-frame output
            } else {
                blob = result;
            }

            // For GIF and formats canvas can handle, we already have the blob
            // For WebP/GIF: heic2any may return PNG, so re-encode via canvas if needed
            if (PAGE_FORMAT === 'webp' || PAGE_FORMAT === 'gif') {
                return reencodeBlob(blob, targetMime);
            }
            return blob;
        });
    }

    function reencodeBlob(inputBlob, targetMime) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(function (blob) {
                    URL.revokeObjectURL(img.src);
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas encoding failed for ' + targetMime));
                    }
                }, targetMime, supportsQuality ? quality : undefined);
            };
            img.onerror = function () {
                URL.revokeObjectURL(img.src);
                reject(new Error('Failed to load image for re-encoding'));
            };
            img.src = URL.createObjectURL(inputBlob);
        });
    }

    async function runConversion() {
        var pending = files.filter(function (f) { return f.status === 'pending'; });
        if (pending.length === 0) {
            toast('No files to convert');
            return;
        }

        convertBtn.disabled = true;
        showProgress();
        updateProgress(0, pending.length);

        var done = 0;

        for (var i = 0; i < pending.length; i++) {
            var f = pending[i];
            f.status = 'converting';
            renderResultCard(f);

            try {
                var blob = await convertFile(f);
                f.resultBlob = blob;
                f.resultUrl = URL.createObjectURL(blob);
                f.resultSize = blob.size;
                f.status = 'done';
            } catch (err) {
                f.status = 'error';
                f.errorMsg = err && err.message ? err.message : 'Conversion failed';
                console.error('HEIC conversion error:', f.name, err);
            }

            done++;
            updateProgress(done, pending.length);
            renderResultCard(f);
        }

        hideProgress();
        showResults();
        convertBtn.disabled = false;
        toast(done + ' file' + (done > 1 ? 's' : '') + ' converted');
        renderUploadQueue();
    }

    if (convertBtn) {
        convertBtn.addEventListener('click', function () {
            runConversion();
        });
    }

    /* ── Result cards ── */

    function renderResultCard(f) {
        if (!resultsGrid) return;
        showResults();

        var existing = resultsGrid.querySelector('[data-file-id="' + f.id + '"]');
        var el = existing || document.createElement('div');
        el.className = 'hic-result-card';
        el.setAttribute('data-file-id', f.id);

        var outName = sanitizeFilename(f.name) + getTargetExt();
        var previewHtml = '';
        var metaHtml = '';
        var actionsHtml = '';

        if (f.status === 'converting') {
            previewHtml = '<div class="hic-result-preview"><div class="hic-result-status"><span class="hic-spinner"></span></div></div>';
            metaHtml = '<span>Converting...</span>';
        } else if (f.status === 'done') {
            previewHtml = '<div class="hic-result-preview"><img src="' + f.resultUrl + '" alt="' + escHtml(outName) + '" loading="lazy"></div>';
            var savedPct = f.size > 0 ? Math.round((1 - f.resultSize / f.size) * 100) : 0;
            metaHtml =
                '<div class="hic-result-sizes">' +
                    '<span>' + formatFileSize(f.size) + '</span>' +
                    '<span class="hic-result-arrow">&rarr;</span>' +
                    '<span>' + formatFileSize(f.resultSize) + '</span>' +
                '</div>' +
                (savedPct > 0 ? '<span class="hic-result-saved">-' + savedPct + '%</span>' : '');
            actionsHtml =
                '<div class="hic-result-actions">' +
                    '<button type="button" class="hic-result-download" data-id="' + f.id + '">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
                        'Download' +
                    '</button>' +
                '</div>';
        } else if (f.status === 'error') {
            previewHtml = '<div class="hic-result-preview"><div class="hic-result-status" style="color:#dc3545;font-size:0.85rem;text-align:center;padding:12px;">' + escHtml(f.errorMsg || 'Error') + '</div></div>';
            metaHtml = '<span style="color:#dc3545;">Failed</span>';
        }

        el.innerHTML =
            previewHtml +
            '<div class="hic-result-info">' +
                '<div class="hic-result-name" title="' + escHtml(outName) + '">' + escHtml(outName) + '</div>' +
                '<div class="hic-result-meta">' + metaHtml + '</div>' +
            '</div>' +
            actionsHtml;

        if (!existing) {
            resultsGrid.appendChild(el);
        }

        // Bind download
        var dlBtn = el.querySelector('.hic-result-download');
        if (dlBtn) {
            dlBtn.addEventListener('click', function () {
                var id = parseInt(this.getAttribute('data-id'), 10);
                var item = files.find(function (x) { return x.id === id; });
                if (item && item.resultBlob) {
                    saveAs(item.resultBlob, sanitizeFilename(item.name) + getTargetExt());
                }
            });
        }
    }

    /* ── Download All as ZIP ── */

    if (downloadAllBtn) {
        downloadAllBtn.addEventListener('click', function () {
            var done = files.filter(function (f) { return f.status === 'done'; });
            if (done.length === 0) {
                toast('No converted files to download');
                return;
            }

            var zip = new JSZip();
            done.forEach(function (f) {
                var fname = sanitizeFilename(f.name) + getTargetExt();
                zip.file(fname, f.resultBlob);
            });

            zip.generateAsync({ type: 'blob' }).then(function (blob) {
                saveAs(blob, 'heic-to-' + PAGE_FORMAT + '_converted.zip');
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
            if (resultsEl) resultsEl.style.display = 'none';
            hideSettings();
            renderUploadQueue();
            toast('All files cleared');
        });
    }

    /* ── Toast ── */

    function toast(msg) {
        if (!toastContainer) return;
        var el = document.createElement('div');
        el.className = 'hic-toast';
        el.textContent = msg;
        toastContainer.appendChild(el);
        setTimeout(function () {
            el.classList.add('hic-toast-out');
            el.addEventListener('animationend', function () { el.remove(); });
        }, 3000);
    }

    /* ── FAQ accordion ── */

    var faqList = document.getElementById('hicFaqList');
    if (faqList) {
        faqList.addEventListener('click', function (e) {
            var btn = e.target.closest('.hic-faq-question');
            if (!btn) return;
            var item = btn.closest('.hic-faq-item');
            if (!item) return;
            item.classList.add('hic-faq-touched');
            item.classList.toggle('hic-faq-open');
        });
    }

})();
