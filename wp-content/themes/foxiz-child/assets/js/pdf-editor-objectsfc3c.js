(function () {
	'use strict';
	var ASSET_BASE = (typeof window !== 'undefined' && window.PDFEDIT_ASSET_BASE) || '';
	var fabricPromise = null;

	function loadScript(src) {
		return new Promise(function (resolve, reject) {
			var s = document.createElement('script');
			s.src = src; s.onload = function () { resolve(); };
			s.onerror = function () { reject(new Error('Failed to load ' + src)); };
			document.head.appendChild(s);
		});
	}
	function load() {
		if (fabricPromise) { return fabricPromise; }
		fabricPromise = loadScript(ASSET_BASE + '/assets/js/vendor/fabric/fabric.min.js').then(function () {
			if (!window.fabric || typeof window.fabric.Canvas !== 'function') {
				throw new Error('fabric did not initialise (window.fabric missing).');
			}
			return window.fabric;
		});
		return fabricPromise;
	}

	var PREVIEW_KEY = '__pdfeditPreview'; // marks locked preview objects excluded from serialize

	function createEditor(canvasEl, opts) {
		var fabric = window.fabric;
		var c = new fabric.Canvas(canvasEl, { preserveObjectStacking: true, selection: true });
		// Backstore (drawing resolution) = backdrop display pixels; zoom maps object
		// coordinates into PDF point-space. Page point-aspect == backdrop pixel-aspect,
		// so one zoom is correct on both axes.
		c.setDimensions({ width: opts.displayW, height: opts.displayH });
		c.setZoom(opts.displayW / opts.widthPt);
		var objSeq = 0;
		var loading = false;   // suppress change events while loadFromJSON repopulates objects

		function fireChange() { if (!loading && opts.onChange) { opts.onChange(serialize()); } }
		c.on('object:added', function (e) {
			var o = e.target;
			if (o && o[PREVIEW_KEY]) { return; }
			if (o && !o.id) { o.id = 'o' + (++objSeq); }   // stable id for the layers panel
			fireChange();
		});
		c.on('object:removed', function (e) { if (e.target && e.target[PREVIEW_KEY]) { return; } fireChange(); });
		c.on('object:modified', fireChange);
		c.on('path:created', fireChange);
		// Commit typed text once when editing ends (not per keystroke) — one undo entry per edit.
		// In-progress text is still captured on page switch/export via the editor's serialize().
		c.on('editing:exited', fireChange);

		if (opts.json) {
			loading = true;
			c.loadFromJSON(opts.json, function () {
				c.getObjects().forEach(function (o) { var m = o.id && /^o(\d+)$/.exec(o.id); if (m) { objSeq = Math.max(objSeq, parseInt(m[1], 10)); } });
				loading = false;          // re-enable change events AFTER all objects are restored
				c.requestRenderAll();
			});
		}

		c.targetFindTolerance = 8; // easier selection of thin objects (lines, ink)

		function center() { return { left: opts.widthPt / 2, top: opts.heightPt / 2 }; }
		function add(obj) { obj.set(center()); obj.setCoords(); c.add(obj); c.setActiveObject(obj); c.requestRenderAll(); return obj; }

		function addText() {
			// Default size scales with the page (18pt was unreadably small at fit-zoom),
			// and we enter typing mode immediately with the placeholder selected so the
			// user's keystrokes replace it — no double-click needed first.
			var fs = Math.min(48, Math.max(18, Math.round(opts.widthPt * 0.045)));
			var t = add(new fabric.IText('Type here', { fontSize: fs, fill: '#111111', originX: 'center', originY: 'center', fontFamily: 'Helvetica' }));
			t.enterEditing(); t.selectAll(); c.requestRenderAll();
			return t;
		}
		function addWhiteout() {
			// "Erase": an opaque cover rectangle — the original PDF content is immutable,
			// so erasing = covering. Fill is editable in the inspector to match non-white pages.
			return add(new fabric.Rect({ width: 140, height: 60, fill: '#ffffff', stroke: null, originX: 'center', originY: 'center' }));
		}
		function addRect() { return add(new fabric.Rect({ width: 120, height: 70, fill: 'rgba(0,0,0,0)', stroke: '#111111', strokeWidth: 2, originX: 'center', originY: 'center' })); }
		function addEllipse() { return add(new fabric.Ellipse({ rx: 60, ry: 40, fill: 'rgba(0,0,0,0)', stroke: '#111111', strokeWidth: 2, originX: 'center', originY: 'center' })); }
		function addLine() { var cx = opts.widthPt / 2, cy = opts.heightPt / 2; return add(new fabric.Line([cx - 60, cy, cx + 60, cy], { stroke: '#111111', strokeWidth: 2, originX: 'center', originY: 'center' })); }
		function addHighlight() { return add(new fabric.Rect({ width: 160, height: 22, fill: 'rgba(255,235,59,0.45)', stroke: null, originX: 'center', originY: 'center' })); }
		function addTypedSignature(text) { return add(new fabric.IText(text || 'Signature', { fontSize: 28, fill: '#0b3d91', fontStyle: 'italic', fontFamily: 'Georgia', originX: 'center', originY: 'center' })); }
		function addSignaturePath(pathData) { return add(new fabric.Path(pathData, { fill: null, stroke: '#0b3d91', strokeWidth: 2, originX: 'center', originY: 'center' })); }

		function addImageFromFile(file) {
			return new Promise(function (resolve, reject) {
				var reader = new FileReader();
				reader.onload = function () {
					fabric.Image.fromURL(reader.result, function (img) {
						var max = opts.widthPt * 0.5;
						if (img.width > max) { img.scaleToWidth(max); }
						img.set(center()); img.setCoords(); c.add(img); c.setActiveObject(img); c.requestRenderAll();
						fireChange(); resolve(img);
					});
				};
				reader.onerror = reject; reader.readAsDataURL(file);
			});
		}

		function startPen() { c.isDrawingMode = true; c.freeDrawingBrush.color = '#111111'; c.freeDrawingBrush.width = 2; }
		function stopPen() { c.isDrawingMode = false; }

		function deleteSelected() { c.getActiveObjects().forEach(function (o) { c.remove(o); }); c.discardActiveObject(); c.requestRenderAll(); fireChange(); }
		function duplicateSelected() {
			var o = c.getActiveObject(); if (!o) { return; }
			o.clone(function (cl) { cl.set({ left: o.left + 12, top: o.top + 12 }); c.add(cl); c.setActiveObject(cl); c.requestRenderAll(); fireChange(); });
		}
		function bringForward() { var o = c.getActiveObject(); if (o) { c.bringForward(o); c.requestRenderAll(); fireChange(); } }
		function sendBackward() { var o = c.getActiveObject(); if (o) { c.sendBackwards(o); c.requestRenderAll(); fireChange(); } }

		var PANEL_PROPS = ['fill', 'stroke', 'strokeWidth', 'opacity', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'textAlign'];
		function getSelected() {
			var o = c.getActiveObject(); if (!o) { return null; }
			var props = {}; PANEL_PROPS.forEach(function (k) { if (o[k] !== undefined) { props[k] = o[k]; } });
			return { type: o.type, props: props };
		}
		function setProp(name, value) { c.getActiveObjects().forEach(function (o) { o.set(name, value); }); c.requestRenderAll(); fireChange(); }

		function clearPreviewKind(kind) { c.getObjects().slice().forEach(function (o) { if (o[PREVIEW_KEY] === kind) { c.remove(o); } }); }
		function setWatermarkPreview(cfg) {
			clearPreviewKind('wm');
			if (cfg && cfg.enabled) {
				var t = new fabric.IText(cfg.text || 'WATERMARK', { fontSize: Math.max(24, opts.widthPt / 10), fill: cfg.color || '#ff3b30', opacity: cfg.opacity, angle: -45, originX: 'center', originY: 'center', left: opts.widthPt / 2, top: opts.heightPt / 2, selectable: false, evented: false });
				t[PREVIEW_KEY] = 'wm'; c.add(t);
			}
			c.requestRenderAll();
		}
		function setPageNumberPreview(text) {
			clearPreviewKind('pn');
			if (text) {
				var t = new fabric.IText(text, { fontSize: 12, fill: '#111111', left: opts.widthPt - 60, top: opts.heightPt - 28, selectable: false, evented: false });
				t[PREVIEW_KEY] = 'pn'; c.add(t);
			}
			c.requestRenderAll();
		}

		function serialize() {
			var json = c.toJSON(['id', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'lockScalingX', 'lockScalingY', 'lockRotation', PREVIEW_KEY]);
			json.objects = (json.objects || []).filter(function (o) { return !o[PREVIEW_KEY]; });
			return JSON.stringify(json);
		}
		function dispose() { c.dispose(); }

		// --- Phase 3: layers + alignment ---
		function realObjects() { return c.getObjects().filter(function (o) { return !o[PREVIEW_KEY]; }); }
		function labelFor(o) {
			var t = o.type;
			if (t === 'i-text' || t === 'text' || t === 'textbox') { return 'Text: ' + String(o.text || '').slice(0, 18); }
			if (t === 'image') { return 'Image'; }
			if (t === 'rect') {
				if (o.opacity != null && o.opacity < 0.6) { return 'Highlight'; }
				if (!o.stroke && String(o.fill).toLowerCase() === '#ffffff') { return 'Whiteout'; }
				return 'Rectangle';
			}
			if (t === 'ellipse') { return 'Ellipse'; }
			if (t === 'line') { return 'Line'; }
			if (t === 'path') { return 'Ink'; }
			return t || 'Object';
		}
		function getLayers() {
			return realObjects().slice().reverse().map(function (o) {
				return { id: o.id, type: o.type, label: labelFor(o), visible: o.visible !== false, locked: o.selectable === false };
			});
		}
		function byId(id) { var a = realObjects(); for (var i = 0; i < a.length; i++) { if (a[i].id === id) { return a[i]; } } return null; }
		function selectLayerById(id) { var o = byId(id); if (o && o.selectable !== false) { c.setActiveObject(o); c.requestRenderAll(); } }
		function toggleVisibleById(id) { var o = byId(id); if (o) { o.visible = (o.visible === false); c.requestRenderAll(); fireChange(); } }
		function toggleLockById(id) {
			var o = byId(id); if (!o) { return; }
			var lock = o.selectable !== false; // currently unlocked -> lock
			o.selectable = !lock; o.evented = !lock;
			o.lockMovementX = o.lockMovementY = o.lockScalingX = o.lockScalingY = o.lockRotation = lock;
			if (lock && c.getActiveObject() === o) { c.discardActiveObject(); }
			c.requestRenderAll(); fireChange();
		}
		function removeById(id) { var o = byId(id); if (o) { c.remove(o); c.requestRenderAll(); fireChange(); } }
		function moveLayer(id, dir) { var o = byId(id); if (!o) { return; } if (dir === 'up') { c.bringForward(o); } else { c.sendBackwards(o); } c.requestRenderAll(); fireChange(); }

		function activeList() { var a = c.getActiveObject(); if (!a) { return []; } if (a.type === 'activeSelection') { return a.getObjects().slice(); } return [a]; }
		function align(mode) {
			var objs = activeList(); if (!objs.length) { return; }
			c.discardActiveObject();   // restore absolute coords for any grouped children
			objs.forEach(function (o) {
				var b = o.getBoundingRect(true);   // point-space, ignores viewport zoom
				if (mode === 'left') { o.left += (0 - b.left); }
				else if (mode === 'right') { o.left += (opts.widthPt - (b.left + b.width)); }
				else if (mode === 'centerH') { o.left += ((opts.widthPt - b.width) / 2 - b.left); }
				else if (mode === 'top') { o.top += (0 - b.top); }
				else if (mode === 'bottom') { o.top += (opts.heightPt - (b.top + b.height)); }
				else if (mode === 'centerV') { o.top += ((opts.heightPt - b.height) / 2 - b.top); }
				o.setCoords();
			});
			c.requestRenderAll(); fireChange();
		}
		function distribute(axis) {
			var objs = activeList(); if (objs.length < 3) { return; }
			c.discardActiveObject();
			var items = objs.map(function (o) { var b = o.getBoundingRect(true); return { o: o, c: axis === 'h' ? b.left + b.width / 2 : b.top + b.height / 2 }; }).sort(function (a, b) { return a.c - b.c; });
			var first = items[0].c, last = items[items.length - 1].c, step = (last - first) / (items.length - 1);
			items.forEach(function (it, i) { var delta = (first + step * i) - it.c; if (axis === 'h') { it.o.left += delta; } else { it.o.top += delta; } it.o.setCoords(); });
			c.requestRenderAll(); fireChange();
		}

		function nudge(dx, dy) { var a = c.getActiveObject(); if (!a) { return; } a.left += dx; a.top += dy; a.setCoords(); c.requestRenderAll(); fireChange(); }
		function hasSelection() { return !!c.getActiveObject(); }

		return {
			canvas: c, addText: addText, addRect: addRect, addEllipse: addEllipse, addLine: addLine,
			addWhiteout: addWhiteout,
			addHighlight: addHighlight, addTypedSignature: addTypedSignature, addSignaturePath: addSignaturePath,
			addImageFromFile: addImageFromFile, startPen: startPen, stopPen: stopPen,
			deleteSelected: deleteSelected, duplicateSelected: duplicateSelected, bringForward: bringForward, sendBackward: sendBackward,
			getSelected: getSelected, setProp: setProp, setWatermarkPreview: setWatermarkPreview, setPageNumberPreview: setPageNumberPreview,
			getLayers: getLayers, selectLayerById: selectLayerById, toggleVisibleById: toggleVisibleById, toggleLockById: toggleLockById,
			removeById: removeById, moveLayer: moveLayer, align: align, distribute: distribute, nudge: nudge, hasSelection: hasSelection,
			serialize: serialize, dispose: dispose
		};
	}

	function parseFillColor(f) {
		if (typeof f !== 'string') { return null; }
		var m = f.match(/^#([0-9a-f]{6})$/i);
		if (m) { var n = parseInt(m[1], 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; }
		m = f.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
		if (m) { var a = m[4] === undefined ? 1 : parseFloat(m[4]); if (a < 0.99) { return null; } return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255 }; }
		return null;
	}

	// Partition a page's objects: axis-aligned opaque cover rects (whiteouts) are pulled
	// out so the engine can draw them as NATIVE VECTOR rectangles — inside the raster
	// overlay their edges blend with transparent (black) neighbor pixels when real PDF
	// viewers (poppler/PDFium) scale the image, leaving a faint gray hairline around the
	// box. Vector fills have no edges to blend: crisp at any zoom, in any viewer.
	// Returns { covers: [{left,top,width,height,color}], restJson } (coords in page points).
	function extractCoverRects(json) {
		var out = { covers: [], restJson: json };
		var parsed; try { parsed = json ? JSON.parse(json) : null; } catch (e) { return out; }
		if (!parsed || !parsed.objects || !parsed.objects.length) { return out; }
		var keep = [];
		parsed.objects.forEach(function (o) {
			var color = (o.type === 'rect' && !o.stroke && (o.opacity == null || o.opacity >= 0.99) && (!o.angle || o.angle % 360 === 0)) ? parseFillColor(o.fill) : null;
			if (!color) { keep.push(o); return; }
			var w = (o.width || 0) * (o.scaleX || 1), h = (o.height || 0) * (o.scaleY || 1);
			var left = o.left || 0, top = o.top || 0;
			if (o.originX === 'center') { left -= w / 2; } else if (o.originX === 'right') { left -= w; }
			if (o.originY === 'center') { top -= h / 2; } else if (o.originY === 'bottom') { top -= h; }
			// Expand 0.5pt per side: two ABUTTING covers otherwise show a conflation seam
			// (AA at the shared edge lets the underlying content through). Coverage may
			// grow half a point — it must never shrink.
			var E = 0.5;
			out.covers.push({ left: left - E, top: top - E, width: w + 2 * E, height: h + 2 * E, color: color });
		});
		parsed.objects = keep;
		out.restJson = keep.length ? JSON.stringify(parsed) : null;
		return out;
	}

	// Offscreen overlay: a transparent StaticCanvas in page-point space (zoomed by `scale`),
	// loaded with the page objects + the watermark/page-number, returned as a PNG data URL.
	function renderOverlayPng(widthPt, heightPt, json, watermarkCfg, pageNumberText, scale) {
		var fabric = window.fabric;
		var hasObjects = false;
		try { var parsed = json ? JSON.parse(json) : null; hasObjects = !!(parsed && parsed.objects && parsed.objects.length); } catch (e) { hasObjects = false; }
		var hasWm = !!(watermarkCfg && watermarkCfg.enabled);
		var hasPn = !!pageNumberText;
		if (!hasObjects && !hasWm && !hasPn) { return Promise.resolve(null); }

		return new Promise(function (resolve) {
			var el = document.createElement('canvas');
			var sc = new fabric.StaticCanvas(el, { width: widthPt * scale, height: heightPt * scale, backgroundColor: null });
			sc.setZoom(scale);
			// Opaque cover rects (whiteout): snap their edges OUTWARD to the device-pixel
			// grid. Fractional edges antialias into semi-transparent pixels, so underlying
			// content ghosts through as a faint hairline (and adjacent whiteouts show a
			// seam). floor/ceil expands by <=1px — coverage never shrinks.
			function snapCoverRects() {
				sc.getObjects().forEach(function (o) {
					if (o.type !== 'rect' || o.stroke) { return; }
					if (o.opacity != null && o.opacity < 0.99) { return; }   // highlights stay as-is
					if (o.angle && o.angle % 360 !== 0) { return; }           // only axis-aligned
					var br = o.getBoundingRect(true, true);                   // object-space (pt)
					var x0 = Math.floor(br.left * scale) / scale, y0 = Math.floor(br.top * scale) / scale;
					var x1 = Math.ceil((br.left + br.width) * scale) / scale, y1 = Math.ceil((br.top + br.height) * scale) / scale;
					o.set({ originX: 'left', originY: 'top', left: x0, top: y0, width: x1 - x0, height: y1 - y0, scaleX: 1, scaleY: 1 });
					o.setCoords();
				});
			}
			function finish() {
				snapCoverRects();
				if (hasWm) {
					sc.add(new fabric.IText(watermarkCfg.text || 'WATERMARK', { fontSize: Math.max(24, widthPt / 10), fill: watermarkCfg.color || '#ff3b30', opacity: watermarkCfg.opacity, angle: -45, originX: 'center', originY: 'center', left: widthPt / 2, top: heightPt / 2 }));
				}
				if (hasPn) {
					sc.add(new fabric.IText(pageNumberText, { fontSize: 12, fill: '#111111', left: widthPt - 60, top: heightPt - 28 }));
				}
				sc.renderAll();
				var url = sc.toDataURL({ format: 'png', multiplier: 1 });
				sc.dispose();
				resolve(url);
			}
			if (hasObjects) { sc.loadFromJSON(json, function () { finish(); }); } else { finish(); }
		});
	}

	window.PDFEditor = window.PDFEditor || {};
	window.PDFEditor.objects = { load: load, createEditor: createEditor, renderOverlayPng: renderOverlayPng, extractCoverRects: extractCoverRects };
})();
