import http from 'node:http';
import worker from '../dist/server/index.js';
const port = Number(process.env.PORT || 4174);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const response = await worker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers: req.headers, ...(['GET','HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { console.error(error); res.writeHead(500); res.end('Server error'); }
}).listen(port, '127.0.0.1', () => console.log(`Farm Forward preview at http://127.0.0.1:${port}`));
