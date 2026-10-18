/**
 * PDF to PNG — encoder wrapper.
 */
import { initTool } from 'pdf-converter-ui.js';

async function encode(canvas) {
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

initTool({
    format: 'png',
    extension: 'png',
    encode,
    renderWeight: 0.7, // PNG encoding is near-instant; render dominates.
});
