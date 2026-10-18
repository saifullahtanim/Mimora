(function () {
	'use strict';

	// ---------------------------------------------------------------
	// Pure helpers (Node-testable)
	// ---------------------------------------------------------------

	var VIDEO_EXTS = { mp4: 1, mov: 1, mkv: 1, webm: 1, avi: 1, m4v: 1, flv: 1, wmv: 1, '3gp': 1 };
	var IMAGE_EXTS = { png: 1, jpg: 1, jpeg: 1, webp: 1, gif: 1 };

	function getStem(filename) {
		var idx = filename.lastIndexOf('.');
		return idx <= 0 ? filename : filename.slice(0, idx);
	}

	function formatBytes(bytes) {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
	}

	function sanitizeFilename(name) {
		return name.replace(/[\/\\?%*:|"<>\x00-\x1F]/g, '_');
	}

	function classifyFile(file) {
		var ext = (file.name.split('.').pop() || '').toLowerCase();
		if (file.type.indexOf('video/') === 0 || VIDEO_EXTS[ext]) return 'video';
		if (file.type.indexOf('image/') === 0 || IMAGE_EXTS[ext]) return 'image';
		return null;
	}

	function computeOverlayPosition(position, vw, vh, ow, oh) {
		var pad = 10;
		switch (position) {
			case 'tl': return { x: pad, y: pad };
			case 'tr': return { x: vw - ow - pad, y: pad };
			case 'bl': return { x: pad, y: vh - oh - pad };
			case 'br': return { x: vw - ow - pad, y: vh - oh - pad };
			case 'center': return { x: Math.round((vw - ow) / 2), y: Math.round((vh - oh) / 2) };
			default: return { x: pad, y: pad };
		}
	}

	function buildCommand(vw, vh, ow, oh, position) {
		var pos = computeOverlayPosition(position, vw, vh, ow, oh);
		var filter = '[1]scale=' + ow + ':-1[wm];[0][wm]overlay=' + pos.x + ':' + pos.y;
		var args = [
			'-i', 'input0',
			'-i', 'input1',
			'-filter_complex', filter,
			'-map', '0:v',
			'-map', '0:a?',
			'-c:v', 'libx264',
			'-preset', 'veryfast',
			'-crf', '23',
			'-c:a', 'copy',
			'-movflags', '+faststart',
			'output.mp4'
		];
		return { args: args, outName: 'output.mp4' };
	}

	// ---------------------------------------------------------------
	// Inline contract tests (Node-runnable; no-op in browser)
	// ---------------------------------------------------------------
	(function runTests() {
		if (typeof window !== 'undefined') return;

		var cpCases = [
			[ 'tl', 1920, 1080, 384, 216, { x: 10, y: 10 } ],
			[ 'tr', 1920, 1080, 384, 216, { x: 1526, y: 10 } ],
			[ 'bl', 1920, 1080, 384, 216, { x: 10, y: 854 } ],
			[ 'br', 1920, 1080, 384, 216, { x: 1526, y: 854 } ],
			[ 'center', 1920, 1080, 384, 216, { x: 768, y: 432 } ],
			[ 'unknown', 1920, 1080, 384, 216, { x: 10, y: 10 } ]
		];
		var cpFailed = 0;
		cpCases.forEach(function (c, i) {
			var got = computeOverlayPosition(c[0], c[1], c[2], c[3], c[4]);
			var want = c[5];
			if (got.x !== want.x || got.y !== want.y) {
				console.error('[imo] computeOverlayPosition case', i, c[0], '→', got, 'want', want); cpFailed++;
			}
		});
		if (cpFailed === 0) console.log('[imo] computeOverlayPosition: OK (' + cpCases.length + ' cases)');

		var bcCases = [
			{ in: [1920, 1080, 384, 216, 'br'], filter: '[1]scale=384:-1[wm];[0][wm]overlay=1526:854' },
			{ in: [640,  480,  128,  72, 'tl'], filter: '[1]scale=128:-1[wm];[0][wm]overlay=10:10' },
			{ in: [1280, 720,  256, 144, 'center'], filter: '[1]scale=256:-1[wm];[0][wm]overlay=512:288' }
		];
		var bcFailed = 0;
		bcCases.forEach(function (c, i) {
			var r = buildCommand.apply(null, c.in);
			var fcIdx = r.args.indexOf('-filter_complex');
			var filter = fcIdx >= 0 ? r.args[fcIdx + 1] : null;
			if (filter !== c.filter) { console.error('[imo] buildCommand case', i, '→', filter, 'want', c.filter); bcFailed++; }
			if (r.args.indexOf('-c:a') < 0 || r.args[r.args.indexOf('-c:a') + 1] !== 'copy') { console.error('[imo] buildCommand case', i, 'missing -c:a copy'); bcFailed++; }
			if (r.outName !== 'output.mp4') { console.error('[imo] buildCommand case', i, 'outName =', r.outName); bcFailed++; }
		});
		if (bcFailed === 0) console.log('[imo] buildCommand: OK (' + bcCases.length + ' cases)');

		var cfCases = [
			[ { name: 'a.mp4', type: 'video/mp4' }, 'video' ],
			[ { name: 'b.mkv', type: '' }, 'video' ],
			[ { name: 'c.png', type: 'image/png' }, 'image' ],
			[ { name: 'd.jpg', type: '' }, 'image' ],
			[ { name: 'e.txt', type: 'text/plain' }, null ]
		];
		var cfFailed = 0;
		cfCases.forEach(function (c, i) {
			if (classifyFile(c[0]) !== c[1]) { console.error('[imo] classifyFile case', i, c[0], '→', classifyFile(c[0]), 'want', c[1]); cfFailed++; }
		});
		if (cfFailed === 0) console.log('[imo] classifyFile: OK (' + cfCases.length + ' cases)');
	})();

	// ---------------------------------------------------------------
	// DOM (browser only)
	// ---------------------------------------------------------------

	if (typeof window === 'undefined' || typeof document === 'undefined') return;

	var MAX_VIDEO_BYTES = Infinity;
	var MAX_IMAGE_BYTES = Infinity;
	var DEFAULT_POSITION = 'br';
	var DEFAULT_SIZE_PCT = 20;

	var refs = {};
	var state = {
		video: null,
		image: null,
		position: DEFAULT_POSITION,
		sizePct: DEFAULT_SIZE_PCT,
		outputBlobUrl: null
	};

	function setLoadingState(opts) {
		var panel = refs.loadingPanel;
		if (!panel) return;
		if (!opts.visible) { panel.classList.remove('is-visible', 'is-error'); return; }
		panel.classList.add('is-visible');
		panel.classList.toggle('is-error', !!opts.isError);
		if (opts.label !== undefined) refs.loadingLabel.textContent = opts.label;
		if (opts.icon !== undefined)  refs.loadingIcon.innerHTML = opts.icon;
		if (opts.percent !== undefined) {
			if (opts.percent === null) {
				refs.loadingBar.classList.add('is-indeterminate');
				refs.loadingPercent.textContent = '';
			} else {
				refs.loadingBar.classList.remove('is-indeterminate');
				var pct = Math.round(opts.percent * 100);
				refs.loadingBarFill.style.width = pct + '%';
				refs.loadingPercent.textContent = pct + '%';
			}
		}
		if (opts.hint !== undefined) refs.loadingHint.textContent = opts.hint;
		if (opts.eta !== undefined) {
			refs.loadingEta.textContent = opts.eta;
			refs.loadingEta.hidden = !opts.eta;
		}
		refs.loadingRetry.hidden = !opts.showRetry;
	}

	function showSection(name) {
		refs.dropZone.hidden = (name !== 'idle');
		refs.controls.hidden = (name !== 'controls');
		refs.results.hidden  = (name !== 'results');
		if (name === 'loading') refs.controls.hidden = true;
	}

	function probeVideo(file) {
		return new Promise(function (resolve) {
			var url = URL.createObjectURL(file);
			var v = document.createElement('video');
			v.preload = 'metadata';
			v.muted = true;
			var done = false;
			function finish(result) {
				if (done) return;
				done = true;
				resolve(Object.assign({ file: file, previewUrl: url }, result));
			}
			v.onloadedmetadata = function () { finish({ width: v.videoWidth || 0, height: v.videoHeight || 0 }); };
			v.onerror = function () { finish({ width: 0, height: 0 }); };
			setTimeout(function () { finish({ width: 0, height: 0 }); }, 10000);
			v.src = url;
		});
	}

	function probeImage(file) {
		return new Promise(function (resolve) {
			var url = URL.createObjectURL(file);
			var img = new Image();
			var done = false;
			function finish(result) {
				if (done) return;
				done = true;
				resolve(Object.assign({ file: file, thumbUrl: url }, result));
			}
			img.onload = function () { finish({ width: img.naturalWidth, height: img.naturalHeight }); };
			img.onerror = function () { finish({ width: 0, height: 0 }); };
			setTimeout(function () { finish({ width: 0, height: 0 }); }, 10000);
			img.src = url;
		});
	}

	function renderSlots() {
		if (state.video) {
			refs.videoEmpty.hidden = true;
			refs.videoFilled.hidden = false;
			refs.videoName.textContent = state.video.file.name;
			refs.videoMeta.textContent = formatBytes(state.video.file.size) + ' · ' + state.video.width + '×' + state.video.height;
			refs.previewVideo.hidden = false;
			refs.previewVideo.src = state.video.previewUrl;
		} else {
			refs.videoEmpty.hidden = false;
			refs.videoFilled.hidden = true;
			refs.previewVideo.hidden = true;
			refs.previewVideo.removeAttribute('src');
		}

		if (state.image) {
			refs.imageEmpty.hidden = true;
			refs.imageFilled.hidden = false;
			refs.imageThumb.src = state.image.thumbUrl;
			refs.imageName.textContent = state.image.file.name;
			refs.imageMeta.textContent = formatBytes(state.image.file.size) + ' · ' + state.image.width + '×' + state.image.height;
		} else {
			refs.imageEmpty.hidden = false;
			refs.imageFilled.hidden = true;
		}

		refs.oversizedWarning.hidden = !(state.video && state.video.file.size > MAX_VIDEO_BYTES);

		updateInfo();
	}

	function syncPositionActive() {
		Array.prototype.forEach.call(refs.positionCells, function (cell) {
			if (cell.classList.contains('is-spacer')) return;
			cell.classList.toggle('is-active', cell.getAttribute('data-position') === state.position);
		});
	}

	function syncSizeActive() {
		Array.prototype.forEach.call(refs.sizeButtons, function (btn) {
			btn.classList.toggle('is-active', parseInt(btn.getAttribute('data-size'), 10) === state.sizePct);
		});
	}

	function updateInfo() {
		if (!state.video && !state.image) {
			refs.info.textContent = 'Drop both files to enable apply.';
			refs.info.className = 'imo-info';
			refs.applyBtn.disabled = true;
			return;
		}
		if (!state.video) {
			refs.info.textContent = 'Drop a video file to continue.';
			refs.info.className = 'imo-info';
			refs.applyBtn.disabled = true;
			return;
		}
		if (!state.image) {
			refs.info.textContent = 'Drop an image file (PNG, JPG, WEBP, GIF) to continue.';
			refs.info.className = 'imo-info';
			refs.applyBtn.disabled = true;
			return;
		}
		if (state.video.file.size > MAX_VIDEO_BYTES) {
			refs.info.textContent = '';
			refs.applyBtn.disabled = true;
			return;
		}
		if (state.image.file.size > MAX_IMAGE_BYTES) {
			refs.info.textContent = 'Image is over ' + formatBytes(MAX_IMAGE_BYTES) + '. Use a smaller logo or watermark.';
			refs.info.className = 'imo-info is-error';
			refs.applyBtn.disabled = true;
			return;
		}
		if (!state.video.width || !state.image.width) {
			refs.info.textContent = 'Reading file metadata…';
			refs.info.className = 'imo-info';
			refs.applyBtn.disabled = true;
			return;
		}
		var stem = getStem(state.video.file.name);
		var posLabel = { tl: 'top-left', tr: 'top-right', bl: 'bottom-left', br: 'bottom-right', center: 'center' }[state.position];
		refs.info.textContent = 'Output: ' + stem + '-overlay.mp4 · overlay @ ' + posLabel + ' ' + state.sizePct + '%';
		refs.info.className = 'imo-info';
		refs.applyBtn.disabled = false;
	}

	function setPosition(p) { state.position = p; syncPositionActive(); updateInfo(); }
	function setSize(pct)  { state.sizePct = pct; syncSizeActive(); updateInfo(); }

	function acceptFile(file) {
		var kind = classifyFile(file);
		if (kind === 'video') {
			if (state.video && state.video.previewUrl) URL.revokeObjectURL(state.video.previewUrl);
			probeVideo(file).then(function (r) { state.video = r; showSection('controls'); renderSlots(); });
		} else if (kind === 'image') {
			if (state.image && state.image.thumbUrl) URL.revokeObjectURL(state.image.thumbUrl);
			probeImage(file).then(function (r) { state.image = r; showSection('controls'); renderSlots(); });
		}
	}

	function acceptFiles(filesLike) {
		var files = Array.prototype.slice.call(filesLike || []);
		files.forEach(acceptFile);
	}

	function clearVideo() {
		if (state.video && state.video.previewUrl) URL.revokeObjectURL(state.video.previewUrl);
		state.video = null;
		renderSlots();
		if (!state.video && !state.image) showSection('idle');
	}

	function clearImage() {
		if (state.image && state.image.thumbUrl) URL.revokeObjectURL(state.image.thumbUrl);
		state.image = null;
		renderSlots();
		if (!state.video && !state.image) showSection('idle');
	}

	function resetAll() {
		clearVideo();
		clearImage();
		if (state.outputBlobUrl) { URL.revokeObjectURL(state.outputBlobUrl); state.outputBlobUrl = null; }
		refs.fileInput.value = '';
		refs.resultsVideo.removeAttribute('src');
		state.position = DEFAULT_POSITION;
		state.sizePct = DEFAULT_SIZE_PCT;
		syncPositionActive();
		syncSizeActive();
		showSection('idle');
		setLoadingState({ visible: false });
	}

	function doApply() {
		if (!state.video || !state.image || !window.how7oFfmpeg || !window.how7oFfmpeg.execMulti) return;

		var vw = state.video.width;
		var vh = state.video.height;
		var ow = Math.round(vw * state.sizePct / 100);
		var oh = Math.round(state.image.height * ow / state.image.width);
		var cmd = buildCommand(vw, vh, ow, oh, state.position);
		var files = [ state.video.file, state.image.file ];
		var outputFilename = sanitizeFilename(getStem(state.video.file.name) + '-overlay.mp4');

		showSection('loading');
		var processStart = 0;
		var unsub = null;

		function startProcess() {
			processStart = Date.now();
			setLoadingState({
				visible: true,
				label: 'Compositing image onto video',
				icon: '&#127912;',
				percent: 0,
				hint: 'Re-encoding video with overlay · audio stream-copied',
				eta: '',
				isError: false,
				showRetry: false
			});
			unsub = window.how7oFfmpeg.onProcessProgress(function (evt) {
				var p = Math.max(0, Math.min(1, evt.progress || 0));
				var elapsed = (Date.now() - processStart) / 1000;
				var eta = p > 0.02 ? Math.max(0, Math.round(elapsed / p - elapsed)) : null;
				setLoadingState({ visible: true, percent: p, eta: eta !== null ? '~' + eta + ' seconds remaining' : '' });
			});

			window.how7oFfmpeg.execMulti(cmd.args, files, cmd.outName).then(function (data) {
				try {
					var blob = new Blob([data.buffer], { type: 'video/mp4' });
					if (state.outputBlobUrl) URL.revokeObjectURL(state.outputBlobUrl);
					state.outputBlobUrl = URL.createObjectURL(blob);
					refs.resultsVideo.src = state.outputBlobUrl;
					refs.resultsMsg.textContent = 'Done! ' + outputFilename + ' · ' + formatBytes(blob.size);
					refs.downloadBtn.dataset.filename = outputFilename;
					showSection('results');
				} finally {
					if (unsub) unsub();
					setLoadingState({ visible: false });
				}
			}).catch(function (err) {
				if (unsub) unsub();
				console.error('[imo] overlay error', err);
				var msg = String(err && err.message || err);
				var likelyMemory = err instanceof RangeError || /allocation|out of memory|range/i.test(msg);
				setLoadingState({
					visible: true,
					label: likelyMemory ? 'Video too large for your browser' : 'Couldn\'t apply the overlay',
					icon: '&#9888;',
					percent: 0,
					hint: likelyMemory
						? 'Your browser ran out of memory. Try a shorter clip or smaller resolution.'
						: 'The video or image format may not be supported in the browser FFmpeg build. Try a different file.',
					eta: '',
					isError: true,
					showRetry: false
				});
				refs.controls.hidden = false;
			});
		}

		if (window.how7oFfmpeg.isLoaded()) {
			startProcess();
		} else {
			setLoadingState({
				visible: true,
				label: 'Preparing processing engine',
				icon: '&#9881;',
				percent: 0,
				hint: 'One-time download. Future visits start instantly.',
				eta: '',
				isError: false,
				showRetry: false
			});
			window.how7oFfmpeg.load(function (frac) {
				setLoadingState({ visible: true, percent: frac });
			}).then(function () {
				setLoadingState({ visible: true, label: 'Initializing', percent: null, hint: '' });
				return new Promise(function (r) { setTimeout(r, 250); });
			}).then(startProcess).catch(function (err) {
				console.error('[imo] FFmpeg load error', err);
				setLoadingState({
					visible: true,
					label: 'Couldn\'t load the processing engine',
					icon: '&#9888;',
					percent: 0,
					hint: 'Check your connection and try again.',
					eta: '',
					isError: true,
					showRetry: true
				});
				refs.controls.hidden = false;
			});
		}
	}

	function doDownload() {
		if (!state.outputBlobUrl) return;
		var a = document.createElement('a');
		a.href = state.outputBlobUrl;
		a.download = refs.downloadBtn.dataset.filename || 'video-overlay.mp4';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function init() {
		refs.dropZone        = document.getElementById('imoDropZone');
		refs.fileInput       = document.getElementById('imoFileInput');
		refs.browseBtn       = document.getElementById('imoBrowseBtn');
		refs.controls        = document.getElementById('imoControls');
		refs.videoEmpty      = document.getElementById('imoVideoEmpty');
		refs.videoFilled     = document.getElementById('imoVideoFilled');
		refs.videoName       = document.getElementById('imoVideoName');
		refs.videoMeta       = document.getElementById('imoVideoMeta');
		refs.videoClearBtn   = document.getElementById('imoVideoClearBtn');
		refs.imageEmpty      = document.getElementById('imoImageEmpty');
		refs.imageFilled     = document.getElementById('imoImageFilled');
		refs.imageThumb      = document.getElementById('imoImageThumb');
		refs.imageName       = document.getElementById('imoImageName');
		refs.imageMeta       = document.getElementById('imoImageMeta');
		refs.imageClearBtn   = document.getElementById('imoImageClearBtn');
		refs.oversizedWarning = document.getElementById('imoOversizedWarning');
		refs.previewVideo    = document.getElementById('imoPreviewVideo');
		refs.positionCells   = document.querySelectorAll('.imo-position-cell');
		refs.sizeButtons     = document.querySelectorAll('.imo-size-preset');
		refs.info            = document.getElementById('imoInfo');
		refs.applyBtn        = document.getElementById('imoApplyBtn');
		refs.loadingPanel    = document.getElementById('imoLoadingPanel');
		refs.loadingLabel    = document.getElementById('imoLoadingLabel');
		refs.loadingIcon     = document.getElementById('imoLoadingIcon');
		refs.loadingBar      = document.getElementById('imoLoadingBar');
		refs.loadingBarFill  = document.getElementById('imoLoadingBarFill');
		refs.loadingPercent  = document.getElementById('imoLoadingPercent');
		refs.loadingHint     = document.getElementById('imoLoadingHint');
		refs.loadingEta      = document.getElementById('imoLoadingEta');
		refs.loadingRetry    = document.getElementById('imoLoadingRetry');
		refs.results         = document.getElementById('imoResults');
		refs.resultsMsg      = document.getElementById('imoResultsMsg');
		refs.resultsVideo    = document.getElementById('imoResultsVideo');
		refs.downloadBtn     = document.getElementById('imoDownloadBtn');
		refs.resetBtn        = document.getElementById('imoResetBtn');

		if (!refs.dropZone) return;

		refs.dropZone.addEventListener('click', function (e) {
			if (e.target === refs.browseBtn || e.target.closest('#imoBrowseBtn')) return;
			refs.fileInput.click();
		});
		refs.browseBtn.addEventListener('click', function (e) { e.stopPropagation(); refs.fileInput.click(); });
		refs.fileInput.addEventListener('change', function (e) {
			acceptFiles(e.target.files);
			e.target.value = '';
		});

		['dragenter', 'dragover'].forEach(function (ev) {
			refs.dropZone.addEventListener(ev, function (e) { e.preventDefault(); refs.dropZone.classList.add('is-dragover'); });
		});
		['dragleave', 'drop'].forEach(function (ev) {
			refs.dropZone.addEventListener(ev, function (e) { e.preventDefault(); refs.dropZone.classList.remove('is-dragover'); });
		});
		refs.dropZone.addEventListener('drop', function (e) {
			if (e.dataTransfer && e.dataTransfer.files) acceptFiles(e.dataTransfer.files);
		});

		// State 2: also accept drops on the controls container (auto-routed by MIME)
		// so users can add the second file after the first is already in.
		['dragenter', 'dragover'].forEach(function (ev) {
			refs.controls.addEventListener(ev, function (e) { e.preventDefault(); refs.controls.classList.add('is-dragover'); });
		});
		['dragleave', 'drop'].forEach(function (ev) {
			refs.controls.addEventListener(ev, function (e) { e.preventDefault(); refs.controls.classList.remove('is-dragover'); });
		});
		refs.controls.addEventListener('drop', function (e) {
			if (e.dataTransfer && e.dataTransfer.files) acceptFiles(e.dataTransfer.files);
		});

		// Empty slot click → file picker (so users can browse-to-add the missing file)
		refs.videoEmpty.addEventListener('click', function () { refs.fileInput.click(); });
		refs.imageEmpty.addEventListener('click', function () { refs.fileInput.click(); });

		refs.videoClearBtn.addEventListener('click', clearVideo);
		refs.imageClearBtn.addEventListener('click', clearImage);

		Array.prototype.forEach.call(refs.positionCells, function (cell) {
			if (cell.classList.contains('is-spacer')) return;
			cell.addEventListener('click', function () {
				var p = cell.getAttribute('data-position');
				if (p) setPosition(p);
			});
		});
		Array.prototype.forEach.call(refs.sizeButtons, function (btn) {
			btn.addEventListener('click', function () {
				var s = parseInt(btn.getAttribute('data-size'), 10);
				if (isFinite(s)) setSize(s);
			});
		});

		refs.applyBtn.addEventListener('click', doApply);
		refs.loadingRetry.addEventListener('click', doApply);
		refs.downloadBtn.addEventListener('click', doDownload);
		refs.resetBtn.addEventListener('click', resetAll);

		// FAQ accordion
		document.querySelectorAll('.imo-faq-item').forEach(function (item) {
			var btn = item.querySelector('.imo-faq-question');
			if (!btn) return;
			btn.addEventListener('click', function () {
				item.classList.add('imo-faq-touched');
				item.classList.toggle('imo-faq-open');
			});
		});

		syncPositionActive();
		syncSizeActive();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})();
