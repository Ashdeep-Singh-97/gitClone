const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

console.error("Logs from your program will appear here!");

const command = process.argv[2];

switch (command) {
  case "init":
    createGitDirectory();
    break;
  case "cat-file":
    handleCatfile();
    break;
  case "hash-object":
    handleHashObject();
    break;
  case "ls-tree":
    handleTree();
    break;
  case "write-tree":
    handleWriteTree();
    break;
  case "commit-tree":
    handleCommit();
    break;
  default:
    throw new Error(`Unknown command ${command}`);
}

function createGitDirectory() {
  fs.mkdirSync(path.join(process.cwd(), ".git"), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), ".git", "objects"), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), ".git", "refs"), { recursive: true });

  fs.writeFileSync(path.join(process.cwd(), ".git", "HEAD"), "ref: refs/heads/main\n");
  console.log("Initialized git directory");
}

function handleCatfile() {
  const flag = process.argv[3];
  const hash = process.argv[4];

  const folder = hash.slice(0, 2);
  const file = hash.slice(2);

  const filePath = path.join(process.cwd(), ".git", "objects", folder, file);

  if (fs.existsSync(filePath) == false) {
    throw new Error('Not a valid path');
  }
  const content = fs.readFileSync(filePath);
  // console.log(content);

  const decodedContent = zlib.inflateSync(content);

  const result = decodedContent.toString();

  // console.log(result);
  process.stdout.write(result);
}

function handleHashObject() {
  const flag = process.argv[3];
  const file = process.argv[4];
  const filePath = path.join(process.cwd(), "app", file);

  if (fs.existsSync(filePath) == false) {
    throw new Error('Not a valid path');
  }
  const content = fs.readFileSync(filePath);
  const SHA = hash(content);
  console.log(SHA);

  const folder = SHA.slice(0, 2);
  const fileName = SHA.slice(2);

  const dirPath = path.join(process.cwd(), ".git", "objects", folder);
  fs.mkdirSync(dirPath, { recursive: true });

  const finalPath = path.join(dirPath, fileName);
  const deflatedContent = zlib.deflateSync(content);

  fs.writeFileSync(finalPath, deflatedContent);

}

function handleTree() {
  const flag = process.argv[3];
  const hash = process.argv[4];

  const folder = hash.slice(0, 2);
  const file = hash.slice(2);

  const filePath = path.join(process.cwd(), ".git", "objects", folder, file);

  if (fs.existsSync(filePath) == false) {
    throw new Error('Not a valid path');
  }
  const content = fs.readFileSync(filePath);
  // console.log(content);

  const decodedContent = zlib.inflateSync(content);
  const result = decodedContent.toString().split("\0");
  // console.log(result);

  const treeContent = result.slice(1).filter((e) => e.includes(" "));
  // console.log(treeContent);
  const names = treeContent.map((e) => e.split(" ")[1]);
  // console.log(names);
  names.forEach((name) => process.stdout.write(`${name}`))
}

function handleWriteTree() {
  const sha = handleWriteTreeHelper(process.cwd());
  process.stdout.write(sha);
}

function handleCommit(){
  const treeSHA = process.argv[3];
  const commitSHA = process.argv[5];
  const commitMessage = process.argv[7];

  const commitContentBuffer = Buffer.concat([
    Buffer.from(`tree ${treeSHA}\n`),
    Buffer.from(`parent ${commitSHA}\n`),
    Buffer.from(
      `author Ashdeep Singh <ashdeepsingh1997@gmail.com> ${Date.now()} +0000\n`
    ),
    Buffer.from(
      `committer Ashdeep Singh <ashdeepsingh1997@gmail.com> ${Date.now()} +0000\n\n`
    ),
    Buffer.from(`${commitMessage}`),
  ]);

  const header = `commit ${commitContentBuffer.length}\0`;
  const data = Buffer.concat([Buffer.from(header), commitContentBuffer]);

  const hash = crypto.createHash("sha1").update(data).digest("hex");

  const folder = hash.slice(0,2);
  const file = hash.slice(2);

  const completeFolderPath = path.join(process.cwd(),".git","objects",folder);

  if(!fs.existsSync(completeFolderPath)) fs.mkdirSync(completeFolderPath);
  const compressedData = zlib.deflateSync(data);

  fs.writeFileSync(path.join(completeFolderPath, file), compressedData);

  process.stdout.write(hash);
}

function hash(string) {
  return crypto.createHash('sha1').update(string).digest('hex');
}

function handleWriteTreeHelper(basePath) {
  const dirContents = fs.readFileSync(basePath);
  const result = [];

  for (const dirContent of dirContents) {
    if (dirContent.includes(".git")) {
      continue;
    }

    const currentPath = path.join(basePath, dirContent);
    const stat = fs.statSync(currentPath);

    if (stat.isDirectory()) {
      handleWriteTreeHelper(currentPath);
    } else if (stat.isFile()) {
      const sha = writeFileBlob(currentPath);
      result.push({
        mode: '100644',
        basename: path.basename(currentPath),
        sha,
      });
    }
  }

  if (dirContents.length === 0 || result.length === 0) return;

  const treeData = result.reduce((acc, current) => {
    const { mode, basename, sha } = current;
    return Buffer.concat([
      acc,
      Buffer.from(`${mode} ${basename}\0`),
      Buffer.from(sha, "hex"),
    ])
  }, Buffer.alloc(0))

  const tree = Buffer.concat([Buffer.from(`tree ${treeData.length}\0`),
    treeData,
  ]);

  const hash = crypto.createHash('sha1').update(tree).digest('hex');

  const folder = hash.slice(0, 2);
  const file = hash.slice(2);

  const treeFolderPath = path.join(process.cwd(), ".git", "objects", folder);

  if (fs.existsSync(treeFolderPath) == false) {
    fs.mkdirSync(treeFolderPath);
  }

  const compressed = zlib.deflateSync(tree);
  fs.writeFileSync(path.join(treeFolderPath, file), compressed);

  return hash;
}

function writeFileBlob(currentPath) {
  const contents = fs.readFileSync(currentPath);
  const len = contents.length;

  const header = `blob ${len}\0`;
  const blob = Buffer.concat([Buffer.from(header), contents]);

  const hash = crypto.createHash("sha1").update(blob).digest("hex");

  const folder = hash.slice(0, 2);
  const file = hash.slice(2);

  const completeFolderPath = path.join(process.cwd(), ".git", "objects", folder);

  if (!fs.existsSync(completeFolderPath)) fs.mkdirSync(completeFolderPath);

  const compressedData = zlib.deflateSync(blob);
  fs.writeFileSync(path.join(completeFolderPath, file), compressedData);

  return hash;
}

