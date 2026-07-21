const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "app");

const PATTERNS = [
  ["PS_SetContent", /^\s*Set-Content\b/m],
  ["PS_here_start", /^\s*@'\s*$/m],
  ["PS_here_end", /^\s*'@\s*$/m],
  ["BAD_fetch_tpl", /return\s+fetch\(\$\{base\},/m],
  ["BAD_windows_path", /D:\\APPden\\/m],
  ["BAD_regex_path", /path\s*:\s*\/;/m],
  ["BAD_apiFetch_quote", /`"\/\$\{path\}`"/m],
  ["BAD_fetch_api_rel", /fetch\(\s*`?api\//m],
  ["BAD_colors_dot", /from\s+"\.\/constants\/colors"/m],
];

function walk(dir, out) {
  out = out || [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = walk(ROOT, []);
const findings = [];

for (const file of files) {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pr of PATTERNS) {
    const kind = pr[0];
    const re = pr[1];
    if (re.test(text)) {
      findings.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        kind,
      });
    }
  }
}

findings.sort((a, b) => (a.file + a.kind).localeCompare(b.file + b.kind));

const lines = findings.map((f) => f.file + "\t" + f.kind);
fs.writeFileSync(path.join(__dirname, "SCAN_REPORT.tsv"), lines.join("\n"), "utf8");

console.log("OK -> SCAN_REPORT.tsv | rows:", lines.length);
