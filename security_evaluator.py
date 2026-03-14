"""
Code Security Evaluator
Scans source files for common security vulnerabilities and reports findings.
"""

import ast
import re
import sys
import json
import argparse
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

SEVERITY_CRITICAL = "CRITICAL"
SEVERITY_HIGH = "HIGH"
SEVERITY_MEDIUM = "MEDIUM"
SEVERITY_LOW = "LOW"
SEVERITY_INFO = "INFO"


@dataclass
class Finding:
    file: str
    line: int
    severity: str
    rule_id: str
    title: str
    description: str
    snippet: str = ""


@dataclass
class ScanResult:
    files_scanned: int = 0
    findings: list = field(default_factory=list)

    def add(self, finding: Finding):
        self.findings.append(finding)

    def by_severity(self):
        order = [SEVERITY_CRITICAL, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_LOW, SEVERITY_INFO]
        return sorted(self.findings, key=lambda f: order.index(f.severity))

    def summary(self):
        counts = {}
        for f in self.findings:
            counts[f.severity] = counts.get(f.severity, 0) + 1
        return counts


# ---------------------------------------------------------------------------
# Rule helpers
# ---------------------------------------------------------------------------

def _snippet(lines: list[str], lineno: int, context: int = 0) -> str:
    start = max(0, lineno - 1 - context)
    end = min(len(lines), lineno + context)
    return "\n".join(
        f"  {i+1:4d} | {lines[i]}" for i in range(start, end)
    ).rstrip()


# ---------------------------------------------------------------------------
# Python AST-based rules
# ---------------------------------------------------------------------------

DANGEROUS_FUNCTIONS = {
    "eval": (SEVERITY_CRITICAL, "SEC001", "Use of eval()",
             "eval() executes arbitrary code and is a common injection vector."),
    "exec": (SEVERITY_CRITICAL, "SEC002", "Use of exec()",
             "exec() executes arbitrary code and is a common injection vector."),
    "compile": (SEVERITY_HIGH, "SEC003", "Use of compile()",
                "compile() can execute arbitrary code; review usage carefully."),
    "__import__": (SEVERITY_HIGH, "SEC004", "Dynamic import via __import__()",
                   "Dynamic imports can be abused to load malicious modules."),
    "pickle.loads": (SEVERITY_HIGH, "SEC005", "Unsafe deserialization with pickle",
                     "pickle.loads() on untrusted data allows arbitrary code execution."),
    "marshal.loads": (SEVERITY_HIGH, "SEC006", "Unsafe deserialization with marshal",
                      "marshal.loads() on untrusted data is unsafe."),
    "subprocess.call": (SEVERITY_MEDIUM, "SEC007", "subprocess.call() usage",
                        "Ensure shell=False and inputs are sanitized to prevent command injection."),
    "subprocess.run": (SEVERITY_MEDIUM, "SEC008", "subprocess.run() usage",
                       "Ensure shell=False and inputs are sanitized to prevent command injection."),
    "subprocess.Popen": (SEVERITY_MEDIUM, "SEC009", "subprocess.Popen() usage",
                         "Ensure shell=False and inputs are sanitized to prevent command injection."),
    "os.system": (SEVERITY_HIGH, "SEC010", "os.system() usage",
                  "os.system() passes commands to the shell; prefer subprocess with shell=False."),
    "os.popen": (SEVERITY_HIGH, "SEC011", "os.popen() usage",
                 "os.popen() is vulnerable to shell injection; use subprocess instead."),
}

HARDCODED_SECRET_PATTERNS = [
    (re.compile(r'(?i)(password|passwd|pwd|secret|api_key|apikey|token|auth_token)\s*=\s*["\'][^"\']{4,}["\']'),
     SEVERITY_HIGH, "SEC020", "Hardcoded credential",
     "Hardcoded credentials should be stored in environment variables or a secrets manager."),
    (re.compile(r'(?i)aws_access_key_id\s*=\s*["\'][A-Z0-9]{16,}["\']'),
     SEVERITY_CRITICAL, "SEC021", "Hardcoded AWS access key",
     "AWS access keys must never be hardcoded in source code."),
    (re.compile(r'(?i)aws_secret_access_key\s*=\s*["\'][A-Za-z0-9/+=]{30,}["\']'),
     SEVERITY_CRITICAL, "SEC022", "Hardcoded AWS secret key",
     "AWS secret keys must never be hardcoded in source code."),
    (re.compile(r'-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'),
     SEVERITY_CRITICAL, "SEC023", "Private key in source code",
     "Private keys must never be committed to source control."),
    (re.compile(r'(?i)(bearer\s+)[a-zA-Z0-9\-_.]{20,}'),
     SEVERITY_HIGH, "SEC024", "Hardcoded bearer token",
     "Bearer tokens must not be hardcoded in source files."),
]

