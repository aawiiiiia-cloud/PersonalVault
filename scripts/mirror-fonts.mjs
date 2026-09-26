// 从本地 8974 服务器递归镜像 assets/fonts 到本项目（一次性脚本）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:8974/assets/fonts/";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/fonts");

const seen = new Set();
const cssQueue = ["fonts.css"];
let files = 0, bytes = 0;

async function fetchFile(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const res = await fetch(BASE + rel);
  if (!res.ok) { console.error("404", rel); return; }
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  files++; bytes += buf.length;
  if (rel.endsWith(".css")) {
    const text = buf.toString("utf8");
    for (const m of text.matchAll(/@import\s+["']([^"']+)["']/g)) cssQueue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
    for (const m of text.matchAll(/url\((?!["']?(?:data:|https?:))["']?([^"')]+)["']?\)/g)) {
      const asset = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
      await fetchFile(asset);
    }
  }
}

while (cssQueue.length) await fetchFile(cssQueue.shift());
console.log(`done: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
