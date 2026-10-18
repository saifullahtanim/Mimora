(function () {
	'use strict';

	var ASSET_BASE = (typeof window !== 'undefined' && window.PDFEDIT_ASSET_BASE) || '';
	var scriptPromises = {};
	var pdfLibPromise = null;
	var pdfjsPromise = null;

	function loadScript(src) {
		if (scriptPromises[src]) { return scriptPromises[src]; }
		scriptPromises[src] = new Promise(function (resolve, reject) {
			var s = document.createElement('script');
			s.src = src;
			s.onload = function () { resolve(); };
			s.onerror = function () { reject(new Error('Failed to load ' + src)); };
			document.head.appendChild(s);
		});
		return scriptPromises[src];
	}

	function loadPdfLib() {
		if (pdfLibPromise) { return pdfLibPromise; }
		pdfLibPromise = loadScript(ASSET_BASE + '/assets/js/vendor/pdf-lib/pdf-lib.min.js').then(function () {
			if (!window.PDFLib || typeof window.PDFLib.PDFDocument !== 'function') {
				throw new Error('pdf-lib did not initialise (window.PDFLib missing).');
			}
			return window.PDFLib;
		});
		return pdfLibPromise;
	}

	function loadPdfJs() {
		if (pdfjsPromise) { return pdfjsPromise; }
		pdfjsPromise = import(ASSET_BASE + '/assets/js/vendor/pdfjs/pdf.min.js').then(function (lib) {
			lib.GlobalWorkerOptions.workerSrc = ASSET_BASE + '/assets/js/vendor/pdfjs/pdf.worker.min.js';
			return lib;
		});
		return pdfjsPromise;
	}

	// Fallback string/name detection for the pdfjs path (PasswordException sets a
	// real .name). NOTE: pdf-lib's EncryptedPDFError is NOT detected here — in 1.17.1
	// it reports name==="Error" and is not `instanceof EncryptedPDFError` (a tslib
	// subclass quirk), so we detect pdf-lib encryption structurally via the loaded
	// doc's isEncrypted flag (see below), never via instanceof/.name.
	function isEncryptionError(err) {
		var name = err && err.name ? String(err.name) : '';
		var msg = err && err.message ? String(err.message) : '';
		return /Password/i.test(name) || /Encrypted/i.test(name) || /encrypt|password/i.test(msg);
	}

	// Parse a PDF's bytes with BOTH libraries. Returns a source descriptor.
	// Throws { code:'load'|'encrypted'|'corrupt', message } for the error matrix.
	function parsePdf(bytes, name) {
		var pdfjs, PDFLib;
		// Stage 1: load the engines. A failure here is an ENGINE-LOAD error (404/offline),
		// NOT a bad PDF — keep it distinct so we don't tell users a valid file is corrupt.
		return Promise.all([loadPdfJs(), loadPdfLib()]).then(function (libs) {
			pdfjs = libs[0]; PDFLib = libs[1];
		}, function () {
			throw { code: 'load', message: 'Could not load the PDF engine — check your connection and try again.' };
		}).then(function () {
			// Stage 2: parse. pdfjs detaches its input buffer to the worker -> give it a copy.
			var copy = bytes.slice();
			return pdfjs.getDocument({ data: copy }).promise.then(function (pdfjsDoc) {
				// ignoreEncryption:true lets load() succeed so we can read the robust
				// structural isEncrypted flag; we then reject encrypted docs ourselves.
				return PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true }).then(function (pdflibDoc) {
					if (pdflibDoc.isEncrypted) {
						throw { code: 'encrypted', message: 'This PDF is password-protected. Remove the password and try again.' };
					}
					var n = pdfjsDoc.numPages;
					var sizes = [];
					var chain = Promise.resolve();
					for (var i = 1; i <= n; i++) {
						(function (pageNum) {
							chain = chain.then(function () {
								return pdfjsDoc.getPage(pageNum).then(function (page) {
									// getViewport({scale:1}) bakes in intrinsic /Rotate -> these are
									// DISPLAY dims (swapped at 90/270); page.rotate is the intrinsic angle.
									var vp = page.getViewport({ scale: 1 });
									sizes.push({ width: vp.width, height: vp.height, rotation: page.rotate || 0 });
									// Do NOT page.cleanup(): getPage() returns a shared/cached proxy that
									// renderThumb/renderActive reuse (and may render concurrently); cleaning
									// it up here would tear down data a later/concurrent render still needs.
								});
							});
						})(i);
					}
					return chain.then(function () {
						// Note: we intentionally do NOT keep the original bytes — pdflibDoc holds
						// what assemble() needs, and pdfjs has its own worker-side copy (§9 memory).
						var form = readFormInfo(PDFLib, pdflibDoc); // Phase 4: detect AcroForm fields
						return { name: name, pdfjsDoc: pdfjsDoc, pdflibDoc: pdflibDoc, pageCount: n, sizes: sizes, form: form, formBytes: form.hasForm ? bytes.slice() : null };
					});
				});
			}).catch(function (err) {
				if (err && err.code) { throw err; }          // already-tagged (encrypted) — propagate
				if (isEncryptionError(err)) {                 // pdfjs PasswordException path
					throw { code: 'encrypted', message: 'This PDF is password-protected. Remove the password and try again.' };
				}
				throw { code: 'corrupt', message: "This file doesn't appear to be a valid PDF." };
			});
		});
	}


	var THUMB_TARGET_PX = 180;       // longest edge for rail thumbnails
	var THUMB_MAX_AREA = 4000000;    // ~iOS Safari ceiling guard (16.7M); stay well under
	var ACTIVE_MAX_EDGE = 4096;      // longest edge for the active page render

	// Render one page to a canvas at an absolute rotation. Returns {canvas, blank}.
	function renderPage(pdfjsDoc, pageIndex, rotation, targetLongestPx, maxArea) {
		return pdfjsDoc.getPage(pageIndex + 1).then(function (page) {
			var base = page.getViewport({ scale: 1, rotation: rotation });
			var longest = Math.max(base.width, base.height);
			var scale = targetLongestPx / longest;
			var vp = page.getViewport({ scale: scale, rotation: rotation });
			// Clamp area (oversized canvas returns blank with no error on iOS Safari).
			if (maxArea && vp.width * vp.height > maxArea) {
				var k = Math.sqrt(maxArea / (vp.width * vp.height));
				vp = page.getViewport({ scale: scale * k, rotation: rotation });
			}
			var canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.floor(vp.width));
			canvas.height = Math.max(1, Math.floor(vp.height));
			var ctx = canvas.getContext('2d');
			return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
				// No page.cleanup(): getPage() proxies are shared/cached and the rail can render
				// the same source page concurrently (duplicates, or rail + active view) — calling
				// cleanup() here would race and blank out a sibling render. (§9 caps bound memory.)
				var blank = isCanvasBlank(ctx, canvas.width, canvas.height); // iOS oversized-canvas check
				return { canvas: canvas, blank: blank };
			});
		});
	}

	// Detect ONLY the iOS oversized-canvas failure (a fully TRANSPARENT readback).
	// pdfjs 4.x paints an opaque white page background, so any successfully-rendered
	// page has alpha=255 somewhere — do NOT treat white as blank (white is a legitimate
	// page background). Sample a coarse full-canvas grid, not just the top-left corner.
	function isCanvasBlank(ctx, w, h) {
		try {
			var stepX = Math.max(1, Math.floor(w / 16));
			var stepY = Math.max(1, Math.floor(h / 16));
			for (var y = 0; y < h; y += stepY) {
				for (var x = 0; x < w; x += stepX) {
					if (ctx.getImageData(x, y, 1, 1).data[3] !== 0) { return false; }
				}
			}
			return true; // every sampled pixel transparent => readback failed (oversized canvas)
		} catch (e) { return false; } // tainted-canvas SecurityError etc. -> not blank
	}

	function renderThumb(pdfjsDoc, pageIndex, rotation) {
		return renderPage(pdfjsDoc, pageIndex, rotation, THUMB_TARGET_PX, THUMB_MAX_AREA);
	}
	function renderActive(pdfjsDoc, pageIndex, rotation, targetPx) {
		// targetPx lets the UI request just enough resolution for its display size
		// (e.g. display px x devicePixelRatio) instead of always rendering at the max edge.
		return renderPage(pdfjsDoc, pageIndex, rotation, Math.min(targetPx || ACTIVE_MAX_EDGE, ACTIVE_MAX_EDGE), THUMB_MAX_AREA * 4);
	}

	function yieldToLoop() { return new Promise(function (r) { setTimeout(r, 0); }); }

	var EXPORT_SCALE = 2;

	function dataUrlToUint8(dataUrl) {
		var b64 = dataUrl.split(',')[1];
		var bin = atob(b64);
		var arr = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) { arr[i] = bin.charCodeAt(i); }
		return arr;
	}

	// Does this page need an annotation overlay? (own objects, or a doc watermark, or a page number)
	function overlayNeeded(ref, doc, idx, total) {
		var core = window.PDFEditor.core;
		if (ref.objects) { try { var p = JSON.parse(ref.objects); if (p && p.objects && p.objects.length) { return true; } } catch (e) {} }
		if (doc && doc.watermark && doc.watermark.enabled) { return true; }
		if (doc && doc.pageNumbers && core.pageNumberText(doc.pageNumbers, idx, total)) { return true; }
		return false;
	}

	// Rotated + annotated page: render it rotated via pdfjs, composite the overlay on top,
	// and stamp the combined image as a new page sized to display points. Guarantees alignment
	// for any rotation without fragile per-rotation matrix math (that page becomes raster; the
	// common rotation-0 case stays vector + selectable).
	function flattenRotatedPage(outDoc, src, ref, doc, idx, total) {
		var core = window.PDFEditor.core;
		var objectsMod = window.PDFEditor.objects;
		var longest = Math.max(ref.width, ref.height) * EXPORT_SCALE;
		return renderPage(src.pdfjsDoc, ref.srcPageIndex, ref.rotation, longest, longest * longest).then(function (r) {
			var pn = doc ? core.pageNumberText(doc.pageNumbers, idx, total) : null;
			var wm = doc ? doc.watermark : null;
			return objectsMod.renderOverlayPng(ref.width, ref.height, ref.objects, wm, pn, EXPORT_SCALE).then(function (overlayUrl) {
				var draw = Promise.resolve();
				if (overlayUrl) {
					draw = new Promise(function (res) { var im = new Image(); im.onload = function () { r.canvas.getContext('2d').drawImage(im, 0, 0, r.canvas.width, r.canvas.height); res(); }; im.src = overlayUrl; });
				}
				return draw.then(function () {
					return outDoc.embedPng(dataUrlToUint8(r.canvas.toDataURL('image/png'))).then(function (png) {
						outDoc.addPage([ref.width, ref.height]).drawImage(png, { x: 0, y: 0, width: ref.width, height: ref.height });
					});
				});
			});
		});
	}

	// Build a single PDF (Uint8Array) from an ordered list of pageRefs.
	// opts {doc, totalForNumbers, onProgress}. Annotations are authored in DISPLAY-point space
	// (ref.width × ref.height, already reflecting rotation), so rotation-0 pages stamp upright.
	function assemble(pages, sources, opts) {
		opts = opts || {};
		var doc = opts.doc || null;
		var total = opts.totalForNumbers || pages.length;
		var PDFLib;
		var core = window.PDFEditor.core;
		var objectsMod = window.PDFEditor.objects;
		var need = pages.some(function (r, i) { return overlayNeeded(r, doc, i, total); });
		var loadFabric = (need && objectsMod) ? objectsMod.load() : Promise.resolve(null);

		return Promise.all([loadPdfLib(), loadFabric]).then(function (libs) {
			PDFLib = libs[0];
			return PDFLib.PDFDocument.create();
		}).then(function (outDoc) {
			var chain = Promise.resolve();
			pages.forEach(function (ref, idx) {
				chain = chain.then(function () {
					var ov = overlayNeeded(ref, doc, idx, total);
					if (!ref.blank && ref.rotation !== 0 && ov) {
						return flattenRotatedPage(outDoc, sources[ref.srcId], ref, doc, idx, total);
					}
					var addBase;
					if (ref.blank) { addBase = Promise.resolve(outDoc.addPage([ref.width, ref.height])); }
					else {
						addBase = outDoc.copyPages(sources[ref.srcId].pdflibDoc, [ref.srcPageIndex]).then(function (copied) {
							var pg = copied[0]; pg.setRotation(PDFLib.degrees(ref.rotation)); outDoc.addPage(pg); return pg;
						});
					}
					return addBase.then(function (page) {
						if (!ov) { return; }
						// Whiteout/cover rects export as NATIVE VECTOR rectangles (under the raster
						// annotations): inside the transparent overlay image their edges blend with
						// transparent-black neighbors when real viewers (poppler/PDFium) scale the
						// image, leaving a faint gray hairline around the box. Vector fills don't.
						var split = objectsMod.extractCoverRects(ref.objects);
						split.covers.forEach(function (cv) {
							page.drawRectangle({
								x: cv.left, y: ref.height - cv.top - cv.height,   // top-left pt -> PDF bottom-left
								width: cv.width, height: cv.height,
								color: PDFLib.rgb(cv.color.r, cv.color.g, cv.color.b)
							});
						});
						var pn = doc ? core.pageNumberText(doc.pageNumbers, idx, total) : null;
						var wm = doc ? doc.watermark : null;
						return objectsMod.renderOverlayPng(ref.width, ref.height, split.restJson, wm, pn, EXPORT_SCALE).then(function (url) {
							if (!url) { return; }
							return outDoc.embedPng(dataUrlToUint8(url)).then(function (png) {
								page.drawImage(png, { x: 0, y: 0, width: ref.width, height: ref.height });
							});
						});
					});
				}).then(function () {
					if (opts.onProgress) { opts.onProgress(idx + 1, pages.length); }
					if ((idx + 1) % 20 === 0) { return yieldToLoop(); }
				});
			});
			return chain.then(function () { return outDoc.save(); });
		});
	}

	function downloadBytes(bytes, filename) {
		var blob = new Blob([bytes], { type: 'application/pdf' });
		if (window.saveAs) { window.saveAs(blob, filename); }
		else {
			var a = document.createElement('a');
			a.href = URL.createObjectURL(blob); a.download = filename;
			document.body.appendChild(a); a.click(); a.remove();
		}
	}

	function assembleAndDownload(pages, sources, filename, opts) {
		return assemble(pages, sources, opts).then(function (bytes) { downloadBytes(bytes, filename); });
	}

	// groups: array of pageRef[] (each group => one output PDF). names: optional parallel
	// array of entry basenames (default page-001.pdf...). onProgress(done,total) optional.
	// Yields to the event loop after each group so a large split stays responsive (§9).
	function splitToZip(groups, sources, zipName, onProgress, names, opts) {
		if (!window.JSZip) { return Promise.reject(new Error('JSZip not loaded')); }
		var zip = new window.JSZip();
		var total = groups.length;
		var chain = Promise.resolve();
		groups.forEach(function (groupPages, gi) {
			chain = chain.then(function () {
				return assemble(groupPages, sources, opts).then(function (bytes) {
					var label = (names && names[gi]) || ('page-' + String(gi + 1).padStart(3, '0') + '.pdf');
					zip.file(label, bytes);            // bytes released after this iteration's scope
					if (onProgress) { onProgress(gi + 1, total); }
					return yieldToLoop();
				});
			});
		});
		return chain.then(function () {
			return zip.generateAsync({ type: 'blob', streamFiles: true, compression: 'STORE' });
		}).then(function (blob) {
			if (window.saveAs) { window.saveAs(blob, zipName); }
		});
	}

	// --- Phase 4: AcroForm detection + fill/flatten ---
	function readFormInfo(PDFLib, pdflibDoc) {
		var info = { hasForm: false, hasXFA: false, fields: [] };
		var form;
		try { form = pdflibDoc.getForm(); } catch (e) { return info; }
		try { if (form.acroForm && form.acroForm.dict && form.acroForm.dict.has(PDFLib.PDFName.of('XFA'))) { info.hasXFA = true; } } catch (e) {}
		var fields;
		try { fields = form.getFields(); } catch (e) { return info; }
		fields.forEach(function (f) {
			var entry = { name: '', type: 'text', value: '', options: null };
			try { entry.name = f.getName(); } catch (e) { return; }
			try {
				if (f instanceof PDFLib.PDFTextField) { entry.type = 'text'; entry.value = f.getText() || ''; }
				else if (f instanceof PDFLib.PDFCheckBox) { entry.type = 'checkbox'; entry.value = f.isChecked(); }
				else if (f instanceof PDFLib.PDFDropdown) { entry.type = 'dropdown'; entry.options = f.getOptions(); entry.value = (f.getSelected() || [])[0] || ''; }
				else if (f instanceof PDFLib.PDFRadioGroup) { entry.type = 'radio'; entry.options = f.getOptions(); entry.value = f.getSelected() || ''; }
				else if (f instanceof PDFLib.PDFOptionList) { entry.type = 'optionlist'; entry.options = f.getOptions(); entry.value = (f.getSelected() || [])[0] || ''; }
				else { entry.type = 'text'; }
			} catch (e) {}
			info.fields.push(entry);
		});
		info.hasForm = info.fields.length > 0;
		return info;
	}

	// Load a FRESH doc from the original bytes (so the live source is never mutated),
	// apply field values, flatten, and return the saved bytes.
	function fillAndFlatten(formBytes, values) {
		return loadPdfLib().then(function (PDFLib) {
			return PDFLib.PDFDocument.load(formBytes, { ignoreEncryption: true }).then(function (doc) {
				var form = doc.getForm();
				Object.keys(values).forEach(function (name) {
					var f;
					try { f = form.getField(name); } catch (e) { return; }
					if (!f) { return; }
					var v = values[name];
					try {
						if (f instanceof PDFLib.PDFTextField) { f.setText(v == null ? '' : String(v)); }
						else if (f instanceof PDFLib.PDFCheckBox) { if (v) { f.check(); } else { f.uncheck(); } }
						else if (f instanceof PDFLib.PDFDropdown || f instanceof PDFLib.PDFRadioGroup || f instanceof PDFLib.PDFOptionList) { if (v) { f.select(String(v)); } }
					} catch (e) {}
				});
				try { form.flatten(); } catch (e) {}
				return doc.save();
			});
		});
	}

	window.PDFEditor = window.PDFEditor || {};
	window.PDFEditor.engine = {
		ASSET_BASE: ASSET_BASE,
		loadScript: loadScript,
		loadPdfLib: loadPdfLib,
		loadPdfJs: loadPdfJs,
		parsePdf: parsePdf,
		renderThumb: renderThumb,
		renderActive: renderActive,
		assemble: assemble,
		downloadBytes: downloadBytes,
		assembleAndDownload: assembleAndDownload,
		splitToZip: splitToZip,
		fillAndFlatten: fillAndFlatten
	};
})();
