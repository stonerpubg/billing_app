import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { parseVoiceTranscript, normalizeForPreview, isVoiceSupported } from '../utils/voiceParser.js';

// Realistic sample sentences. Clicking one puts it into the transcript AND has the
// browser read it aloud (Speech Synthesis) so the user hears the intended cadence.
const EXAMPLES = [
  {
    label: 'Simple 2-item quote',
    text: 'customer Ramesh Kumar phone 9876543210 add MS pipe quantity 20 rate 80 done add welding rod quantity 24 rate 410 done',
  },
  {
    label: 'With sizes + flat GST',
    text: 'customer Kanmani Tex flat GST 18 percent add angle size 1 by 1 quantity 10 rate 65 done add MS block size 4 by 4 by 6 quantity 2 rate 500 done',
  },
  {
    label: 'Natural phrasing',
    text: 'customer XYZ Fabrications give me 5 grills at 22600 rupees and 10 bolts at 15 rupees each',
  },
  {
    label: 'Tamil / Tanglish',
    text: 'கஸ்டமர் ரமேஷ் போன் 9876543210 சேர் விண்டோஸ் கிரில் சைஸ் 4 குவாண்டிட்டி 3 ரேட் 300 டன்',
  },
];

function speak(text, lang) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || 'en-IN';
    u.rate = 0.95;
    s.speak(u);
  } catch (_e) { /* ignore */ }
}

