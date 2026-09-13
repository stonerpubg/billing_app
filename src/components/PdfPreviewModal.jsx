import { useEffect } from 'react';
import PdfCanvasPreview from './PdfCanvasPreview.jsx';

export default function PdfPreviewModal({ data, onClose, onExport }) {
  useEffect(() => {
    if (!data) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [data, onClose]);

  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex flex-col p-4 lg:p-6">
      <div className="bg-white rounded-lg shadow-2xl flex flex-col flex-1 max-w-6xl w-full mx-auto overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Preview
            </div>
            <h2 className="text-base font-semibold text-slate-800">
              {data.quoteNumber}
            </h2>
          </div>
          <div className="flex gap-2">
            {onExport && (
              <button className="btn-primary text-xs" onClick={onExport}>
                Export PDF
              </button>
            )}
            <button className="btn-ghost text-xs" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <PdfCanvasPreview base64={data.base64} />
        </div>
      </div>
    </div>
  );
}
