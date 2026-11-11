import { createHash } from 'node:crypto';

// The Conloca editor page for /_conloca/editor/. The page loads its UI from the workspace editor app, and that app
// only accepts a workspace directly under its own root: production (app.conloca.com) serves workspaces on
// <label>.conloca.com, a pull-request stage (app.pr<N>.conloca.com) on <label>.pr<N>.conloca.com. The workspace
// frames this page, so the browser sends the workspace origin as Referer (the frame carries
// referrerpolicy="strict-origin"). Point the page at the matching app; any other or missing Referer (the server-side
// probe) gets production. The origin is checked against a fixed shape, never echoed.
const WORKSPACE_ORIGIN = /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.((?:pr[0-9]{1,6}\.)?conloca\.com)\/?$/;
const MODULES = {
  react: 'react.js',
  'react-dom': 'react-dom.js',
  'react-dom/client': 'react-dom-client.js',
  'react/jsx-runtime': 'jsx-runtime.js',
  'react/jsx-dev-runtime': 'jsx-dev-runtime.js',
  '@puckeditor/core': 'puck.js',
};
const SITE_ASSETS = {
  protocol: 1,
  repo: 'alex-mextner/bulka-the-dog',
  siteId: 'default',
  site: '/_conloca/editor/site.fab3a854c6975d4f.js',
  css: ['/_conloca/editor/site.ea2637e4acd669b0.css'],
  editorCss: null,
  sandboxFrame: '/_conloca/editor/sandbox-frame.html',
  info: '/_conloca/editor/conloca.json',
};

function appRoot(referer) {
  const match = typeof referer === 'string' ? WORKSPACE_ORIGIN.exec(referer) : null;
  return match ? match[1] : 'conloca.com';
}

export default function handler(req, res) {
  const ui = `https://app.${appRoot(req.headers.referer)}/host/v1/`;
  const importMap = JSON.stringify({
    imports: Object.fromEntries(Object.entries(MODULES).map(([name, file]) => [name, `${ui}${file}`])),
  });
  const hash = createHash('sha256').update(importMap).digest('base64');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="Content-Security-Policy" content="script-src 'self' ${ui} 'sha256-${hash}'; object-src 'none'; base-uri 'none'">
<title>Conloca editor</title>
<script type="importmap">${importMap}</script>
<script type="application/json" id="conloca-editor-host">${JSON.stringify(SITE_ASSETS)}</script>
<script type="module" src="${ui}entry.js"></script>
</head>
<body><div id="root"></div></body>
</html>
`;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('vary', 'Referer');
  res.status(200).send(html);
}
