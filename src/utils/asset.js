// Convert an absolute local filesystem path (as saved in settings) into a URL the
// renderer can load. In Electron uses the custom `mrl-asset://` protocol registered
// in main.js. In a browser (web mode) uses the `/api/asset/:b64` server endpoint.
export function assetUrl(absolutePath) {
  if (!absolutePath) return null;
  // Base64-encode the path to avoid Windows-path parsing issues (colons, backslashes)
  const bytes = new TextEncoder().encode(String(absolutePath));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);

  const isWeb = typeof window !== 'undefined' && window.__MRL_WEB__;
  return isWeb ? `/api/asset/${b64}` : `mrl-asset://local/${b64}`;
}
