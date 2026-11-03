import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(root, "phoenix-src");
const manifestPath = path.join(root, "PHOENIX_SOURCE_MANIFEST.json");
const commit = "c6602582f13a082ba696c60c9d182e5729462e59";
const hash = (file) =>
  createHash("sha256")
    .update(fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
function list(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${file}`);
    return entry.isDirectory() ? list(file) : [file];
  });
}
const currentFiles = list(sourceRoot)
  .map((file) => path.relative(sourceRoot, file).replaceAll("\\", "/"))
  .sort();
if (process.argv.includes("--update")) {
  const upstream = path.resolve(root, "../../phoenix");
  const head = execFileSync("git", ["-C", upstream, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (head !== commit)
    throw new Error(`Expected Phoenix ${commit}, found ${head}`);
  const files = currentFiles.map((relative) => {
    const original = path.join(upstream, "js/app/src", relative);
    const local = path.join(sourceRoot, relative);
    if (!fs.existsSync(original))
      throw new Error(`No upstream source for ${relative}`);
    const upstreamSha256 = hash(original);
    const localSha256 = hash(local);
    return {
      path: relative,
      upstreamPath: `js/app/src/${relative}`,
      upstreamSha256,
      localSha256,
      modified: upstreamSha256 !== localSha256,
    };
  });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        upstream: "https://github.com/Arize-ai/phoenix",
        commit,
        hashNormalization: "UTF-8 text with CRLF normalized to LF",
        files,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`Updated source manifest: ${files.length} Phoenix files.`);
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.commit !== commit) throw new Error("Unexpected upstream commit");
  if (
    JSON.stringify(currentFiles) !==
    JSON.stringify(manifest.files.map((file) => file.path))
  )
    throw new Error("Source file list changed; run pnpm manifest:update.");
  for (const file of manifest.files) {
    if (hash(path.join(sourceRoot, file.path)) !== file.localSha256)
      throw new Error(
        `Source changed: ${file.path}; run pnpm manifest:update.`
      );
  }
  for (const file of ["LICENSE", "IP_NOTICE"]) {
    if (!fs.existsSync(path.join(root, "vendor/arize-phoenix", file)))
      throw new Error(`Missing upstream ${file}`);
  }
  console.log(
    `Source manifest verified: ${manifest.files.length} files at Phoenix ${commit.slice(0, 7)}.`
  );
}
