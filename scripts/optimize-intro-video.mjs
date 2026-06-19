#!/usr/bin/env node
/**
 * One-off web-optimisation for the brand intro reel.
 *
 * Drop the source at `public/turnkey-logo-intro.mp4`, then run:
 *   npm run video:optimize
 *
 * Produces, alongside the MP4 fallback:
 *   - public/turnkey-logo-intro.webm        (VP9 / Opus, web-optimised)
 *   - public/turnkey-logo-intro-poster.jpg  (frame 0, so the area never
 *                                            flashes blank before load)
 *
 * Requires ffmpeg on PATH. Safe to run when the MP4 is absent — it just
 * warns and exits 0 so it can sit in CI / postinstall without failing.
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const pub = resolve(process.cwd(), "public");
const mp4 = resolve(pub, "turnkey-logo-intro.mp4");
const webm = resolve(pub, "turnkey-logo-intro.webm");
const poster = resolve(pub, "turnkey-logo-intro-poster.jpg");

if (!existsSync(mp4)) {
  console.warn(
    `[optimize-intro-video] ${mp4} not found — nothing to do.\n` +
      "  Drop the MP4 there and re-run `npm run video:optimize`."
  );
  process.exit(0);
}

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!hasFfmpeg()) {
  console.warn(
    "[optimize-intro-video] ffmpeg not found on PATH — skipping.\n" +
      "  Install ffmpeg, then re-run `npm run video:optimize`. The MP4 still works as the fallback source."
  );
  process.exit(0);
}

function ff(label, args) {
  console.log(`[optimize-intro-video] ${label}`);
  execFileSync("ffmpeg", ["-y", ...args], { stdio: "inherit" });
}

ff("Encoding VP9/Opus WebM…", [
  "-i", mp4,
  "-c:v", "libvpx-vp9",
  "-b:v", "0",
  "-crf", "33",
  "-row-mt", "1",
  "-pix_fmt", "yuv420p",
  "-c:a", "libopus",
  "-b:a", "96k",
  webm,
]);

ff("Extracting poster from frame 0…", [
  "-i", mp4,
  "-frames:v", "1",
  "-q:v", "3",
  "-update", "1",
  poster,
]);

console.log("[optimize-intro-video] Done:");
console.log(`  ${webm}`);
console.log(`  ${poster}`);