INSECURE_HASH_PATTERNS = [
    (re.compile(r'\bhashlib\.md5\b'), SEVERITY_MEDIUM, "SEC030", "Use of MD5",
     "MD5 is cryptographically broken; use SHA-256 or stronger."),
    (re.compile(r'\bhashlib\.sha1\b'), SEVERITY_MEDIUM, "SEC031", "Use of SHA-1",
     "SHA-1 is deprecated for security use; use SHA-256 or stronger."),
]

SQL_INJECTION_PATTERN = re.compile(
    r'(?i)(execute|query|raw|cursor\.execute)\s*\(\s*["\'].*?(%s|{|}|format|%\s*\()',
)

SHELL_TRUE_PATTERN = re.compile(r'shell\s*=\s*True')

PATH_TRAVERSAL_PATTERN = re.compile(r'(?i)(open|read|write)\s*\(\s*.*\.\s*(join|format|replace)')


class PythonASTVisitor(ast.NodeVisitor):
    """Walk a Python AST and collect security findings."""

    def __init__(self, filepath: str, lines: list[str], result: ScanResult):
        self.filepath = filepath
        self.lines = lines
        self.result = result
        self._imports: dict[str, str] = {}  # alias -> module

    def _add(self, node, severity, rule_id, title, description):
        lineno = getattr(node, "lineno", 0)
        self.result.add(Finding(
            file=self.filepath,
            line=lineno,
            severity=severity,
            rule_id=rule_id,
            title=title,
            description=description,
            snippet=_snippet(self.lines, lineno),
        ))

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            name = alias.asname or alias.name
            self._imports[name] = alias.name
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        module = node.module or ""
        for alias in node.names:
            name = alias.asname or alias.name
            self._imports[name] = f"{module}.{alias.name}"
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        func_name = self._resolve_call(node.func)
        if func_name in DANGEROUS_FUNCTIONS:
            severity, rule_id, title, description = DANGEROUS_FUNCTIONS[func_name]
            self._add(node, severity, rule_id, title, description)

        # shell=True detection
        for kw in node.keywords:
            if kw.arg == "shell" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                self._add(node, SEVERITY_HIGH, "SEC040", "shell=True in subprocess call",
                          "Using shell=True exposes the command to shell injection. Pass arguments as a list instead.")

        self.generic_visit(node)

    def _resolve_call(self, node) -> str:
        if isinstance(node, ast.Name):
            # Check if it maps to a known dangerous full name
            full = self._imports.get(node.id, node.id)
            return full
        if isinstance(node, ast.Attribute):
            value = self._resolve_call(node.value)
            return f"{value}.{node.attr}"
        return ""

    def visit_Assert(self, node: ast.Assert):
        # assert statements are stripped with python -O
        self._add(node, SEVERITY_LOW, "SEC050", "Security check via assert",
                  "assert statements are removed when Python runs with optimisations (-O). "
                  "Use explicit if/raise checks for security-critical validation.")
        self.generic_visit(node)


# ---------------------------------------------------------------------------
# Generic text-based rules (language-agnostic)
# ---------------------------------------------------------------------------

def scan_text_rules(filepath: str, lines: list[str], result: ScanResult):
    text = "\n".join(lines)

    # Hardcoded secrets
    for pattern, severity, rule_id, title, description in HARDCODED_SECRET_PATTERNS:
        for m in pattern.finditer(text):
            lineno = text[: m.start()].count("\n") + 1
            result.add(Finding(
                file=filepath, line=lineno, severity=severity,
                rule_id=rule_id, title=title, description=description,
                snippet=_snippet(lines, lineno),
            ))

    # Insecure hashes
    for pattern, severity, rule_id, title, description in INSECURE_HASH_PATTERNS:
        for m in pattern.finditer(text):
            lineno = text[: m.start()].count("\n") + 1
            result.add(Finding(
                file=filepath, line=lineno, severity=severity,
                rule_id=rule_id, title=title, description=description,
                snippet=_snippet(lines, lineno),
            ))

    # SQL injection hints
    for m in SQL_INJECTION_PATTERN.finditer(text):
        lineno = text[: m.start()].count("\n") + 1
        result.add(Finding(
            file=filepath, line=lineno, severity=SEVERITY_HIGH,
            rule_id="SEC060", title="Potential SQL injection",
            description="String formatting in SQL queries can allow SQL injection. "
                        "Use parameterised queries or an ORM.",
            snippet=_snippet(lines, lineno),
        ))


# ---------------------------------------------------------------------------
# File scanner
# ---------------------------------------------------------------------------

PYTHON_EXTENSIONS = {".py"}
TEXT_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go",
                   ".rb", ".php", ".cs", ".cpp", ".c", ".h", ".sh", ".yaml", ".yml", ".env"}

