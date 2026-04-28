const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const projectRoot = process.cwd();
const targetPackage = process.argv[2];
const issuerPackage = process.argv[3];

let req = createRequire(path.join(projectRoot, "package.json"));
if (issuerPackage) {
  req = createRequire(req.resolve(issuerPackage));
}

let current = path.dirname(req.resolve(targetPackage));
for (;;) {
  const packageJson = path.join(current, "package.json");
  if (fs.existsSync(packageJson)) {
    process.stdout.write(packageJson);
    break;
  }

  const parent = path.dirname(current);
  if (parent === current) {
    throw new Error(`Could not find package.json for ${targetPackage}.`);
  }
  current = parent;
}
