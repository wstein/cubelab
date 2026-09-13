#!/usr/bin/env node

import {createHash} from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";

const REGRIP_REPOSITORY = "wstein/regrip";

const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

const command = (executable, args, {inherit = false} = {}) => {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim();
    fail(`${executable} ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout?.trim() ?? "";
};

const digest = (algorithm, path, encoding) =>
  createHash(algorithm).update(readFileSync(path)).digest(encoding);

const parseArguments = () => {
  const values = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail("usage: npm run regrip-core:update -- --tag core-vX.Y.Z --sha256 <64 hex characters>");
    }
    values.set(key, value);
  }
  const tag = values.get("--tag");
  const expectedSha256 = values.get("--sha256")?.toLowerCase();
  const match = tag?.match(/^core-v(\d+\.\d+\.\d+)$/);
  if (!match || !expectedSha256?.match(/^[a-f0-9]{64}$/)) {
    fail("both --tag core-vX.Y.Z and --sha256 <64 hex characters> are required");
  }
  return {tag, version: match[1], expectedSha256};
};

const {tag, version, expectedSha256} = parseArguments();
if (command("git", ["status", "--porcelain"])) {
  fail("the worktree must be clean before updating Regrip core");
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "cubelab-regrip-core-"));

try {
  const fileName = `wstein-regrip-core-${version}.tgz`;
  command("gh", [
    "release",
    "download",
    tag,
    "--repo",
    REGRIP_REPOSITORY,
    "--pattern",
    fileName,
    "--dir",
    temporaryDirectory,
  ], {inherit: true});

  const downloadedPath = join(temporaryDirectory, fileName);
  const actualSha256 = digest("sha256", downloadedPath, "hex");
  if (actualSha256 !== expectedSha256) {
    fail(`SHA-256 mismatch for ${fileName}: expected ${expectedSha256}, received ${actualSha256}`);
  }

  const packedManifest = JSON.parse(command("tar", ["-xOf", downloadedPath, "package/package.json"]));
  if (packedManifest.name !== "@wstein/regrip-core" || packedManifest.version !== version) {
    fail(`artifact manifest is ${packedManifest.name}@${packedManifest.version}, expected @wstein/regrip-core@${version}`);
  }

  const releaseUrl = `https://github.com/${REGRIP_REPOSITORY}/releases/download/${tag}/${fileName}`;

  const packagePath = "package.json";
  const packageManifest = JSON.parse(readFileSync(packagePath, "utf8"));
  packageManifest.dependencies["@wstein/regrip-core"] = releaseUrl;
  writeFileSync(packagePath, `${JSON.stringify(packageManifest, null, 2)}\n`);

  command("npm", ["install", "--package-lock-only"], {inherit: true});

  const expectedSha512 = digest("sha512", downloadedPath, "base64");
  const lockfile = readFileSync("package-lock.json", "utf8");
  if (!lockfile.includes(`sha512-${expectedSha512}`)) {
    fail("package-lock.json does not contain the downloaded artifact's SHA-512 integrity value");
  }

  console.log(`Updated @wstein/regrip-core to ${version}`);
  console.log(`Release URL: ${releaseUrl}`);
  console.log(`Artifact SHA-256: ${actualSha256}`);
  console.log("Review the diff, run npm test and npm run build, then commit the update.");
} finally {
  rmSync(temporaryDirectory, {recursive: true, force: true});
}
