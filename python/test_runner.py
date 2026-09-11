import json
from pathlib import Path
import subprocess
import sys
import unittest

from runner import run_code


class PythonMachineTests(unittest.TestCase):
    def test_line_is_completed_and_reassignment_is_explicit(self):
        result = run_code("x = 4\ny = x + 3\nif y > 5:\n    x = y * 2\nprint(x)")
        self.assertIsNone(result["error"])
        self.assertEqual(result["output"], "14\n")
        self.assertEqual(result["events"][0]["line"], 1)
        self.assertEqual(result["events"][0]["locals"]["x"], "4")
        change = next(event for event in result["events"] if event["line"] == 4)
        self.assertIn({"name": "x", "before": "4", "after": "14"}, change["changes"])
        branch = next(event for event in result["events"] if event["event"] == "branch")
        self.assertTrue(branch["decision"])
        self.assertEqual(branch["line"], 3)

    def test_branch_expression_evaluates_once(self):
        result = run_code("values = [1, 2]\nif values.pop() == 2:\n    print(values)")
        self.assertEqual(result["output"], "[1]\n")
        self.assertIsNone(result["error"])

    def test_short_circuit_does_not_evaluate_unused_expression(self):
        result = run_code("x = 0\nif x and 5 / x:\n    print('bad')\nelse:\n    print('safe')")
        self.assertIsNone(result["error"])
        self.assertEqual(result["output"], "safe\n")

    def test_mutable_snapshots_do_not_change_later(self):
        result = run_code("items = [2]\nalias = items\nitems.append(7)\nprint(alias)")
        self.assertEqual(result["events"][0]["locals"]["items"], "[2]")
        mutation = next(event for event in result["events"] if event["line"] == 3)
        self.assertEqual(mutation["locals"]["alias"], "[2, 7]")
        self.assertEqual({change["name"] for change in mutation["changes"]}, {"items", "alias"})

    def test_nested_loop_iteration_resets_per_entry(self):
        result = run_code("for a in range(2):\n    for b in range(2):\n        print(a, b)")
        outer = [event["iteration"] for event in result["events"] if event["event"] == "loop" and event["line"] == 1]
        inner = [event["iteration"] for event in result["events"] if event["event"] == "loop" and event["line"] == 2]
        self.assertEqual(outer, [1, 2])
        self.assertEqual(inner, [1, 2, 1, 2])
        self.assertEqual(result["output"], "0 0\n0 1\n1 0\n1 1\n")

    def test_while_break_continue_semantics(self):
        result = run_code("n = 0\nwhile n < 5:\n    n += 1\n    if n == 2:\n        continue\n    if n == 4:\n        break\n    print(n)")
        self.assertEqual(result["output"], "1\n3\n")
        self.assertIsNone(result["error"])
        self.assertEqual([e["iteration"] for e in result["events"] if e["event"] == "loop"], [1, 2, 3, 4])

    def test_calls_parameters_return_and_caller_assignment_order(self):
        result = run_code("def double(number):\n    return number * 2\nx = double(7)\nprint(x)")
        call = next(e for e in result["events"] if e["event"] == "call")
        returned = next(e for e in result["events"] if e["event"] == "return")
        assigned = next(e for e in result["events"] if e["line"] == 3 and e["event"] == "line")
        self.assertEqual(call["parameters"], {"number": "7"})
        self.assertEqual([frame["function"] for frame in call["stack"]], ["<module>", "double"])
        self.assertEqual(returned["returnValue"], "14")
        self.assertLess(returned["step"], assigned["step"])
        self.assertEqual(assigned["locals"]["x"], "14")

    def test_local_and_global_scope_are_separate(self):
        result = run_code("x = 5\ndef f(x):\n    x += 2\n    return x\nprint(f(1), x)")
        change = next(e for e in result["events"] if e["line"] == 3)
        self.assertEqual(change["locals"]["x"], "3")
        self.assertEqual(change["globals"]["x"], "5")
        self.assertEqual(result["output"], "3 5\n")

    def test_mutable_default_is_real_python(self):
        result = run_code("def add(x, bag=[]):\n    bag.append(x)\n    return bag\nprint(add(1))\nprint(add(2))")
        self.assertEqual(result["output"], "[1]\n[1, 2]\n")

    def test_handled_exception_and_finally_continue(self):
        result = run_code("try:\n    x = 4 / 0\nexcept ZeroDivisionError:\n    print('caught')\nfinally:\n    print('finished')")
        self.assertIsNone(result["error"])
        self.assertEqual(result["output"], "caught\nfinished\n")
        self.assertTrue(any(e["event"] == "exception" and e["line"] == 2 for e in result["events"]))

    def test_unhandled_exception_has_original_line_and_no_fake_return(self):
        result = run_code("def fail():\n    return 1 / 0\nfail()")
        self.assertEqual(result["error"]["type"], "ZeroDivisionError")
        self.assertEqual(result["error"]["line"], 2)
        self.assertFalse(any(e["event"] == "return" for e in result["events"]))

    def test_finally_does_not_disguise_exception_as_none_return(self):
        result = run_code("def f():\n    try:\n        return 1 / 0\n    finally:\n        print('finished')\nf()")
        self.assertEqual(result["error"]["type"], "ZeroDivisionError")
        self.assertEqual(result["output"], "finished\n")
        self.assertFalse(any(e["event"] == "return" for e in result["events"]))

    def test_return_after_finally_preserves_the_original_return_line(self):
        result = run_code("def f():\n    try:\n        return 7\n    finally:\n        print('finished')\nprint(f())")
        self.assertIsNone(result["error"])
        returned = next(e for e in result["events"] if e["event"] == "return")
        self.assertEqual(returned["returnValue"], "7")
        self.assertEqual(returned["line"], 3)
        self.assertEqual(returned["output"], "finished\n")

    def test_infinite_loop_is_truncated(self):
        result = run_code("while True:\n    pass", max_events=20)
        self.assertTrue(result["truncated"])
        self.assertEqual(result["error"]["type"], "TraceLimit")
        self.assertEqual(len(result["events"]), 20)

    def test_output_cap_and_time_limit_are_visible(self):
        result = run_code("print('x' * 100)", max_output=12)
        self.assertEqual(result["output"], "x" * 12)
        self.assertTrue(result["truncated"])
        result = run_code("x = 1", max_seconds=-1)
        self.assertTrue(result["truncated"])
        self.assertIn("time", result["error"]["message"])

    def test_recursion_is_bounded(self):
        result = run_code("def f():\n    return f()\nf()")
        self.assertTrue(result["truncated"])
        self.assertIn("stack", result["error"]["message"])

    def test_math_import_and_comprehension(self):
        result = run_code("import math\nvalues = [n * n for n in range(4)]\nprint(values, math.sqrt(9))")
        self.assertEqual(result["output"], "[0, 1, 4, 9] 3.0\n")
        self.assertIsNone(result["error"])

    def test_unsafe_and_unsupported_constructs_are_rejected(self):
        for source in ["import os", "open('file.txt')", "print((1).__class__)",
                       "eval('1')", "'text'.format()", "from math import *",
                       "try:\n    pass\nexcept:\n    pass", "print(2 ** 100)"]:
            with self.subTest(source=source):
                result = run_code(source)
                self.assertEqual(result["error"]["type"], "UnsupportedCode")
                self.assertEqual(result["events"], [])

    def test_syntax_errors_are_structured(self):
        result = run_code("if True\n    print(1)")
        self.assertEqual(result["error"]["type"], "SyntaxError")
        self.assertEqual(result["error"]["line"], 1)

    def test_protocol_round_trip_and_bad_input(self):
        runner = Path(__file__).with_name("runner.py")
        for source, expected_type in [(json.dumps({"code": "print('hello')"}), None), ("invalid-json", "InputError")]:
            process = subprocess.run([sys.executable, "-I", "-B", str(runner)], input=source,
                                     capture_output=True, text=True, encoding="utf-8", timeout=5)
            self.assertEqual(process.returncode, 0)
            result = json.loads(process.stdout)
            self.assertEqual(result["error"]["type"] if result["error"] else None, expected_type)
            self.assertEqual(process.stderr, "")
            if not expected_type:
                self.assertEqual(result["output"], "hello\n")


if __name__ == "__main__":
    unittest.main()
