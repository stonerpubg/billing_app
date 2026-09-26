// Polyfills for the TC39 "Uint8Array to/from base64 and hex" proposal.
// Landed in Chrome 140, Firefox 131, Safari 26 (Sep 2025). Older browsers
// throw "toHex is not a function" / "fromBase64 is not a function" when
// pdfjs-dist v5 renders a PDF preview.
//
// This file is imported once at app startup so the polyfills are installed
// before pdfjs loads.

if (typeof Uint8Array !== 'undefined') {
  if (typeof Uint8Array.prototype.toHex !== 'function') {
    // eslint-disable-next-line no-extend-native
    Object.defineProperty(Uint8Array.prototype, 'toHex', {
      value: function toHex() {
        const out = new Array(this.length);
        for (let i = 0; i < this.length; i++) out[i] = this[i].toString(16).padStart(2, '0');
        return out.join('');
      },
      configurable: true, writable: true,
    });
  }
  if (typeof Uint8Array.prototype.toBase64 !== 'function') {
    // eslint-disable-next-line no-extend-native
    Object.defineProperty(Uint8Array.prototype, 'toBase64', {
      value: function toBase64() {
        let s = '';
        for (let i = 0; i < this.length; i++) s += String.fromCharCode(this[i]);
        return typeof btoa === 'function' ? btoa(s) : Buffer.from(this).toString('base64');
      },
      configurable: true, writable: true,
    });
  }
  if (typeof Uint8Array.fromBase64 !== 'function') {
    Object.defineProperty(Uint8Array, 'fromBase64', {
      value: function fromBase64(str) {
        const bin = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
      },
      configurable: true, writable: true,
    });
  }
  if (typeof Uint8Array.fromHex !== 'function') {
    Object.defineProperty(Uint8Array, 'fromHex', {
      value: function fromHex(str) {
        const clean = String(str).replace(/\s+/g, '');
        if (clean.length % 2 !== 0) throw new SyntaxError('fromHex: odd-length input');
        const arr = new Uint8Array(clean.length / 2);
        for (let i = 0; i < arr.length; i++) arr[i] = parseInt(clean.substr(i * 2, 2), 16);
        return arr;
      },
      configurable: true, writable: true,
    });
  }
}
