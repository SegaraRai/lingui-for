const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const projectRoot = process.cwd();
const targetPackage = process.argv[2];
const issuerPackage = process.argv[3];

const rootRequire = createRequire(path.join(projectRoot, "package.json"));
const issuerPackageJson = issuerPackage
  ? resolvePackageJson(issuerPackage, rootRequire, projectRoot)
  : null;
const req = issuerPackageJson ? createRequire(issuerPackageJson) : rootRequire;
const baseDir = issuerPackageJson
  ? path.dirname(issuerPackageJson)
  : projectRoot;
const targetPackageJson = resolvePackageJson(targetPackage, req, baseDir);

process.stdout.write(targetPackageJson);

function resolvePackageJson(packageName, req, baseDir) {
  const packageJsonFromExport = resolvePackageJsonExport(packageName, req);
  if (packageJsonFromExport) {
    return packageJsonFromExport;
  }

  const packageJsonFromEntry = resolvePackageEntry(packageName, req);
  if (packageJsonFromEntry) {
    return packageJsonFromEntry;
  }

  const packageJsonFromNodeModules = findPackageJsonInNodeModules(
    packageName,
    baseDir,
  );
  if (packageJsonFromNodeModules) {
    return packageJsonFromNodeModules;
  }

  throw new Error(`Could not find package.json for ${packageName}.`);
}

function resolvePackageJsonExport(packageName, req) {
  try {
    return req.resolve(`${packageName}/package.json`);
  } catch {
    return null;
  }
}

function resolvePackageEntry(packageName, req) {
  try {
    return findNearestPackageJson(path.dirname(req.resolve(packageName)));
  } catch {
    return null;
  }
}

function findNearestPackageJson(startDir) {
  let current = startDir;
  for (;;) {
    const packageJson = path.join(current, "package.json");
    if (fs.existsSync(packageJson)) {
      return packageJson;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function findPackageJsonInNodeModules(packageName, startDir) {
  const packagePath = getPackagePath(packageName);
  let current = startDir;
  for (;;) {
    const packageJson = path.join(
      current,
      "node_modules",
      ...packagePath,
      "package.json",
    );
    if (fs.existsSync(packageJson)) {
      return packageJson;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function getPackagePath(packageName) {
  const parts = packageName.split("/");
  if (packageName.startsWith("@")) {
    return parts.slice(0, 2);
  }
  return parts.slice(0, 1);
}
