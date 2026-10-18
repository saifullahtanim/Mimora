/**
 * Video Thumbnail Generator
 * 100% client-side video frame extraction and composite generation.
 */
(function () {
    'use strict';

    /* ---------------------------------------------------------------
     * State
     * --------------------------------------------------------------- */
    var videos = [];       // { id, file, name, duration, objectUrl, frames: [] }
    var nextId = 0;
    var outputFormat = 'png'; // or 'jpeg'

    /* ---------------------------------------------------------------
     * DOM refs
     * --------------------------------------------------------------- */
    var $ = function (sel) { return document.querySelector(sel); };
    var dropZone          = $('#vtgDropZone');
    var fileInput         = $('#vtgFileInput');
    var browseBtn         = $('#vtgBrowseBtn');
    var uploadQueue       = $('#vtgUploadQueue');
    var settingsSection   = $('#vtgSettingsSection');
    var autoOptions       = $('#vtgAutoOptions');
    var autoTypeSelect    = $('#vtgAutoType');
    var countGroup        = $('#vtgCountGroup');
    var intervalGroup     = $('#vtgIntervalGroup');
    var extractBtn        = $('#vtgExtractBtn');
    var progressSection   = $('#vtgProgressSection');
    var progressText      = $('#vtgProgressText');
    var progressFill      = $('#vtgProgressFill');
    var foldersSection    = $('#vtgFoldersSection');
    var foldersList       = $('#vtgFoldersList');
    var downloadAllBtn    = $('#vtgDownloadAllBtn');
    var clearAllBtn       = $('#vtgClearAllBtn');
    var manualSection     = $('#vtgManualSection');
    var manualTabs        = $('#vtgManualTabs');
    var manualVideo       = $('#vtgManualVideo');
    var frameBackBtn      = $('#vtgFrameBack');
    var playPauseBtn      = $('#vtgPlayPause');
    var frameForwardBtn   = $('#vtgFrameForward');
    var timecodeEl        = $('#vtgTimecode');
    var scrubber          = $('#vtgScrubber');
    var captureFrameBtn   = $('#vtgCaptureFrame');
    var manualCloseBtn    = $('#vtgManualClose');
    var compositeModal    = $('#vtgCompositeModal');
    var compositeOverlay  = $('#vtgCompositeOverlay');
    var compositeClose    = $('#vtgCompositeClose');
    var compositeFrames   = $('#vtgCompositeFrames');
    var compositeCanvas   = $('#vtgCompositeCanvas');
    var gridColsInput     = $('#vtgGridCols');
    var gridColsValue     = $('#vtgGridColsValue');
    var gridGapInput      = $('#vtgGridGap');
    var gridGapValue      = $('#vtgGridGapValue');
    var compBgInput       = $('#vtgCompBg');
    var compWidthInput    = $('#vtgCompWidth');
    var compTimestamps    = $('#vtgCompTimestamps');
    var compDownloadBtn   = $('#vtgCompDownload');
    var toastContainer    = $('#vtgToastContainer');

    /* ---------------------------------------------------------------
     * Helpers
     * --------------------------------------------------------------- */
    function formatTime(sec) {
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        var ms = Math.floor((sec % 1) * 1000);
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
    }

    function formatDuration(sec) {
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        return m + 'm ' + s + 's';
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function sanitizeFilename(name) {
        return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    }

    function getMimeType() {
        return outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
    }

    function getExt() {
        return outputFormat === 'jpeg' ? '.jpg' : '.png';
    }

    function toast(msg) {
        var el = document.createElement('div');
        el.className = 'vtg-toast';
        el.textContent = msg;
        toastContainer.appendChild(el);
        setTimeout(function () {
            el.classList.add('vtg-toast-out');
            el.addEventListener('animationend', function () { el.remove(); });
        }, 3000);
    }

    function getSelectedMode() {
        var top = document.querySelector('input[name="vtg_mode"]:checked').value;
        if (top === 'automatic') return autoTypeSelect.value; // 'count' or 'interval'
        return 'manual';
    }

    function getSelectedLayout() {
        var el = document.querySelector('input[name="vtg_layout"]:checked');
        return el ? el.value : 'grid';
    }

    function getCompFormat() {
        var el = document.querySelector('input[name="vtg_comp_format"]:checked');
        return el ? el.value : 'png';
    }

    function findVideo(id) {
        for (var i = 0; i < videos.length; i++) {
            if (videos[i].id === id) return videos[i];
        }
        return null;
    }

    /* ---------------------------------------------------------------
     * File handling
     * --------------------------------------------------------------- */
    var ACCEPTED = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/avi', 'video/x-matroska'];
    var ACCEPTED_EXT = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];

    function isAccepted(file) {
        if (ACCEPTED.indexOf(file.type) !== -1) return true;
        var name = file.name.toLowerCase();
        for (var i = 0; i < ACCEPTED_EXT.length; i++) {
            if (name.endsWith(ACCEPTED_EXT[i])) return true;
        }
        return false;
    }

    function addFiles(fileList) {
        var newFiles = [];
        var rejected = 0;
        var totalSize = 0;
        for (var i = 0; i < fileList.length; i++) {
            var f = fileList[i];
            if (!isAccepted(f)) { rejected++; continue; }
            totalSize += f.size;
            var vid = {
                id: nextId++,
                file: f,
                name: f.name,
                duration: 0,
                objectUrl: URL.createObjectURL(f),
                frames: []
            };
            videos.push(vid);
            newFiles.push(vid);
        }

        if (rejected) {
            toast(rejected + ' file(s) skipped — unsupported format');
        }

        if (!newFiles.length) return;

        if (totalSize > 500 * 1024 * 1024) {
            toast('Large files detected — processing may use significant memory');
        }

        newFiles.forEach(function (v) { renderUploadItem(v); });
        loadVideoDurations(newFiles);
        updateUI();

        toast(newFiles.length === 1
            ? 'Added: ' + newFiles[0].name
            : newFiles.length + ' videos added to queue');

        // Highlight new rows briefly so the user sees the selection landed.
        newFiles.forEach(function (v) {
            var row = uploadQueue.querySelector('[data-vid="' + v.id + '"]');
            if (!row) return;
            row.classList.add('vtg-upload-item-new');
            setTimeout(function () { row.classList.remove('vtg-upload-item-new'); }, 1500);
        });

        // Bring the settings panel (with the Extract button) into view.
        if (settingsSection && settingsSection.style.display !== 'none') {
            settingsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            uploadQueue.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function removeVideo(id) {
        var idx = -1;
        for (var i = 0; i < videos.length; i++) {
            if (videos[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return;
        var v = videos[idx];
        URL.revokeObjectURL(v.objectUrl);
        v.frames.forEach(function (fr) { if (fr.thumbUrl) URL.revokeObjectURL(fr.thumbUrl); });
        videos.splice(idx, 1);
        var item = uploadQueue.querySelector('[data-vid="' + id + '"]');
        if (item) item.remove();
        var folder = foldersList.querySelector('[data-vid="' + id + '"]');
        if (folder) folder.remove();
        updateUI();
    }

    function clearAll() {
        videos.forEach(function (v) {
            URL.revokeObjectURL(v.objectUrl);
            v.frames.forEach(function (fr) { if (fr.thumbUrl) URL.revokeObjectURL(fr.thumbUrl); });
        });
        videos = [];
        uploadQueue.innerHTML = '';
        foldersList.innerHTML = '';
        updateUI();
        toast('All cleared');
    }

    function loadVideoDurations(list) {
        list.forEach(function (v) {
            var el = document.createElement('video');
            el.preload = 'metadata';
            el.onloadedmetadata = function () {
                v.duration = el.duration;
                var statusEl = uploadQueue.querySelector('[data-vid="' + v.id + '"] .vtg-upload-item-status');
                if (statusEl) statusEl.textContent = formatDuration(v.duration);
                URL.revokeObjectURL(el.src);
            };
            el.onerror = function () {
                var statusEl = uploadQueue.querySelector('[data-vid="' + v.id + '"] .vtg-upload-item-status');
                if (statusEl) {
                    statusEl.textContent = 'Unsupported';
                    statusEl.style.color = '#dc3545';
                }
                toast(v.name + ' — format not supported by your browser. Try converting to MP4.');
            };
            el.src = v.objectUrl;
            // re-create object URL since we revoke the temp one
            v.objectUrl = URL.createObjectURL(v.file);
        });
    }

    function renderUploadItem(v) {
        var div = document.createElement('div');
        div.className = 'vtg-upload-item';
        div.setAttribute('data-vid', v.id);
        div.innerHTML =
            '<span class="vtg-upload-item-name">' + escHtml(v.name) + '</span>' +
            '<span class="vtg-upload-item-size">' + formatFileSize(v.file.size) + '</span>' +
            '<span class="vtg-upload-item-status"><span class="vtg-spinner"></span></span>' +
            '<button type="button" class="vtg-upload-item-remove" title="Remove">&times;</button>';
        div.querySelector('.vtg-upload-item-remove').addEventListener('click', function () { removeVideo(v.id); });
        uploadQueue.appendChild(div);
    }

    function escHtml(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function updateUI() {
        var hasVideos = videos.length > 0;
        settingsSection.style.display = hasVideos ? '' : 'none';

        var hasFrames = videos.some(function (v) { return v.frames.length > 0; });
        foldersSection.style.display = hasFrames ? '' : 'none';
    }

    /* ---------------------------------------------------------------
     * Drag & drop
     * --------------------------------------------------------------- */
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
        if (fileInput.files.length) addFiles(fileInput.files);
        fileInput.value = '';
    });

    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('vtg-dragover');
    });

    dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('vtg-dragover');
    });

    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('vtg-dragover');
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    /* ---------------------------------------------------------------
     * Settings mode toggle
     * --------------------------------------------------------------- */
    var STORAGE_KEY = 'vtg_auto_type';
    var MODE_STORAGE_KEY = 'vtg_mode';
    var FORMAT_STORAGE_KEY = 'vtg_format';

    function syncAutoFields() {
        var top = document.querySelector('input[name="vtg_mode"]:checked').value;
        var isAuto = top === 'automatic';
        var subMode = autoTypeSelect.value;
        autoOptions.style.display = isAuto ? '' : 'none';
        countGroup.style.display = isAuto && subMode === 'count' ? '' : 'none';
        intervalGroup.style.display = isAuto && subMode === 'interval' ? '' : 'none';
    }

    // Restore saved preferences
    (function () {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved && (saved === 'interval' || saved === 'count')) {
            autoTypeSelect.value = saved;
        }

        var savedMode = localStorage.getItem(MODE_STORAGE_KEY);
        if (savedMode && (savedMode === 'automatic' || savedMode === 'manual')) {
            var modeRadio = document.querySelector('input[name="vtg_mode"][value="' + savedMode + '"]');
            if (modeRadio) modeRadio.checked = true;
        }

        var savedFormat = localStorage.getItem(FORMAT_STORAGE_KEY);
        if (savedFormat && (savedFormat === 'png' || savedFormat === 'jpeg')) {
            var formatRadio = document.querySelector('input[name="vtg_format"][value="' + savedFormat + '"]');
            if (formatRadio) {
                formatRadio.checked = true;
                outputFormat = savedFormat;
            }
        }

        syncAutoFields();
    })();

    document.querySelectorAll('input[name="vtg_mode"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
            localStorage.setItem(MODE_STORAGE_KEY, this.value);
            syncAutoFields();
        });
    });

    autoTypeSelect.addEventListener('change', function () {
        localStorage.setItem(STORAGE_KEY, autoTypeSelect.value);
        syncAutoFields();
    });

    document.querySelectorAll('input[name="vtg_format"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
            outputFormat = this.value;
            localStorage.setItem(FORMAT_STORAGE_KEY, this.value);
        });
    });

    /* ---------------------------------------------------------------
     * Frame extraction
     * --------------------------------------------------------------- */
    extractBtn.addEventListener('click', function () {
        var mode = getSelectedMode();
        if (mode === 'manual') {
            startManualMode();
            return;
        }
        extractFramesAuto(mode);
    });

    function extractFramesAuto(mode) {
        var pending = videos.filter(function (v) { return v.duration > 0; });
        if (!pending.length) {
            toast('No videos ready — please wait for them to load');
            return;
        }

        extractBtn.disabled = true;
        progressSection.style.display = '';
        progressFill.style.width = '0%';
        progressText.textContent = 'Preparing...';
        progressSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        var total = pending.length;
        var done = 0;

        function next() {
            if (done >= total) {
                progressSection.style.display = 'none';
                extractBtn.disabled = false;
                renderAllFolders();
                updateUI();
                toast(total + ' video(s) processed');
                return;
            }
            var v = pending[done];
            var times = getExtractionTimes(v.duration, mode);
            var frameTotal = times.length;

            function updateProgress(frameIdx) {
                var perVideo = frameTotal > 0 ? (frameIdx / frameTotal) : 1;
                var overall = ((done + perVideo) / total) * 100;
                progressFill.style.width = overall.toFixed(1) + '%';
                progressText.textContent =
                    'Video ' + (done + 1) + ' of ' + total +
                    ' — frame ' + frameIdx + ' / ' + frameTotal +
                    ' (' + v.name + ')';
            }

            updateProgress(0);

            extractFramesFromVideo(v, times, updateProgress, function () {
                done++;
                progressFill.style.width = ((done / total) * 100) + '%';
                next();
            });
        }
        next();
    }

    function getExtractionTimes(duration, mode) {
        var times = [];
        if (mode === 'interval') {
            var interval = parseFloat($('#vtgInterval').value) || 5;
            for (var t = 0; t < duration; t += interval) {
                times.push(t);
            }
        } else if (mode === 'count') {
            var count = parseInt($('#vtgCount').value) || 10;
            if (count > 200) count = 200;
            for (var i = 0; i < count; i++) {
                times.push((duration / count) * i);
            }
        }
        if (!times.length) times.push(0);
        return times;
    }

    function extractFramesFromVideo(v, times, onProgress, callback) {
        // Back-compat: allow (v, times, callback) signature.
        if (typeof onProgress === 'function' && typeof callback !== 'function') {
            callback = onProgress;
            onProgress = null;
        }

        var video = document.createElement('video');
        video.muted = true;
        video.preload = 'auto';
        video.playsInline = true;

        var idx = 0;
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');

        video.addEventListener('loadeddata', function () {
            seekNext();
        });

        video.addEventListener('error', function () {
            toast('Error loading ' + v.name);
            callback();
        });

        function seekNext() {
            if (idx >= times.length) {
                URL.revokeObjectURL(video.src);
                callback();
                return;
            }
            video.currentTime = Math.min(times[idx], v.duration - 0.01);
        }

        video.addEventListener('seeked', function () {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            // Create a small thumbnail blob URL
            var thumbCanvas = document.createElement('canvas');
            var thumbW = 320;
            var thumbH = Math.round((video.videoHeight / video.videoWidth) * thumbW);
            thumbCanvas.width = thumbW;
            thumbCanvas.height = thumbH;
            var tCtx = thumbCanvas.getContext('2d');
            tCtx.drawImage(video, 0, 0, thumbW, thumbH);

            var time = times[idx];

            // Store full-res data as blob for memory efficiency
            canvas.toBlob(function (fullBlob) {
                thumbCanvas.toBlob(function (thumbBlob) {
                    var thumbUrl = URL.createObjectURL(thumbBlob);
                    v.frames.push({
                        time: time,
                        fullBlob: fullBlob,
                        thumbUrl: thumbUrl,
                        width: video.videoWidth,
                        height: video.videoHeight,
                        selected: false
                    });
                    idx++;
                    if (onProgress) onProgress(idx);
                    seekNext();
                }, 'image/jpeg', 0.7);
            }, getMimeType(), outputFormat === 'jpeg' ? 0.92 : undefined);
        });

        video.src = v.objectUrl;
    }

    /* ---------------------------------------------------------------
     * Folder rendering
     * --------------------------------------------------------------- */
    function renderAllFolders() {
        foldersList.innerHTML = '';
        videos.forEach(function (v) {
            if (v.frames.length) renderFolder(v);
        });
    }

    function renderFolder(v) {
        var existing = foldersList.querySelector('[data-vid="' + v.id + '"]');
        if (existing) existing.remove();

        var div = document.createElement('div');
        div.className = 'vtg-folder vtg-folder-open';
        div.setAttribute('data-vid', v.id);

        // Header
        var header = document.createElement('div');
        header.className = 'vtg-folder-header';
        header.innerHTML =
            '<div class="vtg-folder-info">' +
                '<span class="vtg-folder-toggle"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>' +
                '<span class="vtg-folder-name">' + escHtml(v.name) + '</span>' +
            '</div>' +
            '<div class="vtg-folder-meta">' +
                '<span>' + formatDuration(v.duration) + '</span>' +
                '<span class="vtg-folder-badge">' + v.frames.length + ' frames</span>' +
            '</div>';
        header.addEventListener('click', function () {
            div.classList.toggle('vtg-folder-open');
        });

        // Body
        var body = document.createElement('div');
        body.className = 'vtg-folder-body';

        // Actions
        var actions = document.createElement('div');
        actions.className = 'vtg-folder-actions';

        var selectAllBtn = createBtn('Select All', 'vtg-btn-secondary');
        var deselectAllBtn = createBtn('Deselect All', 'vtg-btn-secondary');
        var dlSelectedBtn = createBtn('Download Selected as ZIP', 'vtg-btn-secondary');
        var compositeBtn = createBtn('Generate Composite', 'vtg-btn-primary');

        selectAllBtn.addEventListener('click', function () {
            v.frames.forEach(function (fr) { fr.selected = true; });
            refreshFrameSelection(v.id);
        });
        deselectAllBtn.addEventListener('click', function () {
            v.frames.forEach(function (fr) { fr.selected = false; });
            refreshFrameSelection(v.id);
        });
        dlSelectedBtn.addEventListener('click', function () {
            downloadFolderZip(v);
        });
        compositeBtn.addEventListener('click', function () {
            openComposite(v);
        });

        actions.appendChild(selectAllBtn);
        actions.appendChild(deselectAllBtn);
        actions.appendChild(dlSelectedBtn);
        actions.appendChild(compositeBtn);
        body.appendChild(actions);

        // Frame grid
        var grid = document.createElement('div');
        grid.className = 'vtg-frame-grid';
        grid.setAttribute('data-grid', v.id);

        v.frames.forEach(function (fr, fi) {
            grid.appendChild(renderFrame(v, fr, fi));
        });

        body.appendChild(grid);
        div.appendChild(header);
        div.appendChild(body);
        foldersList.appendChild(div);
    }

    function renderFrame(v, fr, index) {
        var el = document.createElement('div');
        el.className = 'vtg-frame' + (fr.selected ? ' vtg-frame-selected' : '');
        el.setAttribute('data-frame-idx', index);

        var img = document.createElement('img');
        img.className = 'vtg-frame-img';
        img.src = fr.thumbUrl;
        img.alt = 'Frame at ' + formatTime(fr.time);
        img.loading = 'lazy';

        var overlay = document.createElement('div');
        overlay.className = 'vtg-frame-overlay';
        overlay.innerHTML =
            '<span class="vtg-frame-checkbox"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' +
            '<button type="button" class="vtg-frame-delete" title="Delete frame">&times;</button>';

        var timestamp = document.createElement('div');
        timestamp.className = 'vtg-frame-timestamp';
        timestamp.textContent = formatTime(fr.time);

        el.appendChild(img);
        el.appendChild(overlay);
        el.appendChild(timestamp);

        // Click to toggle selection
        el.addEventListener('click', function (e) {
            if (e.target.closest('.vtg-frame-delete')) return;
            fr.selected = !fr.selected;
            el.classList.toggle('vtg-frame-selected', fr.selected);
        });

        // Delete
        overlay.querySelector('.vtg-frame-delete').addEventListener('click', function (e) {
            e.stopPropagation();
            if (fr.thumbUrl) URL.revokeObjectURL(fr.thumbUrl);
            v.frames.splice(index, 1);
            renderFolder(v);
            if (!v.frames.length) {
                var folder = foldersList.querySelector('[data-vid="' + v.id + '"]');
                if (folder) folder.remove();
            }
            updateUI();
        });

        return el;
    }

    function refreshFrameSelection(vidId) {
        var grid = foldersList.querySelector('[data-grid="' + vidId + '"]');
        if (!grid) return;
        var v = findVideo(vidId);
        if (!v) return;
        var frames = grid.querySelectorAll('.vtg-frame');
        frames.forEach(function (el, i) {
            if (v.frames[i]) {
                el.classList.toggle('vtg-frame-selected', v.frames[i].selected);
            }
        });
    }

    function createBtn(text, cls) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vtg-btn ' + cls;
        btn.textContent = text;
        return btn;
    }

    /* ---------------------------------------------------------------
     * ZIP downloads
     * --------------------------------------------------------------- */
    function downloadFolderZip(v) {
        var selected = v.frames.filter(function (fr) { return fr.selected; });
        if (!selected.length) {
            toast('No frames selected');
            return;
        }

        toast('Generating ZIP...');
        var zip = new JSZip();
        var folderName = sanitizeFilename(v.name);
        var folder = zip.folder(folderName);

        var promises = selected.map(function (fr, i) {
            return new Promise(function (resolve) {
                var fname = 'frame_' + String(i + 1).padStart(3, '0') + '_' + formatTime(fr.time).replace(/[:.]/g, '-') + getExt();
                folder.file(fname, fr.fullBlob);
                resolve();
            });
        });

        Promise.all(promises).then(function () {
            return zip.generateAsync({ type: 'blob' });
        }).then(function (blob) {
            saveAs(blob, folderName + '_frames.zip');
            toast(selected.length + ' frames downloaded');
        });
    }

    downloadAllBtn.addEventListener('click', function () {
        var allWithFrames = videos.filter(function (v) { return v.frames.length > 0; });
        if (!allWithFrames.length) {
            toast('No frames to download');
            return;
        }

        toast('Generating ZIP...');
        var zip = new JSZip();

        allWithFrames.forEach(function (v) {
            var folderName = sanitizeFilename(v.name);
            var folder = zip.folder(folderName);
            v.frames.forEach(function (fr, i) {
                var fname = 'frame_' + String(i + 1).padStart(3, '0') + '_' + formatTime(fr.time).replace(/[:.]/g, '-') + getExt();
                folder.file(fname, fr.fullBlob);
            });
        });

        zip.generateAsync({ type: 'blob' }).then(function (blob) {
            saveAs(blob, 'all_video_frames.zip');
            var total = allWithFrames.reduce(function (sum, v) { return sum + v.frames.length; }, 0);
            toast(total + ' frames from ' + allWithFrames.length + ' videos downloaded');
        });
    });

    clearAllBtn.addEventListener('click', clearAll);

    /* ---------------------------------------------------------------
     * Manual selection mode
     * --------------------------------------------------------------- */
    var manualCurrentVid = null;

    function startManualMode() {
        var pending = videos.filter(function (v) { return v.duration > 0; });
        if (!pending.length) {
            toast('No videos ready');
            return;
        }
        manualSection.style.display = '';
        manualSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Build tabs
        manualTabs.innerHTML = '';
        pending.forEach(function (v, i) {
            var tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'vtg-manual-tab' + (i === 0 ? ' vtg-tab-active' : '');
            tab.textContent = v.name;
            tab.setAttribute('data-vid', v.id);
            tab.addEventListener('click', function () {
                manualTabs.querySelectorAll('.vtg-manual-tab').forEach(function (t) { t.classList.remove('vtg-tab-active'); });
                tab.classList.add('vtg-tab-active');
                loadManualVideo(v);
            });
            manualTabs.appendChild(tab);
        });

        loadManualVideo(pending[0]);
    }

    function loadManualVideo(v) {
        manualCurrentVid = v;
        manualVideo.src = v.objectUrl;
        manualVideo.load();
        scrubber.value = 0;
        timecodeEl.textContent = '00:00.000';
    }

    manualVideo.addEventListener('timeupdate', function () {
        if (manualVideo.duration) {
            scrubber.value = (manualVideo.currentTime / manualVideo.duration) * 100;
            timecodeEl.textContent = formatTime(manualVideo.currentTime);
        }
    });

    manualVideo.addEventListener('play', function () {
        playPauseBtn.querySelector('.vtg-icon-play').style.display = 'none';
        playPauseBtn.querySelector('.vtg-icon-pause').style.display = '';
    });

    manualVideo.addEventListener('pause', function () {
        playPauseBtn.querySelector('.vtg-icon-play').style.display = '';
        playPauseBtn.querySelector('.vtg-icon-pause').style.display = 'none';
    });

    playPauseBtn.addEventListener('click', function () {
        if (manualVideo.paused) manualVideo.play();
        else manualVideo.pause();
    });

    scrubber.addEventListener('input', function () {
        if (manualVideo.duration) {
            manualVideo.currentTime = (scrubber.value / 100) * manualVideo.duration;
        }
    });

    frameBackBtn.addEventListener('click', function () {
        manualVideo.pause();
        manualVideo.currentTime = Math.max(0, manualVideo.currentTime - (1 / 30));
    });

    frameForwardBtn.addEventListener('click', function () {
        manualVideo.pause();
        manualVideo.currentTime = Math.min(manualVideo.duration, manualVideo.currentTime + (1 / 30));
    });

    captureFrameBtn.addEventListener('click', function () {
        if (!manualCurrentVid || !manualVideo.videoWidth) return;
        manualVideo.pause();

        var canvas = document.createElement('canvas');
        canvas.width = manualVideo.videoWidth;
        canvas.height = manualVideo.videoHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(manualVideo, 0, 0);

        var thumbCanvas = document.createElement('canvas');
        var thumbW = 320;
        var thumbH = Math.round((manualVideo.videoHeight / manualVideo.videoWidth) * thumbW);
        thumbCanvas.width = thumbW;
        thumbCanvas.height = thumbH;
        thumbCanvas.getContext('2d').drawImage(manualVideo, 0, 0, thumbW, thumbH);

        var time = manualVideo.currentTime;

        canvas.toBlob(function (fullBlob) {
            thumbCanvas.toBlob(function (thumbBlob) {
                var thumbUrl = URL.createObjectURL(thumbBlob);
                manualCurrentVid.frames.push({
                    time: time,
                    fullBlob: fullBlob,
                    thumbUrl: thumbUrl,
                    width: manualVideo.videoWidth,
                    height: manualVideo.videoHeight,
                    selected: false
                });
                toast('Frame captured at ' + formatTime(time));
            }, 'image/jpeg', 0.7);
        }, getMimeType(), outputFormat === 'jpeg' ? 0.92 : undefined);
    });

    manualCloseBtn.addEventListener('click', function () {
        manualVideo.pause();
        manualVideo.removeAttribute('src');
        manualVideo.load();
        manualSection.style.display = 'none';
        manualCurrentVid = null;
        renderAllFolders();
        updateUI();
    });

    /* ---------------------------------------------------------------
     * Composite generator
     * --------------------------------------------------------------- */
    var compositeData = { video: null, frames: [] };

    function openComposite(v) {
        var selected = v.frames.filter(function (fr) { return fr.selected; });
        if (selected.length < 2) {
            toast('Select at least 2 frames');
            return;
        }
        compositeData.video = v;
        compositeData.frames = selected.slice();

        compositeModal.style.display = '';
        document.body.style.overflow = 'hidden';
        renderCompositeFrames();
        renderCompositePreview();
    }

    function closeComposite() {
        compositeModal.style.display = 'none';
        document.body.style.overflow = '';
        compositeData.video = null;
        compositeData.frames = [];
    }

    compositeClose.addEventListener('click', closeComposite);
    compositeOverlay.addEventListener('click', closeComposite);

    function renderCompositeFrames() {
        compositeFrames.innerHTML = '';
        compositeData.frames.forEach(function (fr, i) {
            var img = document.createElement('img');
            img.className = 'vtg-composite-frame-thumb';
            img.src = fr.thumbUrl;
            img.alt = 'Frame ' + (i + 1);
            img.draggable = true;
            img.setAttribute('data-idx', i);

            img.addEventListener('dragstart', function (e) {
                e.dataTransfer.setData('text/plain', i);
                img.classList.add('vtg-dragging');
            });
            img.addEventListener('dragend', function () {
                img.classList.remove('vtg-dragging');
            });
            img.addEventListener('dragover', function (e) { e.preventDefault(); });
            img.addEventListener('drop', function (e) {
                e.preventDefault();
                var fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                var toIdx = i;
                if (fromIdx === toIdx) return;
                var moved = compositeData.frames.splice(fromIdx, 1)[0];
                compositeData.frames.splice(toIdx, 0, moved);
                renderCompositeFrames();
                renderCompositePreview();
            });

            compositeFrames.appendChild(img);
        });
    }

    // Live preview updates
    gridColsInput.addEventListener('input', function () {
        gridColsValue.textContent = this.value;
        renderCompositePreview();
    });
    gridGapInput.addEventListener('input', function () {
        gridGapValue.textContent = this.value;
        renderCompositePreview();
    });
    compBgInput.addEventListener('input', function () { renderCompositePreview(); });
    compWidthInput.addEventListener('change', function () { renderCompositePreview(); });
    compTimestamps.addEventListener('change', function () { renderCompositePreview(); });
    document.querySelectorAll('input[name="vtg_layout"]').forEach(function (r) {
        r.addEventListener('change', function () { renderCompositePreview(); });
    });

    function renderCompositePreview() {
        var frames = compositeData.frames;
        if (!frames.length) return;

        var layout = getSelectedLayout();
        var cols = parseInt(gridColsInput.value) || 3;
        var gap = parseInt(gridGapInput.value) || 4;
        var bg = compBgInput.value || '#ffffff';
        var outWidth = parseInt(compWidthInput.value) || 1920;
        var showTimestamps = compTimestamps.checked;

        var canvas = compositeCanvas;
        var ctx = canvas.getContext('2d');

        if (layout === 'grid') {
            renderGridComposite(canvas, ctx, frames, cols, gap, bg, outWidth, showTimestamps);
        } else {
            renderCollageComposite(canvas, ctx, frames, gap, bg, outWidth, showTimestamps);
        }
    }

    function renderGridComposite(canvas, ctx, frames, cols, gap, bg, outWidth, showTimestamps) {
        var rows = Math.ceil(frames.length / cols);
        var cellW = Math.floor((outWidth - gap * (cols + 1)) / cols);
        // Assume 16:9 aspect
        var cellH = Math.floor(cellW * 9 / 16);
        var outHeight = rows * cellH + gap * (rows + 1);
        if (showTimestamps) outHeight += rows * 24;

        canvas.width = outWidth;
        canvas.height = outHeight;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, outWidth, outHeight);

        var loaded = 0;
        frames.forEach(function (fr, i) {
            var col = i % cols;
            var row = Math.floor(i / cols);
            var x = gap + col * (cellW + gap);
            var y = gap + row * (cellH + gap + (showTimestamps ? 24 : 0));

            var img = new Image();
            img.onload = function () {
                ctx.drawImage(img, x, y, cellW, cellH);
                if (showTimestamps) {
                    ctx.fillStyle = 'rgba(0,0,0,0.7)';
                    ctx.fillRect(x, y + cellH, cellW, 24);
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 13px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(formatTime(fr.time), x + cellW / 2, y + cellH + 17);
                }
                loaded++;
            };
            img.src = fr.thumbUrl;
        });
    }

    function renderCollageComposite(canvas, ctx, frames, gap, bg, outWidth, showTimestamps) {
        // Collage: alternating rows of 2 and 3 with varied heights
        var items = frames.slice();
        var rowDefs = [];
        var idx = 0;
        var rowToggle = false;

        while (idx < items.length) {
            var count = rowToggle ? 2 : 3;
            if (items.length - idx < count) count = items.length - idx;
            var rowFrames = items.slice(idx, idx + count);
            rowDefs.push(rowFrames);
            idx += count;
            rowToggle = !rowToggle;
        }

        var rowHeight = Math.floor(outWidth / 3 * 9 / 16);
        var totalHeight = rowDefs.length * (rowHeight + gap) + gap;
        if (showTimestamps) totalHeight += rowDefs.length * 24;

        canvas.width = outWidth;
        canvas.height = totalHeight;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, outWidth, totalHeight);

        var yPos = gap;

        rowDefs.forEach(function (rowFrames) {
            var cellW = Math.floor((outWidth - gap * (rowFrames.length + 1)) / rowFrames.length);
            var cellH = rowHeight;

            rowFrames.forEach(function (fr, ci) {
                var x = gap + ci * (cellW + gap);
                var img = new Image();
                var capturedX = x;
                var capturedY = yPos;
                var capturedW = cellW;
                var capturedH = cellH;
                img.onload = function () {
                    ctx.drawImage(img, capturedX, capturedY, capturedW, capturedH);
                    if (showTimestamps) {
                        ctx.fillStyle = 'rgba(0,0,0,0.7)';
                        ctx.fillRect(capturedX, capturedY + capturedH, capturedW, 24);
                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold 13px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(formatTime(fr.time), capturedX + capturedW / 2, capturedY + capturedH + 17);
                    }
                };
                img.src = fr.thumbUrl;
            });

            yPos += cellH + gap + (showTimestamps ? 24 : 0);
        });
    }

    compDownloadBtn.addEventListener('click', function () {
        if (!compositeCanvas.width) return;

        // Re-render at full resolution using fullBlob images
        var frames = compositeData.frames;
        var layout = getSelectedLayout();
        var cols = parseInt(gridColsInput.value) || 3;
        var gap = parseInt(gridGapInput.value) || 4;
        var bg = compBgInput.value || '#ffffff';
        var outWidth = parseInt(compWidthInput.value) || 1920;
        var showTimestamps = compTimestamps.checked;
        var fmt = getCompFormat();

        var fullCanvas = document.createElement('canvas');
        var fullCtx = fullCanvas.getContext('2d');

        // Load all full-res images
        var imagePromises = frames.map(function (fr) {
            return new Promise(function (resolve) {
                var url = URL.createObjectURL(fr.fullBlob);
                var img = new Image();
                img.onload = function () {
                    resolve({ img: img, url: url, time: fr.time });
                };
                img.onerror = function () {
                    resolve(null);
                };
                img.src = url;
            });
        });

        toast('Rendering full-res composite...');

        Promise.all(imagePromises).then(function (images) {
            images = images.filter(Boolean);

            if (layout === 'grid') {
                var rows = Math.ceil(images.length / cols);
                var cellW = Math.floor((outWidth - gap * (cols + 1)) / cols);
                var cellH = Math.floor(cellW * 9 / 16);
                var outHeight = rows * cellH + gap * (rows + 1);
                if (showTimestamps) outHeight += rows * 24;

                fullCanvas.width = outWidth;
                fullCanvas.height = outHeight;
                fullCtx.fillStyle = bg;
                fullCtx.fillRect(0, 0, outWidth, outHeight);

                images.forEach(function (item, i) {
                    var col = i % cols;
                    var row = Math.floor(i / cols);
                    var x = gap + col * (cellW + gap);
                    var y = gap + row * (cellH + gap + (showTimestamps ? 24 : 0));
                    fullCtx.drawImage(item.img, x, y, cellW, cellH);
                    if (showTimestamps) {
                        fullCtx.fillStyle = 'rgba(0,0,0,0.7)';
                        fullCtx.fillRect(x, y + cellH, cellW, 24);
                        fullCtx.fillStyle = '#fff';
                        fullCtx.font = 'bold 13px sans-serif';
                        fullCtx.textAlign = 'center';
                        fullCtx.fillText(formatTime(item.time), x + cellW / 2, y + cellH + 17);
                    }
                });
            } else {
                // Collage
                var rowDefs = [];
                var ri = 0;
                var toggle = false;
                while (ri < images.length) {
                    var count = toggle ? 2 : 3;
                    if (images.length - ri < count) count = images.length - ri;
                    rowDefs.push(images.slice(ri, ri + count));
                    ri += count;
                    toggle = !toggle;
                }

                var rowH = Math.floor(outWidth / 3 * 9 / 16);
                var totalH = rowDefs.length * (rowH + gap) + gap;
                if (showTimestamps) totalH += rowDefs.length * 24;

                fullCanvas.width = outWidth;
                fullCanvas.height = totalH;
                fullCtx.fillStyle = bg;
                fullCtx.fillRect(0, 0, outWidth, totalH);

                var yP = gap;
                rowDefs.forEach(function (rowItems) {
                    var cW = Math.floor((outWidth - gap * (rowItems.length + 1)) / rowItems.length);
                    rowItems.forEach(function (item, ci) {
                        var x = gap + ci * (cW + gap);
                        fullCtx.drawImage(item.img, x, yP, cW, rowH);
                        if (showTimestamps) {
                            fullCtx.fillStyle = 'rgba(0,0,0,0.7)';
                            fullCtx.fillRect(x, yP + rowH, cW, 24);
                            fullCtx.fillStyle = '#fff';
                            fullCtx.font = 'bold 13px sans-serif';
                            fullCtx.textAlign = 'center';
                            fullCtx.fillText(formatTime(item.time), x + cW / 2, yP + rowH + 17);
                        }
                    });
                    yP += rowH + gap + (showTimestamps ? 24 : 0);
                });
            }

            // Cleanup object URLs
            images.forEach(function (item) { URL.revokeObjectURL(item.url); });

            var mimeType = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
            var ext = fmt === 'jpeg' ? '.jpg' : '.png';

            fullCanvas.toBlob(function (blob) {
                saveAs(blob, 'composite_thumbnail' + ext);
                toast('Composite downloaded');
            }, mimeType, fmt === 'jpeg' ? 0.92 : undefined);
        });
    });

    /* ---------------------------------------------------------------
     * Keyboard support
     * --------------------------------------------------------------- */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (compositeModal.style.display !== 'none') {
                closeComposite();
            }
        }
    });

    /* ---------------------------------------------------------------
     * FAQ accordion
     * --------------------------------------------------------------- */
    var faqList = document.getElementById('vtgFaqList');
    if (faqList) {
        faqList.addEventListener('click', function (e) {
            var btn = e.target.closest('.vtg-faq-question');
            if (!btn) return;
            var item = btn.closest('.vtg-faq-item');
            if (!item) return;

            item.classList.add('vtg-faq-touched');
            item.classList.toggle('vtg-faq-open');
        });
    }

})();