# Files/dirs to skip
SKIP_DIRS = {"__pycache__", ".git", "node_modules", ".venv", "venv", "dist", "build"}
SKIP_FILES = {".DS_Store"}


def scan_file(path: Path, result: ScanResult):
    if path.name in SKIP_FILES:
        return
    suffix = path.suffix.lower()
    if suffix not in TEXT_EXTENSIONS:
        return

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return

    lines = text.splitlines()
    result.files_scanned += 1
    filepath = str(path)

    # Text-based rules for all supported extensions
    scan_text_rules(filepath, lines, result)

    # Python AST rules
    if suffix in PYTHON_EXTENSIONS:
        try:
            tree = ast.parse(text, filename=filepath)
            visitor = PythonASTVisitor(filepath, lines, result)
            visitor.visit(tree)
        except SyntaxError:
            pass  # Can't parse; text rules still ran


def scan_directory(root: Path, result: ScanResult):
    for entry in root.rglob("*"):
        if entry.is_dir():
            if entry.name in SKIP_DIRS:
                continue
        elif entry.is_file():
            if any(part in SKIP_DIRS for part in entry.parts):
                continue
            scan_file(entry, result)


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

SEVERITY_COLOR = {
    SEVERITY_CRITICAL: "\033[1;31m",  # bold red
    SEVERITY_HIGH:     "\033[31m",    # red
    SEVERITY_MEDIUM:   "\033[33m",    # yellow
    SEVERITY_LOW:      "\033[34m",    # blue
    SEVERITY_INFO:     "\033[36m",    # cyan
}
RESET = "\033[0m"


def report_text(result: ScanResult, use_color: bool = True):
    lines_out = []
    findings = result.by_severity()

    if not findings:
        lines_out.append("No security issues found.")
    else:
        for f in findings:
            color = SEVERITY_COLOR.get(f.severity, "") if use_color else ""
            reset = RESET if use_color else ""
            lines_out.append(
                f"{color}[{f.severity}]{reset} {f.rule_id}: {f.title}\n"
                f"  File: {f.file}:{f.line}\n"
                f"  {f.description}"
            )
            if f.snippet:
                lines_out.append(f.snippet)
            lines_out.append("")

    summary = result.summary()
    lines_out.append(f"Files scanned : {result.files_scanned}")
    lines_out.append(f"Total findings: {len(result.findings)}")
    for sev in [SEVERITY_CRITICAL, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_LOW, SEVERITY_INFO]:
        if sev in summary:
            color = SEVERITY_COLOR.get(sev, "") if use_color else ""
            reset = RESET if use_color else ""
            lines_out.append(f"  {color}{sev}{reset}: {summary[sev]}")

    return "\n".join(lines_out)


def report_json(result: ScanResult) -> str:
    data = {
        "files_scanned": result.files_scanned,
        "total_findings": len(result.findings),
        "summary": result.summary(),
        "findings": [asdict(f) for f in result.by_severity()],
    }
    return json.dumps(data, indent=2)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Evaluate source code for common security vulnerabilities."
    )
    parser.add_argument(
        "paths", nargs="+", metavar="PATH",
        help="Files or directories to scan",
    )
    parser.add_argument(
        "--format", choices=["text", "json"], default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--no-color", action="store_true",
        help="Disable ANSI color output",
    )
    parser.add_argument(
        "--min-severity",
        choices=[SEVERITY_CRITICAL, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_LOW, SEVERITY_INFO],
        default=SEVERITY_INFO,
        help="Only report findings at or above this severity (default: INFO)",
    )
    parser.add_argument(
        "--fail-on",
        choices=[SEVERITY_CRITICAL, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_LOW, SEVERITY_INFO],
        default=None,
        help="Exit with non-zero status if any finding meets this severity or higher",
    )
    args = parser.parse_args()

    result = ScanResult()
    severity_order = [SEVERITY_CRITICAL, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_LOW, SEVERITY_INFO]
    min_idx = severity_order.index(args.min_severity)

    for raw_path in args.paths:
        p = Path(raw_path)
        if p.is_dir():
            scan_directory(p, result)
        elif p.is_file():
            scan_file(p, result)
        else:
            print(f"Warning: {raw_path} does not exist", file=sys.stderr)

    # Filter by min severity
    result.findings = [
        f for f in result.findings
        if severity_order.index(f.severity) <= min_idx
    ]

    if args.format == "json":
        print(report_json(result))
    else:
        print(report_text(result, use_color=not args.no_color))

    # Exit code
    if args.fail_on:
        fail_idx = severity_order.index(args.fail_on)
        for f in result.findings:
            if severity_order.index(f.severity) <= fail_idx:
                sys.exit(1)


if __name__ == "__main__":
    main()
