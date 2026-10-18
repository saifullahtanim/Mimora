(function (root) {
	'use strict';

	function normalizeRotation(angle) {
		var snapped = Math.round((Number(angle) || 0) / 90) * 90;
		return ((snapped % 360) + 360) % 360;
	}

	function makePageRef(o) {
		return {
			uid: o.uid,
			srcId: (o.srcId === undefined ? null : o.srcId),
			srcPageIndex: (o.srcPageIndex === undefined ? null : o.srcPageIndex),
			rotation: normalizeRotation(o.rotation || 0),
			width: o.width,
			height: o.height,
			blank: !!o.blank,
			objects: (o.objects === undefined ? null : o.objects)
		};
	}

	function clone(ref, over) {
		var c = { uid: ref.uid, srcId: ref.srcId, srcPageIndex: ref.srcPageIndex, rotation: ref.rotation, width: ref.width, height: ref.height, blank: ref.blank, objects: ref.objects };
		if (over) { for (var k in over) { if (Object.prototype.hasOwnProperty.call(over, k)) { c[k] = over[k]; } } }
		return c;
	}

	function rotatePage(pages, index, delta) {
		return pages.map(function (p, i) {
			return i === index ? clone(p, { rotation: normalizeRotation(p.rotation + delta) }) : p;
		});
	}

	function movePage(pages, from, to) {
		var next = pages.slice();
		var moved = next.splice(from, 1)[0];
		next.splice(to, 0, moved);
		return next;
	}

	function deletePage(pages, index) {
		return pages.filter(function (_, i) { return i !== index; });
	}

	function duplicatePage(pages, index, uid) {
		var next = pages.slice();
		next.splice(index + 1, 0, clone(pages[index], { uid: uid }));
		return next;
	}

	function insertBlankPage(pages, atIndex, blankRef) {
		var next = pages.slice();
		next.splice(atIndex, 0, blankRef);
		return next;
	}

	function selectByIndices(pages, indices) {
		return indices.map(function (i) { return pages[i]; });
	}

	function parsePageRange(input, totalPages) {
		var s = (input || '').trim().toLowerCase();
		if (s === '' || s === 'all') {
			var allp = [];
			for (var k = 1; k <= totalPages; k++) { allp.push(k); }
			return allp;
		}
		var set = {};
		var parts = s.split(',');
		for (var pi = 0; pi < parts.length; pi++) {
			var part = parts[pi].trim();
			if (part === '') { continue; }
			var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
			if (m) {
				var a = parseInt(m[1], 10), b = parseInt(m[2], 10); if (a > b) { var sw = a; a = b; b = sw; } // reversed range -> swap (match converter)
				if (a < 1 || b < 1 || a > totalPages || b > totalPages) {
					throw new Error('Page range "' + part + '" is out of range (1-' + totalPages + ').');
				}
				for (var n = a; n <= b; n++) { set[n] = true; }
			} else if (/^\d+$/.test(part)) {
				var v = parseInt(part, 10);
				if (v < 1 || v > totalPages) {
					throw new Error('Page "' + v + '" is out of range (1-' + totalPages + ').');
				}
				set[v] = true;
			} else {
				throw new Error('Invalid page range: "' + part + '".');
			}
		}
		return Object.keys(set).map(Number).sort(function (x, y) { return x - y; });
	}

	function createState() { return { sources: {}, pages: [], undo: [], redo: [], uidSeq: 0 }; }
	function nextUid(state) { state.uidSeq += 1; return 'p' + state.uidSeq; }
	function commit(state, nextPages) { state.undo.push(state.pages); state.redo = []; state.pages = nextPages; return state; }
	function undo(state) { if (state.undo.length) { state.redo.push(state.pages); state.pages = state.undo.pop(); } return state; }
	function redo(state) { if (state.redo.length) { state.undo.push(state.pages); state.pages = state.redo.pop(); } return state; }
	function canUndo(state) { return state.undo.length > 0; }
	function canRedo(state) { return state.redo.length > 0; }
	function canDelete(state) { return state.pages.length > 1; }
	function canExport(state) { return state.pages.length >= 1; }

	// --- Phase 2: per-page objects + document-level config ---
	function setPageObjects(pages, index, json) {
		return pages.map(function (p, i) { return i === index ? clone(p, { objects: json }) : p; });
	}
	function defaultDoc() {
		return {
			watermark: { enabled: false, text: 'CONFIDENTIAL', color: '#ff3b30', opacity: 0.25 },
			pageNumbers: { enabled: false, format: 'plain', corner: 'br', start: 1, range: '' }
		};
	}
	function formatPageNumber(format, n, total) {
		if (format === 'page') { return 'Page ' + n; }
		if (format === 'of') { return n + ' / ' + total; }
		return String(n);
	}
	function pageNumberText(cfg, pageIndex, totalPages) {
		if (!cfg || !cfg.enabled) { return null; }
		if (cfg.range) {
			var inSet;
			try { inSet = parsePageRange(cfg.range, totalPages); } catch (e) { inSet = null; }
			if (inSet && inSet.indexOf(pageIndex + 1) === -1) { return null; }
		}
		var n = (cfg.start || 1) + pageIndex;
		return formatPageNumber(cfg.format || 'plain', n, totalPages);
	}

	var api = {
		normalizeRotation: normalizeRotation,
		makePageRef: makePageRef,
		rotatePage: rotatePage,
		movePage: movePage,
		deletePage: deletePage,
		duplicatePage: duplicatePage,
		insertBlankPage: insertBlankPage,
		selectByIndices: selectByIndices,
		parsePageRange: parsePageRange,
		createState: createState,
		nextUid: nextUid,
		commit: commit,
		undo: undo,
		redo: redo,
		canUndo: canUndo,
		canRedo: canRedo,
		canDelete: canDelete,
		canExport: canExport,
		setPageObjects: setPageObjects,
		defaultDoc: defaultDoc,
		formatPageNumber: formatPageNumber,
		pageNumberText: pageNumberText,
		A4_PORTRAIT: { width: 595.28, height: 841.89 }
	};

	if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
	else { root.PDFEditor = root.PDFEditor || {}; root.PDFEditor.core = api; }
})(typeof window !== 'undefined' ? window : this);
