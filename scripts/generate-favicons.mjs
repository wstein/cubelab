import { chromium } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

const rootDir = process.cwd();
const svgPath = path.join(rootDir, "public", "favicon.svg");
const svgContent = fs.readFileSync(svgPath, "utf-8");

function buildIco(pngBuffers) {
  // pngBuffers: array of { width, height, buffer }
  const count = pngBuffers.length;
  const headerLength = 6 + count * 16;
  let offset = headerLength;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(count, 4); // number of images

  const entries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0);
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(item.buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    offset += item.buffer.length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((b) => b.buffer)]);
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Create an HTML document with the SVG embedded with transparent background
  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    svg { width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

  await page.setContent(html);

  const targets = [
    { size: 16, file: "favicon-16x16.png" },
    { size: 32, file: "favicon-32x32.png" },
    { size: 48, file: "favicon-48x48.png" },
    { size: 180, file: "apple-touch-icon.png" },
    { size: 512, file: "favicon.png" },
  ];

  const pngBuffers = [];

  for (const { size, file } of targets) {
    await page.setViewportSize({ width: size, height: size });
    const buffer = await page.screenshot({ omitBackground: true });
    if (file !== "favicon-48x48.png") {
      fs.writeFileSync(path.join(rootDir, "public", file), buffer);
      console.log(`Wrote public/${file} (${size}x${size}, ${buffer.length} bytes)`);
    }
    if ([16, 32, 48].includes(size)) {
      pngBuffers.push({ width: size, height: size, buffer });
    }
  }

  // Generate multi-resolution ICO
  const icoBuffer = buildIco(pngBuffers);
  fs.writeFileSync(path.join(rootDir, "public", "favicon.ico"), icoBuffer);
  console.log(`Wrote public/favicon.ico (${icoBuffer.length} bytes)`);

  const b64_16 = fs.readFileSync(path.join(rootDir, "public", "favicon-16x16.png")).toString("base64");
  const b64_32 = fs.readFileSync(path.join(rootDir, "public", "favicon-32x32.png")).toString("base64");
  const b64_512 = fs.readFileSync(path.join(rootDir, "public", "favicon.png")).toString("base64");

  // Also render a preview with both dark and light background for verification
  const previewHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 40px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #030712; color: #fff; display: flex; flex-direction: column; gap: 30px; align-items: center; }
    h2 { margin: 0; font-size: 1.2rem; color: #94a3b8; }
    .grid { display: flex; gap: 40px; }
    .card { padding: 30px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; gap: 20px; }
    .dark { background: #0f172a; border: 1px solid #1e293b; }
    .light { background: #f8fafc; border: 1px solid #e2e8f0; color: #0f172a; }
    .tab-bar-dark { background: #1e1e2e; padding: 8px 16px; border-radius: 8px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: #cdd6f4; width: 220px; }
    .tab-bar-light { background: #ffffff; padding: 8px 16px; border-radius: 8px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: #334155; width: 220px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .sizes { display: flex; gap: 20px; align-items: flex-end; }
  </style>
</head>
<body>
  <h2>CubeLab Hybrid Favicon Preview (Boosted Saturation & Contrast)</h2>
  <div class="grid">
    <div class="card dark">
      <h3>Dark Theme Browser Tab</h3>
      <div class="tab-bar-dark">
        <img src="data:image/png;base64,${b64_16}" width="16" height="16" />
        <span>CubeLab · Studio</span>
      </div>
      <div class="sizes">
        <div><img src="data:image/png;base64,${b64_32}" width="32" height="32" /></div>
        <div><img src="data:image/png;base64,${b64_512}" width="96" height="96" /></div>
      </div>
    </div>
    <div class="card light">
      <h3>Light Theme Browser Tab</h3>
      <div class="tab-bar-light">
        <img src="data:image/png;base64,${b64_16}" width="16" height="16" />
        <span>CubeLab · Studio</span>
      </div>
      <div class="sizes">
        <div><img src="data:image/png;base64,${b64_32}" width="32" height="32" /></div>
        <div><img src="data:image/png;base64,${b64_512}" width="96" height="96" /></div>
      </div>
    </div>
  </div>
</body>
</html>`;

  await page.setViewportSize({ width: 800, height: 480 });
  await page.setContent(previewHtml);
  // Wait a moment for images to load
  await page.screenshot({ path: "/Users/werner/.gemini/antigravity-ide/brain/5a7e6479-d59d-4249-a632-478d75a84d28/favicon_hybrid_preview.png" });
  console.log("Saved preview to favicon_hybrid_preview.png");

  await browser.close();
}

run().catch(console.error);