// Voice-driven quotation intake. Uses browser SpeechRecognition (Chromium works).
// User speaks a stream of commands, hits "Fill quotation" — we parse and hand back
// { customer, subject, items }. Parent decides how to merge.
export default function VoiceFillModal({ open, onClose, onApply }) {
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState('en-IN');
  const recRef = useRef(null);

  const supported = useMemo(() => isVoiceSupported(), []);

  // Preview what we'd parse from the current transcript.
  const parsed = useMemo(() => {
    if (!transcript.trim()) return null;
    try { return parseVoiceTranscript(transcript); } catch { return null; }
  }, [transcript]);

  useEffect(() => {
    if (!open) {
      // Stop any active recognition when modal closes
      if (recRef.current) {
        try { recRef.current.stop(); } catch (_e) { /* ignore */ }
      }
      setListening(false);
      setInterim('');
      setError('');
    }
  }, [open]);

  const startListening = () => {
    if (!supported) { setError('Voice input is not supported in this browser. Use Chromium / Edge.'); return; }
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Rec();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript + ' ';
        else interimText += r[0].transcript;
      }
      if (finalText) setTranscript((prev) => (prev + ' ' + finalText).replace(/\s+/g, ' ').trim());
      setInterim(interimText);
    };
    rec.onerror = (e) => setError(`Voice error: ${e.error || 'unknown'}`);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setError('');
    setInterim('');
    try { rec.start(); setListening(true); } catch (e) { setError(String(e.message || e)); }
  };

  const stopListening = () => {
    if (recRef.current) {
      try { recRef.current.stop(); } catch (_e) { /* ignore */ }
    }
    setListening(false);
  };

  const clearAll = () => { setTranscript(''); setInterim(''); };

  const apply = () => {
    if (!parsed) return;
    onApply(parsed);
    // Reset for the next voice session
    setTranscript(''); setInterim(''); setError('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="🎤 Voice-fill quotation" size="lg">
      <div className="p-5 space-y-4">
        {!supported && (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Voice input is not supported in this browser. Use the Windows desktop app (Chromium) or Google Chrome / Edge.
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {!listening ? (
            <button
              className="btn-primary px-4 py-2 flex items-center gap-2"
              onClick={startListening}
              disabled={!supported}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white"></span>
              Start listening
            </button>
          ) : (
            <button
              className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium flex items-center gap-2"
              onClick={stopListening}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
              Stop
            </button>
          )}
          <div className="flex items-center gap-2 text-xs">
            <label className="text-slate-500">Language</label>
            <select
              className="input py-1 text-xs"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              disabled={listening}
            >
              <option value="en-IN">English (India)</option>
              <option value="ta-IN">Tamil</option>
              <option value="en-US">English (US)</option>
              <option value="hi-IN">Hindi</option>
            </select>
          </div>
          <button className="btn-secondary text-xs" onClick={clearAll} disabled={!transcript && !interim}>
            Clear
          </button>
          {listening && (
            <span className="text-xs text-red-600 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
              Listening…
            </span>
          )}
        </div>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Example prompts */}
        <div>
          <div className="text-xs uppercase font-semibold text-slate-500 mb-1">Try an example</div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <div key={ex.label} className="flex items-stretch rounded-md border border-slate-200 bg-white overflow-hidden">
                <button
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setTranscript(ex.text)}
                  title="Put this example into the transcript"
                >
                  {ex.label}
                </button>
                <button
                  className="px-2 border-l border-slate-200 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  onClick={() => speak(ex.text, lang)}
                  title="Hear how it sounds"
                >
                  🔊
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Transcript */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs uppercase font-semibold text-slate-500">Transcript (editable)</label>
            <span className="text-xs text-slate-400">Speech dropped words? Just <strong>type / edit</strong> here, then hit Fill.</span>
          </div>
          <textarea
            className="input w-full min-h-[100px] text-sm"
            placeholder="Speak or type. Try: 'customer Ramesh, phone 9876543210, add MS pipe quantity 20 rate 80 done, add welding rod quantity 24 rate 410 done, finish'"
            value={transcript + (interim ? ' ' + interim : '')}
            onChange={(e) => { setTranscript(e.target.value); setInterim(''); }}
          />
        </div>

        {/* Parsed preview */}
        {parsed && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="text-xs uppercase font-semibold text-slate-500 mb-2">Preview — what will fill</div>
            {(() => {
              const normalized = normalizeForPreview(transcript);
              return normalized && normalized !== transcript.trim().toLowerCase() ? (
                <div className="mb-2 text-xs">
                  <span className="text-slate-500">Understood as:</span>{' '}
                  <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">{normalized}</code>
                </div>
              ) : null;
            })()}
            {(parsed.customer.name || parsed.customer.phone) && (
              <div className="mb-2">
                <span className="font-semibold text-slate-700">Customer:</span>{' '}
                {parsed.customer.name || <span className="text-slate-400">(none)</span>}
                {parsed.customer.phone && <span className="text-slate-500"> · {parsed.customer.phone}</span>}
                {parsed.customer.city && <span className="text-slate-500"> · {parsed.customer.city}</span>}
                {parsed.customer.state && <span className="text-slate-500"> · {parsed.customer.state}</span>}
              </div>
            )}
            {parsed.subject && (
              <div className="mb-2">
                <span className="font-semibold text-slate-700">Subject:</span> {parsed.subject}
              </div>
            )}
            <div>
              <span className="font-semibold text-slate-700">Items ({parsed.items.length}):</span>
              {parsed.items.length === 0 ? (
                <div className="text-slate-400 mt-1">No items parsed yet. Try "add MS pipe quantity 20 rate 80".</div>
              ) : (
                <table className="w-full text-xs mt-1">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left py-1">#</th>
                      <th className="text-left py-1">Item</th>
                      <th className="text-center py-1">Size</th>
                      <th className="text-right py-1">Weight</th>
                      <th className="text-center py-1">Unit</th>
                      <th className="text-right py-1">Qty</th>
                      <th className="text-right py-1">Rate</th>
                      <th className="text-center py-1">Mode</th>
                      <th className="text-right py-1">GST %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.items.map((it, i) => (
                      <tr key={i} className="border-t border-slate-200">
                        <td className="py-1 text-slate-400">{i + 1}</td>
                        <td className="py-1 font-medium">{it.name || '(no name)'}</td>
                        <td className="text-center">{it.size || '—'}</td>
                        <td className={'text-right ' + (it.price_by === 'weight' ? 'font-semibold text-brand-700' : 'text-slate-400')}>
                          {it.weight || '—'}
                        </td>
                        <td className="text-center">{it.unit}</td>
                        <td className="text-right">{it.quantity}</td>
                        <td className="text-right">{it.rate}</td>
                        <td className="text-center">
                          <span className={
                            'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ' +
                            (it.price_by === 'weight' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600')
                          }>
                            {it.price_by === 'weight' ? '⚖ Weight' : '📐 Size'}
                          </span>
                        </td>
                        <td className="text-right">{it.gst_rate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Cheat-sheet — always visible so the phrase pattern is right in front of the user */}
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="px-3 py-2 text-xs font-semibold text-slate-600 border-b border-slate-100 bg-slate-50">
            💡 Command patterns (the parser also understands natural phrasings like "give me 5 pipes at 80")
          </div>
          <div className="p-3 text-xs text-slate-600 space-y-2">
            <div>
              <strong className="text-slate-800">Customer:</strong> <code className="text-brand-700">customer Ramesh Kumar</code>,{' '}
              <code className="text-brand-700">phone 9876543210</code> (or spell each digit),{' '}
              <code className="text-brand-700">city Tirupur</code>, <code className="text-brand-700">state Tamil Nadu</code>,{' '}
              <code className="text-brand-700">gstin 33ABCDE1234F1Z5</code>
            </div>
            <div>
              <strong className="text-slate-800">Subject:</strong> <code className="text-brand-700">subject roofing work at site</code>
            </div>
            <div>
              <strong className="text-slate-800">Items:</strong> <code className="text-brand-700">add MS pipe</code>,{' '}
              <code className="text-brand-700">quantity 20</code>, <code className="text-brand-700">rate 80</code>,{' '}
              <code className="text-brand-700">size 4 by 4</code> or <code className="text-brand-700">size 4 by 4 by 6</code> (L × B × H),{' '}
              <code className="text-brand-700">unit Nos</code>, <code className="text-brand-700">GST 18 percent</code>, then <code className="text-brand-700">done</code> or <code className="text-brand-700">next</code> for the next item.
            </div>
            <div>
              <strong className="text-slate-800">Two sizes on one product (multi-face):</strong>{' '}
              <code className="text-brand-700">size 17.25 by 4.5 plus 12.5 by 4.55</code> — computes 17.25×4.5 + 12.5×4.55 = 134.5, then × qty × rate.
              <br />
              Separators between groups: <code className="text-brand-700">plus</code> / <code className="text-brand-700">and</code> / <code className="text-brand-700">also</code>. Up to 3 dimensions per group, unlimited groups.
              <br />
              Or type directly in the Size field: <code className="text-brand-700">17.25x4.5+12.5x4.55</code>.
            </div>
            <div>
              <strong className="text-slate-800">GST mode:</strong> <code className="text-brand-700">flat GST 18 percent</code> (single rate on grand total) or <code className="text-brand-700">per product GST</code> (each item its own rate).
            </div>
            <div>
              <strong className="text-slate-800">Pricing mode:</strong> <code className="text-brand-700">price by size</code> (amount = size × qty × rate, default) or <code className="text-brand-700">price by weight</code> (amount = <strong>weight × qty × rate</strong>).
              <br />
              <span className="text-slate-500">e.g. 45 kg per piece × 2 pieces × ₹200/kg = ₹18,000.</span>
              <br />
              <strong className="text-slate-800">Weight (either syntax works):</strong>{' '}
              <code className="text-brand-700">weight 317.6 kg</code> · or inline: <code className="text-brand-700">price by weight 45 kg</code> (toggles mode + sets weight in one command).
            </div>
            <div>
              <strong className="text-slate-800">Replace a specific item by serial number:</strong>{' '}
              <code className="text-brand-700">replace item 2 name to PVC pipe</code>,{' '}
              <code className="text-brand-700">replace item 3 size to 4 by 6</code>,{' '}
              <code className="text-brand-700">replace item 1 rate to 500</code>. Also: <code className="text-brand-700">replace item two quantity to 25</code> (word number). Without a number: <code className="text-brand-700">replace name to X</code> targets the last item.
            </div>
            <div>
              <strong className="text-slate-800">Replace global fields:</strong>{' '}
              <code className="text-brand-700">replace customer to Ramesh Kumar</code>,{' '}
              <code className="text-brand-700">replace phone to 98765...</code>,{' '}
              <code className="text-brand-700">replace subject to roofing work</code>.
            </div>
            <div>
              <strong className="text-slate-800">Delete / clear:</strong> <code className="text-brand-700">delete last item</code>,{' '}
              <code className="text-brand-700">clear all</code>, <code className="text-brand-700">clear item</code>. You can also edit the transcript above by hand before hitting Fill.
            </div>
            <div className="text-slate-500 pt-1 border-t border-slate-100">
              Numbers accept words (<em>twenty five, one thousand five hundred</em>) or digits (<em>25, 1500</em>).
              Phone digits can be spoken one by one (<em>nine eight seven six five</em>).
            </div>
            <div className="text-slate-500 pt-1 border-t border-slate-100">
              <strong className="text-slate-700">Tamil / Tanglish:</strong> keywords are auto-translated —{' '}
              <code className="text-brand-700">கஸ்டமர்</code> (customer),{' '}
              <code className="text-brand-700">போன்</code> (phone),{' '}
              <code className="text-brand-700">சேர்</code> (add),{' '}
              <code className="text-brand-700">சைஸ்</code> (size),{' '}
              <code className="text-brand-700">குவாண்டிட்டி</code> (quantity),{' '}
              <code className="text-brand-700">ரேட்</code> (rate),{' '}
              <code className="text-brand-700">டன்</code> (done). Filler words like{' '}
              <code className="text-brand-700">பண்ணு</code> / <code className="text-brand-700">ஆடு</code> are stripped.
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={apply}
          disabled={!parsed || (parsed.items.length === 0 && !parsed.customer.name && !parsed.subject)}
        >
          Fill quotation
        </button>
      </div>
    </Modal>
  );
}
