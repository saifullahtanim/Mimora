(function () {
	'use strict';
	if (!document.querySelector('.pdfedit-page')) { return; }

	var core = window.PDFEditor.core;
	var engine = window.PDFEditor.engine;
	var state = core.createState();
	var activeUid = null;
	var selected = {};   // uid -> true (for extract/split)
	var railEpoch = 0;   // bumped on every renderRail; in-flight thumb renders from a stale rail bail
	var editor = null;     // fabric editor bound to the active page (Phase 2)
	var activeEpoch = 0;   // bumped on every setActive; stale renders/mounts bail (incl. same-page refits)
	var activeTool = null; // 'pen' toggle state
	var zoomFactor = 1;    // 1 = fit-to-pane; >1 zooms in (pane scrolls)
	var formValues = {};   // AcroForm field values by name (Phase 4)
	state.doc = core.defaultDoc();

	var els = {
		toolbar: document.getElementById('pdfeditToolbar'),
		rail: document.getElementById('pdfeditRail'),
		canvasWrap: document.getElementById('pdfeditCanvasWrap'),
		panel: document.getElementById('pdfeditPanel'),
		status: document.getElementById('pdfeditStatus'),
		fileInput: document.getElementById('pdfeditFileInput')
	};

	var MAX_FILE_BYTES = Infinity;
	var WARN_FILE_BYTES = Infinity;
	var MAX_TOTAL_BYTES = Infinity;   // cumulative merge guard
	var SOFT_PAGE_CAP = Infinity;
	var HARD_PAGE_CAP = Infinity;
	var totalBytes = 0;                          // running total across imports
	var busy = false;                            // a long op (import/export/split) is in flight

	function setStatus(msg, isError) {
		els.status.textContent = msg || '';
		els.status.className = 'pdfedit-status' + (isError ? ' pdfedit-error' : '');
	}
	function announce(msg) { setStatus(msg, false); }

	// Busy = disable destructive/export controls + show an indeterminate bar on the card.
	function setBusy(on) {
		busy = on;
		var card = document.querySelector('.pdfedit-tool-card');
		if (card) { card.classList.toggle('is-busy', on); }
		renderToolbar();
	}

	function renderEmptyState() {
		els.canvasWrap.innerHTML =
			'<div class="pdfedit-empty"><p>Drop PDF files here or</p>' +
			'<button type="button" class="pdfedit-btn pdfedit-btn-primary" id="pdfeditBrowse">Choose PDF files</button></div>';
		document.getElementById('pdfeditBrowse').addEventListener('click', function () { els.fileInput.click(); });
		els.rail.innerHTML = '';
	}

	function isPdf(file) {
		return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
	}

	function readBytes(file) {
		return new Promise(function (resolve, reject) {
			var fr = new FileReader();
			fr.onload = function () { resolve(new Uint8Array(fr.result)); };
			fr.onerror = function () { reject(new Error('read error')); };
			fr.readAsArrayBuffer(file);
		});
	}

	// Magic-byte sniff: first 1KB contains "%PDF".
	function looksLikePdf(bytes) {
		var limit = Math.min(bytes.length, 1024);
		for (var i = 0; i < limit - 3; i++) {
			if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46) { return true; }
		}
		return false;
	}

	function importFiles(fileList) {
		var files = Array.prototype.slice.call(fileList);
		var chain = Promise.resolve();
		var errors = [];
		var warnings = [];
		formValues = {};   // reset AcroForm values for the new import (avoid carrying across sources)
		setBusy(true);
		files.forEach(function (file) {
			chain = chain.then(function () {
				if (!isPdf(file)) { errors.push(file.name + ': only PDF files are supported'); return; }
				if (file.size === 0) { errors.push(file.name + ': file is empty'); return; }
				if (file.size > MAX_FILE_BYTES) { errors.push(file.name + ': larger than 150 MB'); return; }
				if (totalBytes + file.size > MAX_TOTAL_BYTES) { errors.push(file.name + ': skipped — total size would exceed 400 MB'); return; }
				if (file.size > WARN_FILE_BYTES) { warnings.push(file.name + ' is large (' + Math.round(file.size / (1024 * 1024)) + ' MB) — may be slow'); }
				setStatus('Reading ' + file.name + '…');
				return readBytes(file).then(function (bytes) {
					if (!looksLikePdf(bytes)) { errors.push(file.name + ": doesn't appear to be a PDF"); return; }
					return engine.parsePdf(bytes, file.name).then(function (src) {
						totalBytes += file.size;
						var srcId = core.nextUid(state); // reuse uid sequence for source ids
						state.sources[srcId] = src;
						var newPages = state.pages.slice();
						for (var i = 0; i < src.pageCount; i++) {
							newPages.push(core.makePageRef({
								uid: core.nextUid(state), srcId: srcId, srcPageIndex: i,
								rotation: src.sizes[i].rotation, width: src.sizes[i].width, height: src.sizes[i].height
							}));
						}
						state.pages = newPages; // import is not itself undoable; mutations after are
					}).catch(function (errObj) {
						errors.push(file.name + ': ' + (errObj && errObj.message ? errObj.message : 'could not be opened'));
					});
				});
			});
		});
		return chain.then(function () {
			if (state.pages.length > HARD_PAGE_CAP) {
				state.pages = state.pages.slice(0, HARD_PAGE_CAP);
				errors.push('Limited to ' + HARD_PAGE_CAP + ' pages.');
			}
			renderRail();
			if (state.pages.length && !activeUid) { setActive(state.pages[0].uid); }
			renderToolbar();
			renderPanel();
			if (errors.length) { setStatus(errors.concat(warnings).join('  ·  '), true); }
			else if (warnings.length) { setStatus(warnings.join('  ·  '), false); }
			else if (state.pages.length > SOFT_PAGE_CAP) { setStatus(state.pages.length + ' pages — large document, editing may be slow.', false); }
			else { announce(state.pages.length + ' page' + (state.pages.length === 1 ? '' : 's') + ' ready.'); }
		}).then(function () { setBusy(false); }, function (e) { setBusy(false); throw e; });
	}

	function pageByUid(uid) { for (var i = 0; i < state.pages.length; i++) { if (state.pages[i].uid === uid) { return i; } } return -1; }

	function renderRail() {
		var epoch = ++railEpoch;   // invalidate thumb renders still in flight from a prior rail
		els.rail.innerHTML = '';
		state.pages.forEach(function (ref, index) {
			var item = document.createElement('div');
			item.className = 'pdfedit-thumb' + (ref.uid === activeUid ? ' is-active' : '') + (selected[ref.uid] ? ' is-selected' : '');
			item.setAttribute('role', 'listitem');
			item.dataset.uid = ref.uid;
			item.tabIndex = 0;
			var label = ref.blank ? 'Blank page' : (state.sources[ref.srcId].name + ' p.' + (ref.srcPageIndex + 1));
			item.setAttribute('aria-label', 'Page ' + (index + 1) + ' of ' + state.pages.length + ' — ' + label);
			var holder = document.createElement('div');
			holder.className = 'pdfedit-thumb-canvas';
			item.appendChild(holder);
			var num = document.createElement('span');
			num.className = 'pdfedit-thumb-num'; num.textContent = (index + 1);
			item.appendChild(num);
			els.rail.appendChild(item);

			// Plain click = make active; Shift/Ctrl/Cmd-click = toggle selection (extract/split set).
			item.addEventListener('click', function (e) {
				if (e.shiftKey || e.ctrlKey || e.metaKey) {
					if (selected[ref.uid]) { delete selected[ref.uid]; } else { selected[ref.uid] = true; }
					item.classList.toggle('is-selected');
					renderToolbar();
				} else {
					setActive(ref.uid);
				}
			});

			// Reorder: accessible Move up/down buttons + drag (progressive enhancement).
			var controls = document.createElement('div');
			controls.className = 'pdfedit-thumb-controls';
			var up = document.createElement('button');
			up.type = 'button'; up.className = 'pdfedit-thumb-btn'; up.innerHTML = icon('up');
			up.setAttribute('aria-label', 'Move up'); up.disabled = (index === 0);
			var down = document.createElement('button');
			down.type = 'button'; down.className = 'pdfedit-thumb-btn'; down.innerHTML = icon('down');
			down.setAttribute('aria-label', 'Move down'); down.disabled = (index === state.pages.length - 1);
			up.addEventListener('click', function (e) { e.stopPropagation(); reorder(index, index - 1); });
			down.addEventListener('click', function (e) { e.stopPropagation(); reorder(index, index + 1); });
			var delBtn = document.createElement('button');
			delBtn.type = 'button'; delBtn.className = 'pdfedit-thumb-btn'; delBtn.innerHTML = icon('trash');
			delBtn.setAttribute('aria-label', 'Delete page ' + (index + 1));
			// NOTE: no `busy` here — the rail renders during import (busy=true) and is not
			// re-rendered when busy clears; busy-blocking is done via CSS on .is-busy instead.
			delBtn.disabled = !core.canDelete(state);
			delBtn.addEventListener('click', function (e) { e.stopPropagation(); deletePageAt(index); });
			controls.appendChild(up); controls.appendChild(down); controls.appendChild(delBtn);
			item.appendChild(controls);
			item.draggable = true;
			item.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', String(index)); item.classList.add('is-dragging'); });
			item.addEventListener('dragend', function () { item.classList.remove('is-dragging'); });
			item.addEventListener('dragover', function (e) { e.preventDefault(); item.classList.add('is-drop-target'); });
			item.addEventListener('dragleave', function () { item.classList.remove('is-drop-target'); });
			item.addEventListener('drop', function (e) {
				e.preventDefault(); item.classList.remove('is-drop-target');
				var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
				if (!isNaN(from) && from !== index) { reorder(from, index); }
			});

			if (ref.blank) {
				holder.innerHTML = '<div class="pdfedit-thumb-blank" role="img" aria-label="Blank page"></div>';
			} else {
				engine.renderThumb(state.sources[ref.srcId].pdfjsDoc, ref.srcPageIndex, ref.rotation).then(function (r) {
					if (epoch !== railEpoch) { return; } // rail was rebuilt — this holder is detached
					if (r.blank) { holder.innerHTML = '<div class="pdfedit-thumb-blank">too large to preview</div>'; return; }
					r.canvas.setAttribute('role', 'img');
					r.canvas.setAttribute('aria-label', label);
					holder.innerHTML = ''; holder.appendChild(r.canvas);
				});
			}
		});
		els.rail.setAttribute('role', 'list');
	}

	function setActive(uid) {
		teardownEditor();           // serialize + dispose the prior page's editor first
		activeUid = uid;
		// Epoch guard: ANY newer setActive (including a same-page refit, e.g. fullscreen)
		// cancels older in-flight renders/mounts. A uid-only guard let two editors mount
		// over each other on refits — overlapping selection chrome, broken text editing.
		var epoch = ++activeEpoch;
		var idx = pageByUid(uid);
		if (idx < 0) { renderEmptyState(); return; }
		var ref = state.pages[idx];
		els.canvasWrap.innerHTML = '<div class="pdfedit-active-loading">Rendering…</div>';
		if (ref.blank) {
			var d = displaySizeFor(ref);
			var bg = document.createElement('canvas'); bg.width = d.w; bg.height = d.h;
			var bctx = bg.getContext('2d'); bctx.fillStyle = '#ffffff'; bctx.fillRect(0, 0, d.w, d.h);
			bg.className = 'pdfedit-active-canvas'; bg.setAttribute('role', 'img'); bg.setAttribute('aria-label', 'Blank page ' + (idx + 1));
			mountStack(ref, bg, d.w, d.h, epoch);
		} else {
			// Fit the page to the canvas pane; render at display-size x devicePixelRatio for
			// crispness and CSS-downscale. The estimate only picks the render resolution —
			// the MOUNT size is re-measured after the async render, when layout (e.g. a
			// fullscreen transition) has settled, so we never size from stale dimensions.
			var est = displaySizeFor(ref);
			var target = Math.round(Math.max(est.w, est.h) * (window.devicePixelRatio || 1) * 1.5);
			engine.renderActive(state.sources[ref.srcId].pdfjsDoc, ref.srcPageIndex, ref.rotation, target).then(function (r) {
				if (epoch !== activeEpoch) { return; } // superseded by a newer setActive/refit
				if (r.blank) { els.canvasWrap.innerHTML = '<div class="pdfedit-active-blank" role="img" aria-label="Page too large to preview on this device"></div>'; return; }
				var d = displaySizeFor(ref);          // fresh, post-layout measurement
				r.canvas.className = 'pdfedit-active-canvas';
				r.canvas.setAttribute('aria-label', 'Page ' + (idx + 1) + ' preview');
				r.canvas.style.width = d.w + 'px';    // CSS-downscale the high-res render
				r.canvas.style.height = d.h + 'px';
				mountStack(ref, r.canvas, d.w, d.h, epoch);
			});
		}
		Array.prototype.forEach.call(els.rail.children, function (c) { c.classList.toggle('is-active', c.dataset.uid === uid); });
	}

	function displaySizeFor(ref) {
		var fs = document.fullscreenElement || document.querySelector('.pdfedit-tool-card.is-max');
		var maxH = fs ? Math.max(400, window.innerHeight - 170) : 680;   // use the room in fullscreen
		var maxW = (els.canvasWrap.clientWidth || 600) - 16;
		var h = maxH, w = h * (ref.width / ref.height);
		if (w > maxW) { w = maxW; h = w * (ref.height / ref.width); }
		// zoom scales the fitted size; the canvas pane scrolls when it overflows
		w *= zoomFactor; h *= zoomFactor;
		return { w: Math.max(40, Math.round(w)), h: Math.max(40, Math.round(h)) };
	}
	function setZoom(z) {
		zoomFactor = Math.min(4, Math.max(0.5, z));
		if (activeUid && pageByUid(activeUid) >= 0) { setActive(activeUid); }
		renderToolbar();
		announce('Zoom ' + Math.round(zoomFactor * 100) + '%');
	}
	function mountStack(ref, backdropCanvas, displayW, displayH, epoch) {
		els.canvasWrap.innerHTML = '';
		var stack = document.createElement('div'); stack.className = 'pdfedit-page-stack';
		stack.style.position = 'relative'; stack.style.width = displayW + 'px'; stack.style.height = displayH + 'px';
		stack.appendChild(backdropCanvas);
		var fcanvas = document.createElement('canvas'); fcanvas.className = 'pdfedit-fabric';
		stack.appendChild(fcanvas);
		els.canvasWrap.appendChild(stack);
		void stack.offsetHeight; // force a synchronous reflow so the fresh layer paints cleanly
		mountEditor(ref, fcanvas, displayW, displayH, epoch);
	}
	function mountEditor(ref, fcanvas, displayW, displayH, epoch) {
		window.PDFEditor.objects.load().then(function () {
			if (epoch !== activeEpoch) { return; } // superseded while fabric loaded (incl. same-page refits)
			var i = pageByUid(activeUid);
			if (i < 0 || state.pages[i].uid !== ref.uid) { return; } // switched away while fabric loaded
			if (editor) { try { editor.dispose(); } catch (e) {} editor = null; } // never stack a second editor
			editor = window.PDFEditor.objects.createEditor(fcanvas, {
				widthPt: ref.width, heightPt: ref.height, displayW: displayW, displayH: displayH, json: ref.objects,
				onChange: function (json) {
					var j = pageByUid(ref.uid);
					if (j >= 0) { core.commit(state, core.setPageObjects(state.pages, j, json)); renderToolbar(); }
				}
			});
			editor.canvas.on('selection:created', renderPanel);
			editor.canvas.on('selection:updated', renderPanel);
			editor.canvas.on('selection:cleared', renderPanel);
			editor.canvas.on('object:added', function () { if (!editor.getSelected()) { renderLayers(); } });
			editor.canvas.on('object:removed', function () { if (!editor.getSelected()) { renderLayers(); } });
			if (window.__PDFEDIT_TEST__) { window.__ed = editor; window.__state = state; } // headless-test hook (no-op in production)
			refreshDocPreviews();
			renderPanel();
		}).catch(function () { setStatus('Could not load the annotation engine.', true); });
	}
	// save !== false: write the live objects back into the model IMMUTABLY (new array +
	// new pageRef) so we never mutate a pageRef shared with an undo snapshot, and without a
	// commit (page-switch save is not itself an undo step — edits were already committed via onChange).
	function teardownEditor(save) {
		if (editor) {
			if (save !== false) { try { var i = pageByUid(activeUid); if (i >= 0) { state.pages = core.setPageObjects(state.pages, i, editor.serialize()); } } catch (e) {} }
			try { editor.dispose(); } catch (e) {}
			editor = null;
		}
		activeTool = null;
	}
	function withEditor(fn) { if (editor) { fn(editor); } else { setStatus('Open a page first.', true); } }
	function syncActiveEditor() { if (editor) { var i = pageByUid(activeUid); if (i >= 0) { state.pages = core.setPageObjects(state.pages, i, editor.serialize()); } } }
	function pickImage() {
		var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
		inp.onchange = function () { if (inp.files[0]) { withEditor(function (ed) { ed.addImageFromFile(inp.files[0]); }); } };
		inp.click();
	}
	function signaturePrompt() {
		var t = window.prompt('Type your signature (or leave blank to draw it with the pen):', '');
		if (t === null) { return; }
		if (t.trim() === '') { withEditor(function (ed) { ed.startPen(); activeTool = 'pen'; renderToolbar(); }); }
		else { withEditor(function (ed) { ed.addTypedSignature(t.trim()); }); }
	}
	function refreshDocPreviews() {
		if (!editor) { return; }
		editor.setWatermarkPreview(state.doc.watermark);
		var i = pageByUid(activeUid);
		editor.setPageNumberPreview(i >= 0 ? core.pageNumberText(state.doc.pageNumbers, i, state.pages.length) : null);
	}

	// Inline monochrome SVG icons (stroke=currentColor, 24x24) — consistent on every OS,
	// unlike the emoji glyphs they replace.
	var ICONS = {
		add: '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M13 3v5h5"/><path d="M12 11v6"/><path d="M9 14h6"/>',
		rotate: '<path d="M21 12a9 9 0 1 1-2.6-6.36"/><path d="M21 3v5h-5"/>',
		trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/>',
		copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
		blank: '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M13 3v5h5"/>',
		extract: '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/><path d="M13 3v5h5"/><path d="M16 19h6"/><path d="M19 16l3 3-3 3"/>',
		split: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M20 4L8.5 15.5"/><path d="M14 14l6 6"/><path d="M8 8l3 3"/>',
		undo: '<path d="M3 8v6h6"/><path d="M5.3 14a8 8 0 1 0 1.8-8.3L3 8"/>',
		redo: '<path d="M21 8v6h-6"/><path d="M18.7 14a8 8 0 1 1-1.8-8.3L21 8"/>',
		maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
		minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
		download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
		text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
		image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
		square: '<rect x="4" y="4" width="16" height="16" rx="1.5"/>',
		circle: '<circle cx="12" cy="12" r="9"/>',
		line: '<path d="M5 19L19 5"/>',
		pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
		highlight: '<path d="M9 11l-6 6v3h3l6-6"/><path d="M16 5l3 3"/><path d="M22 9l-4.5 4.5-5-5L17 4a2 2 0 0 1 3 0z"/>',
		sign: '<path d="M3 17c3 0 4-9 7-9 2 0 1 7 3.5 7 2 0 2-4 7.5-4"/><path d="M3 21h18"/>',
		up: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
		down: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
		menu: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>',
		sliders: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
		eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
		eyeOff: '<path d="M17.94 17.94A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a18.3 18.3 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M2 2l20 20"/>',
		lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
		unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.7-1.5"/>',
		alignL: '<path d="M4 3v18"/><rect x="8" y="6" width="12" height="4" rx="1"/><rect x="8" y="14" width="7" height="4" rx="1"/>',
		alignCH: '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
		alignR: '<path d="M20 3v18"/><rect x="4" y="6" width="12" height="4" rx="1"/><rect x="9" y="14" width="7" height="4" rx="1"/>',
		alignT: '<path d="M3 4h18"/><rect x="6" y="8" width="4" height="12" rx="1"/><rect x="14" y="8" width="4" height="7" rx="1"/>',
		alignCV: '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
		alignB: '<path d="M3 20h18"/><rect x="6" y="4" width="4" height="12" rx="1"/><rect x="14" y="9" width="4" height="7" rx="1"/>',
		distH: '<path d="M4 4v16"/><path d="M20 4v16"/><rect x="9.5" y="8" width="5" height="8" rx="1"/>',
		distV: '<path d="M4 4h16"/><path d="M4 20h16"/><rect x="8" y="9.5" width="8" height="5" rx="1"/>',
		zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/><path d="M11 8v6"/>',
		zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/>',
		fit: '<path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
		eraser: '<path d="M20 20H9"/><path d="M5.2 13.8L13 6a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8l-7.8 7.8a2 2 0 0 1-2.8 0l-2.2-2.2a2 2 0 0 1 0-2.8z"/>'
	};
	function icon(name) {
		return '<svg class="pdfedit-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
	}

	function renderToolbar() {
		var n = state.pages.length;
		var hasActive = pageByUid(activeUid) >= 0;
		var selCount = state.pages.filter(function (p) { return selected[p.uid]; }).length; // live, not stale
		els.toolbar.innerHTML = '';
		// Two deliberate rows: page operations on top, annotate tools below
		// (a single flex-wrap container broke lines mid-group at arbitrary widths).
		var row1 = document.createElement('div'); row1.className = 'pdfedit-toolbar-row';
		var row2 = document.createElement('div'); row2.className = 'pdfedit-toolbar-row';
		els.toolbar.appendChild(row1); els.toolbar.appendChild(row2);
		var target = row1;
		function btn(id, ic, label, title, disabled) {
			var b = document.createElement('button');
			b.type = 'button'; b.className = 'pdfedit-btn'; b.id = id;
			b.innerHTML = icon(ic) + '<span class="pdfedit-btn-label">' + label + '</span>';
			b.setAttribute('aria-label', title); b.title = title;
			b.disabled = !!disabled || busy; // all controls disabled while a long op runs
			target.appendChild(b); return b;
		}
		function sep() { var s = document.createElement('span'); s.className = 'pdfedit-toolbar-sep'; target.appendChild(s); }
		btn('pdfeditAdd', 'add', 'Add PDF', 'Add PDF files').addEventListener('click', function () { els.fileInput.click(); });
		sep();
		btn('pdfeditRotate', 'rotate', 'Rotate', 'Rotate active page 90°', !hasActive).addEventListener('click', rotateActive);
		btn('pdfeditDelete', 'trash', 'Delete', 'Delete active page', !hasActive || !core.canDelete(state)).addEventListener('click', deleteActive);
		btn('pdfeditDup', 'copy', 'Duplicate', 'Duplicate active page', !hasActive).addEventListener('click', duplicateActive);
		btn('pdfeditBlank', 'blank', 'Blank', 'Insert blank page after active', false).addEventListener('click', insertBlankAfterActive);
		sep();
		btn('pdfeditExtract', 'extract', 'Extract', 'Extract selected pages to a new PDF', selCount === 0).addEventListener('click', extractSelected);
		btn('pdfeditSplit', 'split', 'Split', 'Split into separate PDFs (zip)', n === 0).addEventListener('click', splitAll);
		sep();
		btn('pdfeditUndo', 'undo', 'Undo', 'Undo last change', !core.canUndo(state)).addEventListener('click', doUndo);
		btn('pdfeditRedo', 'redo', 'Redo', 'Redo', !core.canRedo(state)).addEventListener('click', doRedo);
		sep();
		var cardEl = document.querySelector('.pdfedit-tool-card');
		var maxed = !!(cardEl && cardEl.classList.contains('is-max'));
		btn('pdfeditFullscreen', maxed ? 'minimize' : 'maximize', maxed ? 'Exit' : 'Full screen', maxed ? 'Exit full screen' : 'Enter full screen', false).addEventListener('click', toggleFullscreen);
		var expBtn = btn('pdfeditExport', 'download', 'Download PDF', 'Download the edited PDF', !core.canExport(state));
		expBtn.classList.add('pdfedit-btn-primary');
		expBtn.addEventListener('click', exportAll);
		expBtn.disabled = !core.canExport(state) || busy;

		// --- object tools (Phase 2): second toolbar row ---
		target = row2;
		var hasPage = state.pages.length > 0;
		btn('pdfeditText', 'text', 'Text', 'Add text', !hasPage).addEventListener('click', function () { withEditor(function (ed) { ed.addText(); }); });
		btn('pdfeditImage', 'image', 'Image', 'Add image', !hasPage).addEventListener('click', pickImage);
		sep();
		btn('pdfeditRectTool', 'square', 'Rect', 'Add rectangle', !hasPage).addEventListener('click', function () { withEditor(function (ed) { ed.addRect(); }); });
		btn('pdfeditEllipseTool', 'circle', 'Ellipse', 'Add ellipse', !hasPage).addEventListener('click', function () { withEditor(function (ed) { ed.addEllipse(); }); });
		btn('pdfeditLineTool', 'line', 'Line', 'Add line', !hasPage).addEventListener('click', function () { withEditor(function (ed) { ed.addLine(); }); });
		sep();
		var penBtn = btn('pdfeditPen', 'pen', 'Pen', 'Toggle free-draw pen', !hasPage);
		if (activeTool === 'pen') { penBtn.classList.add('is-on'); }
		penBtn.addEventListener('click', function () { withEditor(function (ed) { if (activeTool === 'pen') { ed.stopPen(); activeTool = null; } else { ed.startPen(); activeTool = 'pen'; } penBtn.classList.toggle('is-on', activeTool === 'pen'); }); });
		btn('pdfeditHighlight', 'highlight', 'Highlight', 'Add highlight', !hasPage).addEventListener('click', function () { withEditor(function (ed) { ed.addHighlight(); }); });
		btn('pdfeditErase', 'eraser', 'Erase', 'Cover an area (whiteout — the original content is hidden in the export)', !hasPage).addEventListener('click', function () { withEditor(function (ed) { ed.addWhiteout(); }); });
		btn('pdfeditSign', 'sign', 'Sign', 'Add signature', !hasPage).addEventListener('click', signaturePrompt);
		sep();
		btn('pdfeditObjDelete', 'trash', 'Delete', 'Delete selected object', !hasPage).addEventListener('click', function () { withEditor(function (ed) { ed.deleteSelected(); }); });
		btn('pdfeditObjDup', 'copy', 'Duplicate', 'Duplicate selected object', !hasPage).addEventListener('click', function () { withEditor(function (ed) { ed.duplicateSelected(); }); });
		btn('pdfeditObjFwd', 'up', 'Forward', 'Bring object forward', !hasPage).addEventListener('click', function () { withEditor(function (ed) { ed.bringForward(); }); });
		btn('pdfeditObjBack', 'down', 'Back', 'Send object backward', !hasPage).addEventListener('click', function () { withEditor(function (ed) { ed.sendBackward(); }); });
		sep();
		// the zoom cluster wraps as one unit (a split "Out ... / 100% In Fit" looks broken)
		var zoomGroup = document.createElement('span'); zoomGroup.className = 'pdfedit-zoom-group';
		target.appendChild(zoomGroup);
		var outerTarget = target; target = zoomGroup;
		btn('pdfeditZoomOut', 'zoomOut', 'Out', 'Zoom out', !hasActive || zoomFactor <= 0.5).addEventListener('click', function () { setZoom(zoomFactor / 1.25); });
		var pct = document.createElement('span'); pct.className = 'pdfedit-zoom-pct'; pct.id = 'pdfeditZoomPct';
		pct.textContent = Math.round(zoomFactor * 100) + '%'; pct.setAttribute('aria-label', 'Current zoom'); target.appendChild(pct);
		btn('pdfeditZoomIn', 'zoomIn', 'In', 'Zoom in', !hasActive || zoomFactor >= 4).addEventListener('click', function () { setZoom(zoomFactor * 1.25); });
		btn('pdfeditZoomFit', 'fit', 'Fit', 'Fit page to the pane', !hasActive || zoomFactor === 1).addEventListener('click', function () { setZoom(1); });
		target = outerTarget;

		var pagesToggle = btn('pdfeditPagesToggle', 'menu', 'Pages', 'Show pages', false);
		pagesToggle.classList.add('pdfedit-only-mobile');
		pagesToggle.addEventListener('click', function () { toggleDrawer('rail'); });
		var propsToggle = btn('pdfeditPropsToggle', 'sliders', 'Tools', 'Show selection tools', false);
		propsToggle.classList.add('pdfedit-only-mobile');
		propsToggle.addEventListener('click', function () { toggleDrawer('panel'); });
	}

	// Prune any selection entries for pages that no longer exist (after delete/undo).
	function afterMutation(msg) {
		Object.keys(selected).forEach(function (u) { if (pageByUid(u) < 0) { delete selected[u]; } });
		renderRail(); renderToolbar(); renderPanel(); if (msg) announce(msg);
	}

	function rotateActive() {
		var idx = pageByUid(activeUid); if (idx < 0) return;
		core.commit(state, core.rotatePage(state.pages, idx, 90));
		setActive(activeUid); afterMutation('Page ' + (idx + 1) + ' rotated.');
	}
	function deletePageAt(idx) {
		if (idx < 0 || idx >= state.pages.length || !core.canDelete(state)) return;
		var wasActive = state.pages[idx].uid === activeUid;
		var nextActive = wasActive ? (state.pages[idx + 1] || state.pages[idx - 1]) : null;
		core.commit(state, core.deletePage(state.pages, idx));
		if (wasActive) {
			activeUid = nextActive ? nextActive.uid : null;
			if (activeUid) setActive(activeUid); else renderEmptyState();
		}
		afterMutation('Page ' + (idx + 1) + ' deleted.');
	}
	function deleteActive() { deletePageAt(pageByUid(activeUid)); }
	function duplicateActive() {
		var idx = pageByUid(activeUid); if (idx < 0) return;
		var newUid = core.nextUid(state);
		core.commit(state, core.duplicatePage(state.pages, idx, newUid));
		activeUid = newUid; setActive(activeUid); // show the new copy (consistent with insert-blank)
		afterMutation('Page ' + (idx + 1) + ' duplicated.');
	}
	function insertBlankAfterActive() {
		var idx = pageByUid(activeUid);
		var at = idx < 0 ? state.pages.length : idx + 1;
		var sizeRef = idx >= 0 ? state.pages[idx] : core.A4_PORTRAIT;
		var blank = core.makePageRef({ uid: core.nextUid(state), srcId: null, srcPageIndex: null, rotation: 0, width: sizeRef.width, height: sizeRef.height, blank: true });
		core.commit(state, core.insertBlankPage(state.pages, at, blank));
		activeUid = blank.uid; setActive(activeUid); // show the newly inserted blank page
		afterMutation('Blank page inserted.');
	}
	function doUndo() {
		teardownEditor(false);   // discard the live editor WITHOUT writing back — undo restores objects
		core.undo(state);
		if (pageByUid(activeUid) < 0) { activeUid = state.pages.length ? state.pages[0].uid : null; }
		if (activeUid) setActive(activeUid); else renderEmptyState();
		afterMutation('Undid last change.');
	}
	function doRedo() {
		teardownEditor(false);
		core.redo(state);
		if (pageByUid(activeUid) < 0) { activeUid = state.pages.length ? state.pages[0].uid : null; }
		if (activeUid) setActive(activeUid); else renderEmptyState();
		afterMutation('Redid change.');
	}

	function reorder(from, to) {
		if (to < 0 || to >= state.pages.length) return;
		var uid = state.pages[from].uid;
		core.commit(state, core.movePage(state.pages, from, to));
		renderRail(); renderToolbar();
		var el = els.rail.querySelector('[data-uid="' + uid + '"]'); if (el) el.focus();
		announce('Page moved to position ' + (to + 1) + ' of ' + state.pages.length + '.');
	}

	function selectedIndices() {
		var idx = [];
		state.pages.forEach(function (p, i) { if (selected[p.uid]) { idx.push(i); } });
		return idx;
	}
	function extractSelected() {
		if (busy) return;
		var idx = selectedIndices(); if (!idx.length) { setStatus('Select pages first (Shift/Ctrl-click).', true); return; }
		syncActiveEditor();
		var pages = core.selectByIndices(state.pages, idx);
		setBusy(true); setStatus('Building extract…');
		engine.assembleAndDownload(pages, state.sources, 'extracted-pages.pdf', { doc: state.doc, totalForNumbers: pages.length })
			.then(function () { announce('Extracted ' + idx.length + ' page(s).'); })
			.catch(function () { setStatus('Extract failed.', true); })
			.then(function () { setBusy(false); });
	}
	function splitAll() {
		if (busy || !state.pages.length) return;
		syncActiveEditor();
		// If a selection exists, split only those; else split every page.
		var idx = selectedIndices();
		var positions = idx.length ? idx : state.pages.map(function (_, i) { return i; });
		var groups = core.selectByIndices(state.pages, positions).map(function (p) { return [p]; });
		// Name each entry by the page's CURRENT document position.
		var names = positions.map(function (i) { return 'page-' + String(i + 1).padStart(3, '0') + '.pdf'; });
		setBusy(true); setStatus('Splitting ' + groups.length + ' page(s)…');
		engine.splitToZip(groups, state.sources, 'split-pages.zip', function (d, t) { setStatus('Splitting ' + d + '/' + t + '…'); }, names, { doc: state.doc, totalForNumbers: groups.length })
			.then(function () { announce('Split into ' + groups.length + ' files.'); })
			.catch(function () { setStatus('Split failed.', true); })
			.then(function () { setBusy(false); });
	}
	function exportAll() {
		if (busy || !core.canExport(state)) return;
		syncActiveEditor();
		setBusy(true); setStatus('Building PDF…');
		engine.assembleAndDownload(state.pages, state.sources, 'edited.pdf', { doc: state.doc, totalForNumbers: state.pages.length })
			.then(function () { announce('Downloaded edited.pdf'); })
			.catch(function () { setStatus('Export failed.', true); })
			.then(function () { setBusy(false); });
	}

	function renderPanel() {
		var sel = editor ? editor.getSelected() : null;
		if (sel) { renderObjectProps(sel); return; }
		els.panel.innerHTML =
			'<div class="pdfedit-panel-sec"><label class="pdfedit-field"><span>Select pages</span>' +
			'<input type="text" id="pdfeditRange" placeholder="e.g. 1-3,5"></label>' +
			'<button type="button" class="pdfedit-btn" id="pdfeditApplyRange">Apply</button>' +
			'<p class="pdfedit-help">For Extract / Split, or Shift/Ctrl-click thumbnails.</p></div>' +
			'<div class="pdfedit-panel-sec"><label class="pdfedit-field"><input type="checkbox" id="pdfeditWmOn"> Watermark</label>' +
			'<input type="text" id="pdfeditWmText" placeholder="CONFIDENTIAL" value="' + escAttr(state.doc.watermark.text) + '">' +
			'<label class="pdfedit-field"><span>Opacity</span><input type="range" id="pdfeditWmOpacity" min="5" max="80" value="' + Math.round(state.doc.watermark.opacity * 100) + '"></label></div>' +
			'<div class="pdfedit-panel-sec"><label class="pdfedit-field"><input type="checkbox" id="pdfeditPnOn"> Page numbers</label>' +
			'<select id="pdfeditPnFormat"><option value="plain">1</option><option value="page">Page 1</option><option value="of">1 / N</option></select></div>' +
			'<div class="pdfedit-panel-sec" id="pdfeditForm"></div>' +
			'<div class="pdfedit-panel-sec" id="pdfeditLayers"></div>';
		document.getElementById('pdfeditWmOn').checked = state.doc.watermark.enabled;
		document.getElementById('pdfeditPnOn').checked = state.doc.pageNumbers.enabled;
		document.getElementById('pdfeditPnFormat').value = state.doc.pageNumbers.format;
		document.getElementById('pdfeditApplyRange').addEventListener('click', applyRange);
		document.getElementById('pdfeditWmOn').addEventListener('change', function (e) { state.doc.watermark.enabled = e.target.checked; refreshDocPreviews(); });
		document.getElementById('pdfeditWmText').addEventListener('input', function (e) { state.doc.watermark.text = e.target.value; refreshDocPreviews(); });
		document.getElementById('pdfeditWmOpacity').addEventListener('input', function (e) { state.doc.watermark.opacity = e.target.value / 100; refreshDocPreviews(); });
		document.getElementById('pdfeditPnOn').addEventListener('change', function (e) { state.doc.pageNumbers.enabled = e.target.checked; refreshDocPreviews(); });
		document.getElementById('pdfeditPnFormat').addEventListener('change', function (e) { state.doc.pageNumbers.format = e.target.value; refreshDocPreviews(); });
		renderFormSection();
		renderLayers();
	}
	function renderLayers() {
		var host = document.getElementById('pdfeditLayers'); if (!host || !editor) { return; }
		var layers = editor.getLayers();
		if (!layers.length) { host.innerHTML = '<strong>Layers</strong><p class="pdfedit-help">No objects on this page yet.</p>'; return; }
		var html = '<strong>Layers</strong>';
		layers.forEach(function (L) {
			html += '<div class="pdfedit-layer" data-id="' + L.id + '" tabindex="0" role="button" aria-label="Layer: ' + escAttr(L.label) + (L.visible ? '' : ', hidden') + (L.locked ? ', locked' : '') + '">' +
				'<span class="pdfedit-layer-label">' + escHtml(L.label) + '</span><span class="pdfedit-layer-acts">' +
				'<button type="button" data-act="up" aria-label="Move layer up">' + icon('up') + '</button>' +
				'<button type="button" data-act="down" aria-label="Move layer down">' + icon('down') + '</button>' +
				'<button type="button" data-act="vis" aria-label="Toggle visibility">' + icon(L.visible ? 'eye' : 'eyeOff') + '</button>' +
				'<button type="button" data-act="lock" aria-label="Toggle lock">' + icon(L.locked ? 'lock' : 'unlock') + '</button>' +
				'<button type="button" data-act="del" aria-label="Delete layer">' + icon('trash') + '</button></span></div>';
		});
		host.innerHTML = html;
		Array.prototype.forEach.call(host.querySelectorAll('.pdfedit-layer'), function (row) {
			var id = row.dataset.id;
			row.addEventListener('click', function (e) { if (e.target.dataset.act) { return; } editor.selectLayerById(id); renderPanel(); });
			Array.prototype.forEach.call(row.querySelectorAll('[data-act]'), function (b) {
				b.addEventListener('click', function (e) {
					e.stopPropagation();
					var act = b.dataset.act;
					if (act === 'up') { editor.moveLayer(id, 'up'); }
					else if (act === 'down') { editor.moveLayer(id, 'down'); }
					else if (act === 'vis') { editor.toggleVisibleById(id); }
					else if (act === 'lock') { editor.toggleLockById(id); }
					else if (act === 'del') { editor.removeById(id); }
					renderLayers();
				});
			});
		});
	}
	function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
	function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

	// --- Phase 4: AcroForm fill ---
	function singleFormSource() {
		var ids = Object.keys(state.sources);
		if (ids.length !== 1) { return null; }
		var src = state.sources[ids[0]];
		return (src && src.form && src.form.hasForm) ? src : null;
	}
	function renderFormSection() {
		var host = document.getElementById('pdfeditForm'); if (!host) { return; }
		var src = singleFormSource();
		if (!src) { host.innerHTML = ''; return; }
		var html = '<strong>Form fields</strong>';
		if (src.form.hasXFA) { html += '<p class="pdfedit-help pdfedit-error">This PDF uses XFA (dynamic) forms; field filling may be limited.</p>'; }
		src.form.fields.forEach(function (f, i) {
			var id = 'pdfeditFf' + i;
			var cur = (f.name in formValues) ? formValues[f.name] : f.value;
			html += '<label class="pdfedit-field" for="' + id + '"><span>' + escHtml(f.name) + '</span>';
			if (f.type === 'checkbox') {
				html += '<input type="checkbox" id="' + id + '" data-fname="' + escAttr(f.name) + '"' + (cur ? ' checked' : '') + '>';
			} else if (f.options) {
				html += '<select id="' + id + '" data-fname="' + escAttr(f.name) + '"><option value=""></option>';
				f.options.forEach(function (opt) { html += '<option value="' + escAttr(opt) + '"' + (String(cur) === String(opt) ? ' selected' : '') + '>' + escHtml(opt) + '</option>'; });
				html += '</select>';
			} else {
				html += '<input type="text" id="' + id + '" data-fname="' + escAttr(f.name) + '" value="' + escAttr(cur) + '">';
			}
			html += '</label>';
		});
		html += '<button type="button" class="pdfedit-btn pdfedit-btn-primary" id="pdfeditFillForm">Download filled form (flattened)</button>';
		host.innerHTML = html;
		Array.prototype.forEach.call(host.querySelectorAll('[data-fname]'), function (inp) {
			var ev = (inp.type === 'checkbox' || inp.tagName === 'SELECT') ? 'change' : 'input';
			inp.addEventListener(ev, function () { formValues[inp.dataset.fname] = inp.type === 'checkbox' ? inp.checked : inp.value; });
		});
		document.getElementById('pdfeditFillForm').addEventListener('click', downloadFilledForm);
	}
	function downloadFilledForm() {
		var src = singleFormSource(); if (!src || busy) { return; }
		src.form.fields.forEach(function (f) { if (!(f.name in formValues)) { formValues[f.name] = f.value; } });
		setBusy(true); setStatus('Filling form…');
		engine.fillAndFlatten(src.formBytes, formValues)
			.then(function (bytes) { engine.downloadBytes(bytes, 'filled-form.pdf'); announce('Downloaded filled-form.pdf'); })
			.catch(function () { setStatus('Form fill failed.', true); })
			.then(function () { setBusy(false); });
	}
	function applyRange() {
		var raw = document.getElementById('pdfeditRange').value;
		try {
			var oneBased = core.parsePageRange(raw, state.pages.length);
			Object.keys(selected).forEach(function (k) { delete selected[k]; });
			oneBased.forEach(function (nn) { selected[state.pages[nn - 1].uid] = true; });
			renderRail(); renderToolbar(); announce('Selected ' + oneBased.length + ' page(s).');
		} catch (err) { setStatus(err.message, true); }
	}
	function renderObjectProps(sel) {
		var p = sel.props, rows = '';
		if (p.fill !== undefined) { rows += colorRow('Fill', 'fill', p.fill); }
		// Show stroke controls only when the object actually HAS a stroke — the color
		// input can't display "none" (it showed black), and touching it applied a real
		// black border to stroke-less objects like the whiteout.
		if (p.stroke) {
			rows += colorRow('Stroke', 'stroke', p.stroke);
			if (p.strokeWidth !== undefined) { rows += rangeRow('Stroke width', 'strokeWidth', p.strokeWidth, 0, 12); }
		}
		if (p.fontSize !== undefined) { rows += rangeRow('Font size', 'fontSize', p.fontSize, 8, 96); }
		rows += rangeRow('Opacity', 'opacity', Math.round((p.opacity == null ? 1 : p.opacity) * 100), 5, 100);
		var alignBar = '<div class="pdfedit-align"><span>Align</span>' +
			'<button type="button" data-align="left" aria-label="Align left">' + icon('alignL') + '</button>' +
			'<button type="button" data-align="centerH" aria-label="Align center horizontally">' + icon('alignCH') + '</button>' +
			'<button type="button" data-align="right" aria-label="Align right">' + icon('alignR') + '</button>' +
			'<button type="button" data-align="top" aria-label="Align top">' + icon('alignT') + '</button>' +
			'<button type="button" data-align="centerV" aria-label="Align middle vertically">' + icon('alignCV') + '</button>' +
			'<button type="button" data-align="bottom" aria-label="Align bottom">' + icon('alignB') + '</button></div>';
		var ao = editor && editor.canvas.getActiveObject();
		var selCount = (ao && ao.type === 'activeSelection') ? ao.getObjects().length : 1;
		var distBar = selCount >= 3 ? '<div class="pdfedit-align"><span>Distribute</span>' +
			'<button type="button" data-dist="h" aria-label="Distribute horizontally">' + icon('distH') + '</button>' +
			'<button type="button" data-dist="v" aria-label="Distribute vertically">' + icon('distV') + '</button></div>' : '';
		els.panel.innerHTML = '<div class="pdfedit-panel-sec"><button type="button" class="pdfedit-link" id="pdfeditBackLayers">← Layers</button>' +
			'<strong>' + sel.type + '</strong>' + rows + alignBar + distBar + '</div>';
		bindPropRows();
		Array.prototype.forEach.call(els.panel.querySelectorAll('[data-align]'), function (b) { b.addEventListener('click', function () { editor.align(b.dataset.align); }); });
		Array.prototype.forEach.call(els.panel.querySelectorAll('[data-dist]'), function (b) { b.addEventListener('click', function () { editor.distribute(b.dataset.dist); }); });
		document.getElementById('pdfeditBackLayers').addEventListener('click', function () { if (editor) { editor.canvas.discardActiveObject(); editor.canvas.requestRenderAll(); } renderPanel(); });
	}
	function colorRow(label, name, val) { return '<label class="pdfedit-field"><span>' + label + '</span><input type="color" data-prop="' + name + '" value="' + toHex(val) + '"></label>'; }
	function rangeRow(label, name, val, min, max) { return '<label class="pdfedit-field"><span>' + label + '</span><input type="range" data-prop="' + name + '" min="' + min + '" max="' + max + '" value="' + val + '"></label>'; }
	function toHex(v) { if (!v || v === 'rgba(0,0,0,0)') { return '#000000'; } if (v[0] === '#') { return v.slice(0, 7); } var m = v.match(/\d+/g); if (!m) { return '#000000'; } return '#' + m.slice(0, 3).map(function (x) { return ('0' + parseInt(x, 10).toString(16)).slice(-2); }).join(''); }
	function bindPropRows() {
		Array.prototype.forEach.call(els.panel.querySelectorAll('[data-prop]'), function (inp) {
			inp.addEventListener('input', function () {
				var name = inp.dataset.prop, v = inp.value;
				if (name === 'opacity') { v = inp.value / 100; }
				else if (inp.type === 'range') { v = parseFloat(inp.value); }
				if (editor) { editor.setProp(name, v); }
			});
		});
	}

	// Fullscreen: native Fullscreen API on the tool card, with a fixed-position CSS
	// fallback (.is-max) where the API is unavailable. Re-fit the active page either way.
	// Debounced refit: wait for the fullscreen/resize layout to SETTLE before
	// re-measuring (measuring inside the fullscreenchange event reads stale
	// dimensions -> stretched pages). Skips while the user is typing in a text
	// object so a mobile soft-keyboard resize doesn't kick them out of editing.
	var refitTimer = null;
	function refitActive() {
		if (!(activeUid && pageByUid(activeUid) >= 0)) { return; }
		if (editor) { var ao = editor.canvas.getActiveObject(); if (ao && ao.isEditing) { return; } }
		clearTimeout(refitTimer);
		refitTimer = setTimeout(function () { setActive(activeUid); }, 150);
	}
	// CSS maximize instead of the native Fullscreen API: on some platforms (notably
	// Chrome on Linux) element-fullscreen leaves a stale, STRETCHED compositor frame
	// of the card until something external forces a repaint (e.g. a screenshot tool) —
	// the DOM/layout is correct but the on-screen picture is stale. A fixed-position
	// overlay stays in the normal rendering path: same result, none of the platform
	// compositing bugs, and deterministic to test.
	function isMaximized() { var card = document.querySelector('.pdfedit-tool-card'); return !!(card && card.classList.contains('is-max')); }
	var cardHome = null; // the card's original DOM position, to restore after maximize
	function toggleFullscreen() {
		var card = document.querySelector('.pdfedit-tool-card');
		if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} } // leave any native fullscreen
		var on = !card.classList.contains('is-max');
		if (on) {
			// Portal: the theme's .site-wrap (position:relative; z-index:1) creates a stacking
			// context that CONFINES the card's z-index — the site header paints above the
			// maximized card no matter how high our z-index is. Reparent to <body> while
			// maximized to escape it; element references, listeners and canvas bitmaps all
			// survive a same-document move, and the refit re-renders the page anyway.
			cardHome = { parent: card.parentNode, next: card.nextSibling };
			document.body.appendChild(card);
		} else if (cardHome) {
			cardHome.parent.insertBefore(card, cardHome.next);
			cardHome = null;
		}
		card.classList.toggle('is-max', on);
		document.documentElement.classList.toggle('pdfedit-noscroll', on); // lock background scroll while maximized
		renderToolbar();   // reflect the new state on the button label
		refitActive();
	}
	window.addEventListener('resize', refitActive); // self-healing on any size change (rotation, window resize)

	// Mobile drawers (≤900px): slide-in rail/panel with focus management.
	var openDrawer = null;
	function toggleDrawer(which) {
		var el = which === 'rail' ? els.rail : els.panel;
		if (openDrawer === which) { closeDrawer(); return; }
		closeDrawer();
		el.classList.add('is-open'); openDrawer = which;
		var first = el.querySelector('button, input, [tabindex]'); if (first) first.focus();
		document.addEventListener('keydown', escClose);
	}
	function closeDrawer() {
		if (!openDrawer) return;
		(openDrawer === 'rail' ? els.rail : els.panel).classList.remove('is-open');
		openDrawer = null; document.removeEventListener('keydown', escClose);
	}
	function escClose(e) { if (e.key === 'Escape') { closeDrawer(); } }

	// Clicking the empty pane area (outside the page) deselects — so the selection
	// outline/handles vanish and you see the true result (e.g. a borderless whiteout).
	els.canvasWrap.addEventListener('click', function (e) {
		if (!editor) { return; }
		if (e.target === els.canvasWrap || (e.target.classList && e.target.classList.contains('pdfedit-page-stack'))) {
			editor.canvas.discardActiveObject(); editor.canvas.requestRenderAll(); renderPanel();
		}
	});

	// Drag-drop onto the card + file input.
	var card = document.querySelector('.pdfedit-tool-card');
	['dragover', 'dragenter'].forEach(function (ev) { card.addEventListener(ev, function (e) { e.preventDefault(); card.classList.add('is-drag'); }); });
	['dragleave', 'drop'].forEach(function (ev) { card.addEventListener(ev, function (e) { e.preventDefault(); card.classList.remove('is-drag'); }); });
	card.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) { importFiles(e.dataTransfer.files); } });
	els.fileInput.addEventListener('change', function () { if (els.fileInput.files.length) { importFiles(els.fileInput.files); els.fileInput.value = ''; } });

	// Esc exits maximize — registered BEFORE the editor shortcut handler so that when an
	// object is selected, the first Esc only deselects (handled below) and a second Esc exits.
	// Works with no editor too (you can maximize before adding a file).
	document.addEventListener('keydown', function (e) {
		if (e.key !== 'Escape' || !isMaximized()) { return; }
		if (editor && editor.canvas.getActiveObject()) { return; } // this press deselects; next one exits
		toggleFullscreen();
	});

	// Keyboard shortcuts (active only with a live editor and not while typing in a field/text object).
	document.addEventListener('keydown', function (e) {
		if (!editor) { return; }
		var tgt = e.target;
		if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) { return; }
		var ao = editor.canvas.getActiveObject();
		if (ao && ao.isEditing) { return; } // editing IText
		var meta = e.ctrlKey || e.metaKey, k = e.key;
		if (meta && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) { if (core.canRedo(state)) { doRedo(); } } else if (core.canUndo(state)) { doUndo(); } return; }
		if (meta && (k === 'y' || k === 'Y')) { e.preventDefault(); if (core.canRedo(state)) { doRedo(); } return; }
		if (meta && (k === 'd' || k === 'D')) { e.preventDefault(); editor.duplicateSelected(); return; }
		if (k === 'Delete' || k === 'Backspace') { if (ao) { e.preventDefault(); editor.deleteSelected(); } return; }
		if (k === 'Escape') { editor.canvas.discardActiveObject(); editor.canvas.requestRenderAll(); renderPanel(); return; }
		if (k === '[') { editor.sendBackward(); return; }
		if (k === ']') { editor.bringForward(); return; }
		if (ao && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown')) {
			e.preventDefault();
			var step = e.shiftKey ? 10 : 1;
			editor.nudge(k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0);
		}
	});

	renderEmptyState();
	renderToolbar();
})();
