/**
 * shopping-list.html 을 띄우는 최소 정적 서버.
 *
 * 왜 필요한가: `file://` 로는 테스트할 수 없다. Playwright 도 Chrome 확장도
 * `file:` 프로토콜 접근을 막는다("Access to file: protocol is blocked").
 * 그래서 테스트할 때만 이 서버로 같은 파일을 http 로 내보낸다.
 *
 * 사용자가 쓸 때는 이 서버가 필요 없다 — 파일을 더블클릭하면 그대로 열린다.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(ROOT, 'shopping-list.html');
const PORT = Number(process.env.PORT ?? 4173);

const server = http.createServer(async (req, res) => {
  try {
    const html = await readFile(FILE);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': html.length,
      // 테스트가 늘 최신 파일을 보도록 캐시를 남기지 않는다.
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`shopping-list.html 을 읽을 수 없습니다: ${err.code ?? err.message}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${PORT}`);
});
