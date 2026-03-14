"""Tests for the code security evaluator."""

import ast
import textwrap
import unittest
from pathlib import Path
from unittest.mock import patch
import tempfile
import os

from security_evaluator import (
    ScanResult,
    Finding,
    PythonASTVisitor,
    scan_text_rules,
    scan_file,
    scan_directory,
    report_text,
    report_json,
    SEVERITY_CRITICAL,
    SEVERITY_HIGH,
    SEVERITY_MEDIUM,
    SEVERITY_LOW,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_and_visit(source: str) -> ScanResult:
    result = ScanResult()
    lines = source.splitlines()
    tree = ast.parse(textwrap.dedent(source))
    visitor = PythonASTVisitor("<test>", lines, result)
    visitor.visit(tree)
    return result


def _text_scan(source: str) -> ScanResult:
    result = ScanResult()
    lines = source.splitlines()
    scan_text_rules("<test>", lines, result)
    return result


def _rule_ids(result: ScanResult) -> set:
    return {f.rule_id for f in result.findings}


# ---------------------------------------------------------------------------
# AST-based rules
# ---------------------------------------------------------------------------

class TestEvalExec(unittest.TestCase):
    def test_eval_detected(self):
        result = _parse_and_visit("eval(user_input)")
        self.assertIn("SEC001", _rule_ids(result))

    def test_exec_detected(self):
        result = _parse_and_visit("exec(cmd)")
        self.assertIn("SEC002", _rule_ids(result))

    def test_safe_call_not_flagged(self):
        result = _parse_and_visit("print('hello')")
        self.assertEqual(result.findings, [])


class TestDangerousSubprocess(unittest.TestCase):
    def test_os_system(self):
        result = _parse_and_visit("import os\nos.system('ls')")
        self.assertIn("SEC010", _rule_ids(result))

    def test_shell_true(self):
        src = "import subprocess\nsubprocess.run(['ls'], shell=True)"
        result = _parse_and_visit(src)
        self.assertIn("SEC040", _rule_ids(result))

    def test_shell_false_not_flagged(self):
        src = "import subprocess\nsubprocess.run(['ls'], shell=False)"
        result = _parse_and_visit(src)
        # SEC008 may fire for subprocess.run usage, but NOT SEC040
        self.assertNotIn("SEC040", _rule_ids(result))


class TestUnsafeDeserialization(unittest.TestCase):
    def test_pickle_loads(self):
        src = "import pickle\npickle.loads(data)"
        result = _parse_and_visit(src)
        self.assertIn("SEC005", _rule_ids(result))


class TestAssertSecurity(unittest.TestCase):
    def test_assert_flagged(self):
        result = _parse_and_visit("assert user_is_admin()")
        self.assertIn("SEC050", _rule_ids(result))


# ---------------------------------------------------------------------------
# Text-based rules
# ---------------------------------------------------------------------------

class TestHardcodedSecrets(unittest.TestCase):
    def test_hardcoded_password(self):
        result = _text_scan("password = 'super_secret_123'")
        self.assertIn("SEC020", _rule_ids(result))

    def test_hardcoded_api_key(self):
        result = _text_scan('api_key = "sk-abcdefghijklmno"')
        self.assertIn("SEC020", _rule_ids(result))

    def test_private_key(self):
        result = _text_scan("-----BEGIN RSA PRIVATE KEY-----\nMIIE...")
        self.assertIn("SEC023", _rule_ids(result))

    def test_no_false_positive_empty_password(self):
        result = _text_scan("password = ''")
        # Short value (< 4 chars) should not trigger
        self.assertNotIn("SEC020", _rule_ids(result))


class TestInsecureHash(unittest.TestCase):
    def test_md5(self):
        result = _text_scan("h = hashlib.md5(data).hexdigest()")
        self.assertIn("SEC030", _rule_ids(result))

    def test_sha1(self):
        result = _text_scan("hashlib.sha1(b'data')")
        self.assertIn("SEC031", _rule_ids(result))

    def test_sha256_ok(self):
        result = _text_scan("hashlib.sha256(b'data')")
        self.assertEqual(result.findings, [])


class TestSQLInjection(unittest.TestCase):
    def test_format_string_in_query(self):
        src = 'cursor.execute("SELECT * FROM users WHERE id = %s" % user_id)'
        result = _text_scan(src)
        self.assertIn("SEC060", _rule_ids(result))

    def test_parameterised_ok(self):
        src = 'cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))'
        result = _text_scan(src)
        self.assertNotIn("SEC060", _rule_ids(result))


# ---------------------------------------------------------------------------
# File & directory scanning
# ---------------------------------------------------------------------------

class TestFileScan(unittest.TestCase):
    def _write_temp(self, content: str, suffix: str = ".py") -> Path:
        fd, path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "w") as f:
            f.write(content)
        return Path(path)

    def tearDown(self):
        pass  # temp files cleaned by OS

    def test_py_file_scanned(self):
        p = self._write_temp("eval(x)\n")
        result = ScanResult()
        scan_file(p, result)
        self.assertEqual(result.files_scanned, 1)
        self.assertIn("SEC001", _rule_ids(result))
        p.unlink()

    def test_unsupported_extension_skipped(self):
        p = self._write_temp("eval(x)\n", suffix=".xyz")
        result = ScanResult()
        scan_file(p, result)
        self.assertEqual(result.files_scanned, 0)
        p.unlink()

    def test_directory_scan(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            (Path(tmpdir) / "a.py").write_text("eval(x)\n")
            (Path(tmpdir) / "b.py").write_text("exec(cmd)\n")
            result = ScanResult()
            scan_directory(Path(tmpdir), result)
            self.assertEqual(result.files_scanned, 2)
            rule_ids = _rule_ids(result)
            self.assertIn("SEC001", rule_ids)
            self.assertIn("SEC002", rule_ids)

    def test_skip_dirs(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skip = Path(tmpdir) / "__pycache__"
            skip.mkdir()
            (skip / "evil.py").write_text("eval(x)\n")
            result = ScanResult()
            scan_directory(Path(tmpdir), result)
            self.assertEqual(result.files_scanned, 0)


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

class TestReporting(unittest.TestCase):
    def _make_result(self) -> ScanResult:
        r = ScanResult(files_scanned=3)
        r.add(Finding("a.py", 1, SEVERITY_CRITICAL, "SEC001", "eval", "desc"))
        r.add(Finding("b.py", 5, SEVERITY_HIGH, "SEC010", "os.system", "desc"))
        r.add(Finding("b.py", 10, SEVERITY_MEDIUM, "SEC030", "md5", "desc"))
        return r

    def test_text_report_contains_severity(self):
        r = self._make_result()
        out = report_text(r, use_color=False)
        self.assertIn("CRITICAL", out)
        self.assertIn("HIGH", out)
        self.assertIn("Files scanned", out)

    def test_json_report_structure(self):
        import json
        r = self._make_result()
        out = json.loads(report_json(r))
        self.assertEqual(out["files_scanned"], 3)
        self.assertEqual(out["total_findings"], 3)
        self.assertIn("findings", out)
        self.assertIn("summary", out)

    def test_by_severity_order(self):
        r = self._make_result()
        ordered = r.by_severity()
        sevs = [f.severity for f in ordered]
        self.assertEqual(sevs[0], SEVERITY_CRITICAL)
        self.assertEqual(sevs[-1], SEVERITY_MEDIUM)

    def test_empty_result(self):
        r = ScanResult(files_scanned=1)
        out = report_text(r, use_color=False)
        self.assertIn("No security issues found", out)


if __name__ == "__main__":
    unittest.main()
