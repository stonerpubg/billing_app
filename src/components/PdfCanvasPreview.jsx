import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Cache pdf document handles keyed by base64 length + prefix so we can destroy them cleanly
export default function PdfCanvasPreview({ base64, className = '' }) {
  const containerRef = useRef(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState(null);
  const renderTokenRef = useRef(0);

  useEffect(() => {
    if (!base64) return;
    const token = ++renderTokenRef.current;
    setRendering(true);
    setError(null);

    let pdfDoc = null;

    const run = async () => {
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        pdfDoc = await loadingTask.promise;
        if (token !== renderTokenRef.current) return;

        const container = containerRef.current;
        if (!container) return;

        const containerWidth = Math.max(container.clientWidth - 24, 300);
        // Higher DPR for crisp text on hi-dpi screens
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const newElems = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          if (token !== renderTokenRef.current) return;

          const rawViewport = page.getViewport({ scale: 1 });
          const scale = containerWidth / rawViewport.width;
          const viewport = page.getViewport({ scale: scale * dpr });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / dpr}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto 16px';
          canvas.style.boxShadow = '0 10px 30px -10px rgba(0,0,0,.25), 0 4px 12px rgba(0,0,0,.08)';
          canvas.style.background = '#ffffff';
          canvas.style.borderRadius = '2px';

          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (token !== renderTokenRef.current) return;
          newElems.push(canvas);
        }

        if (token !== renderTokenRef.current) return;

        // Atomic swap: keep old canvases visible until new ones are ready, then replace
        container.innerHTML = '';
        for (const c of newElems) container.appendChild(c);
      } catch (e) {
        if (token === renderTokenRef.current) setError(e.message || 'Failed to render PDF');
      } finally {
        if (pdfDoc) {
          try { pdfDoc.destroy(); } catch (_) {}
        }
        if (token === renderTokenRef.current) setRendering(false);
      }
    };

    run();
  }, [base64]);

  return (
    <div className={'relative w-full h-full overflow-auto bg-slate-200 p-3 ' + className}>
      <div ref={containerRef} />
      {rendering && (
        <div className="absolute top-2 right-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-white/80 px-2 py-1 rounded shadow-sm pointer-events-none">
          Updating…
        </div>
      )}
      {error && (
        <div className="absolute top-3 left-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
