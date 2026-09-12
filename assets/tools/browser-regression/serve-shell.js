'use strict';
/**
 * A dependency-free static server for the feature worktree, plus ONE injected probe script.
 *
 * The shell it serves is the real index.html, byte for byte, with a single <script> prepended inside
 * <head> before every other tag. That script changes no page behaviour: it records errors and network
 * calls, stubs the outbound Apps Script host so the boot capability read cannot hang the load or make
 * another live request, and then — after load — runs the §7 assertions IN THE BROWSER and writes them
 * into a <pre id="km-probe-result">. `chrome --headless --dump-dom` returns that.
 */
var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var ROOT = path.resolve(process.argv[2]);
var PROBE = fs.readFileSync(path.join(__dirname, 'probe-non-activation.js'), 'utf8');
var PORT = Number(process.argv[3] || 8731);

var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

http.createServer(function (req, res) {
  var p = decodeURIComponent(url.parse(req.url).pathname);
  if (p === '/') p = '/index.html';
  var file = path.resolve(path.join(ROOT, p.replace(/^\/+/, '')));
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end('no ' + file); }
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); return res.end('not found'); }
    var ext = path.extname(file).toLowerCase();
    if (p === '/index.html') {
      var html = buf.toString('utf8');
      // Prepend, immediately after <head>, so the probe is installed before ANY page script runs.
      html = html.replace(/<head>/i, '<head>\n<script>\n' + PROBE + '\n</script>');
      res.writeHead(200, { 'Content-Type': TYPES['.html'] });
      return res.end(html);
    }
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', function () {
  console.log('serving ' + ROOT + ' on http://127.0.0.1:' + PORT);
});
