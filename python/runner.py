"""Actual CPython for controlled study snippets. This is not a general sandbox."""

from __future__ import annotations

import ast
import builtins
import contextlib
import dis
import io
import json
import math
import reprlib
import sys
import time
import types

FILENAME = "<mission>"
MAX_CODE = 16_000
MAX_EVENTS = 400
MAX_TICKS = 8_000
MAX_OUTPUT = 12_000
MAX_SECONDS = 2.0


class TraceLimit(BaseException):
    """Cannot be swallowed by the lesson's ordinary exception handlers."""


class UnsupportedCode(ValueError):
    pass


ALLOWED_NODES = (
    ast.Module, ast.Expr, ast.Assign, ast.AugAssign, ast.AnnAssign, ast.NamedExpr,
    ast.Name, ast.Load, ast.Store, ast.Del, ast.Constant, ast.BinOp, ast.UnaryOp,
    ast.BoolOp, ast.Compare, ast.If, ast.IfExp, ast.For, ast.While, ast.Break,
    ast.Continue, ast.Pass, ast.FunctionDef, ast.arguments, ast.arg, ast.Return,
    ast.Call, ast.keyword, ast.List, ast.Tuple, ast.Dict, ast.Set, ast.Subscript,
    ast.Slice, ast.Attribute, ast.ListComp, ast.SetComp, ast.DictComp,
    ast.GeneratorExp, ast.comprehension, ast.Try, ast.ExceptHandler, ast.Raise,
    ast.Assert, ast.Delete, ast.Global, ast.Import, ast.ImportFrom, ast.alias,
    ast.JoinedStr, ast.FormattedValue, ast.Starred,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.UAdd, ast.USub, ast.Not, ast.And, ast.Or, ast.Eq, ast.NotEq, ast.Lt,
    ast.LtE, ast.Gt, ast.GtE, ast.Is, ast.IsNot, ast.In, ast.NotIn,
)
ALLOWED_ATTRIBUTES = {
    "append", "extend", "insert", "pop", "remove", "clear", "copy", "count",
    "index", "reverse", "sort", "get", "items", "keys", "values", "update",
    "setdefault", "popitem", "add", "discard", "union", "intersection",
    "difference", "issubset", "issuperset", "upper", "lower", "strip",
    "lstrip", "rstrip", "split", "join", "replace", "startswith", "endswith",
    "find", "rfind", "title", "capitalize", "swapcase", "isdigit", "isalpha",
    "isalnum", "isspace", "format", "ceil", "floor", "sqrt", "trunc",
    "gcd", "isclose", "pi", "e", "inf", "isfinite", "isnan", "fabs",
}
# str.format can traverse attributes inside the format string. F-strings already
# provide the required formatting without that second expression language.
ALLOWED_ATTRIBUTES.remove("format")
BUILTIN_NAMES = (
    "print", "len", "int", "float", "str", "bool", "list", "tuple", "dict",
    "set", "range", "enumerate", "zip", "sum", "min", "max", "abs", "round",
    "sorted", "reversed", "any", "all", "isinstance", "type", "ord", "chr",
    "Exception", "ValueError", "TypeError", "ZeroDivisionError", "IndexError",
    "KeyError", "NameError", "UnboundLocalError", "RuntimeError", "AssertionError",
    "StopIteration", "next", "iter", "map", "filter",
)
FORBIDDEN_NAMES = {
    "exec", "eval", "open", "compile", "input", "globals", "locals", "vars",
    "getattr", "setattr", "delattr", "dir", "help", "breakpoint", "exit",
    "quit", "memoryview", "super", "object", "classmethod", "staticmethod",
}


def validate(code: str) -> ast.Module:
    if not isinstance(code, str) or len(code) > MAX_CODE:
        raise UnsupportedCode(f"Code must be a string of at most {MAX_CODE} characters.")
    tree = ast.parse(code, filename=FILENAME)
    for node in ast.walk(tree):
        if not isinstance(node, ALLOWED_NODES):
            raise UnsupportedCode(f"{type(node).__name__} is not supported by Python Machine.")
        names = []
        if isinstance(node, ast.Name):
            names = [node.id]
        elif isinstance(node, (ast.FunctionDef, ast.arg)):
            names = [node.name if isinstance(node, ast.FunctionDef) else node.arg]
        elif isinstance(node, ast.Global):
            names = node.names
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names = [node.name]
        elif isinstance(node, ast.alias):
            names = [node.asname or node.name]
        if any(name.startswith("_") or name in FORBIDDEN_NAMES for name in names):
            raise UnsupportedCode("Private names and dynamic execution are not supported.")
        if isinstance(node, ast.Attribute):
            if node.attr not in ALLOWED_ATTRIBUTES or not isinstance(node.ctx, ast.Load):
                raise UnsupportedCode(f"Attribute '{node.attr}' is not supported.")
        if isinstance(node, ast.Import) and any(item.name != "math" for item in node.names):
            raise UnsupportedCode("Only the math module is available in Python Machine.")
        if isinstance(node, ast.ImportFrom):
            if node.module != "math" or node.level or any(item.name not in ALLOWED_ATTRIBUTES for item in node.names):
                raise UnsupportedCode("Only selected math names can be imported.")
        if isinstance(node, ast.FunctionDef) and node.decorator_list:
            raise UnsupportedCode("Decorators are outside the controlled curriculum.")
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
            if not isinstance(node.right, ast.Constant) or not isinstance(node.right.value, int) or not 0 <= node.right.value <= 12:
                raise UnsupportedCode("Power exponents must be literal integers from 0 to 12.")
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (str, bytes)) and len(node.value) > 4096:
                raise UnsupportedCode("A literal is too large for a study snippet.")
            if isinstance(node.value, int) and abs(node.value) > 1_000_000:
                raise UnsupportedCode("Integer literals must be at most one million.")
        if isinstance(node, ast.Try) and any(handler.type is None for handler in node.handlers):
            raise UnsupportedCode("Use a named exception such as 'except ValueError', not a bare except.")
    return tree


def helper_statement(name: str, node: ast.AST, *values) -> ast.Expr:
    call = ast.Call(func=ast.Name(id=name, ctx=ast.Load()),
                    args=[ast.Constant(getattr(node, "lineno", 1))] + [ast.Constant(value) for value in values],
                    keywords=[])
    return ast.copy_location(ast.Expr(value=call), node)


class Instrument(ast.NodeTransformer):
    def __init__(self, code: str):
        self.code = code

    def visit(self, node):
        transformed = super().visit(node)
        # The callback is attached to the completed original statement, so x = 4
        # displays x == 4 on line 1, not on the next source line.
        if isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign, ast.Expr,
                             ast.Delete, ast.Pass, ast.Import, ast.ImportFrom,
                             ast.FunctionDef, ast.Assert, ast.Global)):
            return [transformed, helper_statement("_pm_line", node)]
        if isinstance(node, (ast.Break, ast.Continue)):
            return [helper_statement("_pm_line", node), transformed]
        return transformed

    def decision(self, node: ast.If | ast.While):
        original_test = node.test
        expression = ast.get_source_segment(self.code, original_test) or "condition"
        node.test = ast.copy_location(ast.Call(
            func=ast.Name(id="_pm_branch", ctx=ast.Load()),
            args=[ast.Constant(node.lineno), original_test, ast.Constant(expression)], keywords=[]), original_test)

    def visit_If(self, node):
        self.generic_visit(node)
        self.decision(node)
        return node

    def visit_While(self, node):
        self.generic_visit(node)
        self.decision(node)
        node.body.insert(0, helper_statement("_pm_loop", node))
        return [helper_statement("_pm_begin_loop", node), node]

    def visit_For(self, node):
        self.generic_visit(node)
        node.body.insert(0, helper_statement("_pm_loop", node))
        return [helper_statement("_pm_begin_loop", node), node]

    def visit_Return(self, node):
        self.generic_visit(node)
        node.value = ast.copy_location(ast.Call(
            func=ast.Name(id="_pm_return", ctx=ast.Load()),
            args=[ast.Constant(node.lineno), node.value or ast.Constant(None)], keywords=[]), node)
        return node


class CappedOutput(io.StringIO):
    def __init__(self, limit: int):
        super().__init__()
        self.limit = limit

    def write(self, text):
        remaining = self.limit - self.tell()
        if len(text) > remaining:
            super().write(text[:remaining])
            raise TraceLimit(f"Output limit of {self.limit} characters reached.")
        return super().write(text)


class Machine:
    def __init__(self, code: str, *, max_events=MAX_EVENTS, max_ticks=MAX_TICKS,
                 max_output=MAX_OUTPUT, max_seconds=MAX_SECONDS):
        self.code = code
        self.events = []
        self.output = CappedOutput(max_output)
        self.max_events = max_events
        self.max_ticks = max_ticks
        self.deadline = time.monotonic() + max_seconds
        self.ticks = 0
        self.previous = {}
        self.loops = {}
        self.return_lines = {}
        self.last_line = 1
        self.printer = reprlib.Repr()
        self.printer.maxstring = 180
        self.printer.maxother = 180
        self.printer.maxlist = 12
        self.printer.maxtuple = 12
        self.printer.maxdict = 10
        self.printer.maxset = 12
        self.printer.maxlevel = 3

    def value(self, value):
        if isinstance(value, types.FunctionType):
            return f"<function {value.__name__}>"
        if isinstance(value, types.ModuleType):
            return f"<module {value.__name__}>"
        return self.printer.repr(value)[:300]

    def snapshot(self, values):
        return {key: self.value(value) for key, value in list(values.items())[:64]
                if not key.startswith("_")}

    def check(self):
        self.ticks += 1
        if self.ticks > self.max_ticks:
            raise TraceLimit("Execution step limit reached. Check for an infinite loop.")
        if time.monotonic() > self.deadline:
            raise TraceLimit("Execution time limit reached.")

    def emit(self, frame, event, line, detail, **extra):
        self.check()
        if len(self.events) >= self.max_events:
            raise TraceLimit(f"Trace limit of {self.max_events} events reached.")
        self.last_line = line
        current = self.snapshot(frame.f_locals)
        previous = self.previous.get(id(frame), {})
        changes = [{"name": key, "before": previous.get(key), "after": current.get(key)}
                   for key in sorted(previous.keys() | current.keys()) if previous.get(key) != current.get(key)]
        self.previous[id(frame)] = current.copy()
        stack = []
        cursor = frame
        while cursor and len(stack) < 12:
            if cursor.f_code.co_filename == FILENAME:
                stack.append({"function": cursor.f_code.co_name, "line": cursor.f_lineno,
                              "locals": self.snapshot(cursor.f_locals)})
            cursor = cursor.f_back
        self.events.append({"step": len(self.events) + 1, "event": event, "line": line,
                            "function": frame.f_code.co_name, "locals": current,
                            "globals": self.snapshot(frame.f_globals), "changes": changes,
                            "output": self.output.getvalue(), "stack": list(reversed(stack)),
                            "detail": detail, **extra})

    def line(self, line):
        self.emit(sys._getframe(1), "line", line, "Statement completed")

    def branch(self, line, value, expression):
        decision = bool(value)
        self.emit(sys._getframe(1), "branch", line,
                  f"{expression} → {decision}", decision=decision)
        return decision

    def begin_loop(self, line):
        self.loops[(id(sys._getframe(1)), line)] = 0

    def loop(self, line):
        frame = sys._getframe(1)
        key = (id(frame), line)
        self.loops[key] = self.loops.get(key, 0) + 1
        self.emit(frame, "loop", line, f"Iteration {self.loops[key]}", iteration=self.loops[key])

    def returning(self, line, value):
        self.return_lines[id(sys._getframe(1))] = line
        return value

    def trace(self, frame, event, arg):
        if frame.f_code.co_filename != FILENAME:
            return None
        self.last_line = frame.f_lineno
        self.check()
        frame_id = id(frame)
        if event == "call":
            self.previous[frame_id] = {}
            if frame.f_code.co_name != "<module>":
                if sum(1 for _ in self.user_frames(frame)) > 12:
                    raise TraceLimit("Call stack limit of 12 frames reached.")
                parameters = self.snapshot(frame.f_locals)
                self.emit(frame, "call", frame.f_lineno, f"Call {frame.f_code.co_name}", parameters=parameters)
        elif event == "exception":
            exception_type, exception, _ = arg
            if not isinstance(exception, TraceLimit) and exception_type is not StopIteration:
                self.emit(frame, "exception", frame.f_lineno,
                          f"{exception_type.__name__}: {str(exception)[:300]}")
        elif event == "return":
            # CPython also sends a return event with None while unwinding an
            # exception. Inspect the actual instruction so finally blocks cannot
            # turn an unhandled exception into a fake successful None return.
            instruction = dis.opname[frame.f_code.co_code[frame.f_lasti]]
            if frame.f_code.co_name != "<module>" and instruction.startswith("RETURN"):
                self.emit(frame, "return", self.return_lines.get(frame_id, frame.f_lineno),
                          f"Return {self.value(arg)}", returnValue=self.value(arg))
            self.previous.pop(frame_id, None)
            self.return_lines.pop(frame_id, None)
            self.loops = {key: value for key, value in self.loops.items() if key[0] != frame_id}
        return self.trace

    @staticmethod
    def user_frames(frame):
        while frame:
            if frame.f_code.co_filename == FILENAME:
                yield frame
            frame = frame.f_back

    def run(self):
        error = None
        truncated = False
        try:
            tree = Instrument(self.code).visit(validate(self.code))
            ast.fix_missing_locations(tree)
            program = compile(tree, FILENAME, "exec")
            safe_builtins = {name: getattr(builtins, name) for name in BUILTIN_NAMES}

            def controlled_import(name, globals=None, locals=None, fromlist=(), level=0):
                if name != "math" or level:
                    raise UnsupportedCode("Only math is available.")
                return math

            safe_builtins["__import__"] = controlled_import
            namespace = {"__builtins__": safe_builtins, "__name__": "mission",
                         "_pm_line": self.line, "_pm_branch": self.branch,
                         "_pm_begin_loop": self.begin_loop, "_pm_loop": self.loop,
                         "_pm_return": self.returning}
            old_trace = sys.gettrace()
            try:
                with contextlib.redirect_stdout(self.output):
                    sys.settrace(self.trace)
                    exec(program, namespace, namespace)
            finally:
                sys.settrace(old_trace)
        except (Exception, TraceLimit) as exception:
            truncated = isinstance(exception, TraceLimit)
            line = getattr(exception, "lineno", None) or self.last_line
            cursor = exception.__traceback__
            while cursor:
                if cursor.tb_frame.f_code.co_filename == FILENAME:
                    line = cursor.tb_lineno
                cursor = cursor.tb_next
            error = {"type": type(exception).__name__, "message": str(exception)[:600], "line": line}
        return {"events": self.events, "output": self.output.getvalue(), "error": error, "truncated": truncated}


def run_code(code: str, **limits):
    return Machine(code, **limits).run()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    try:
        request_text = sys.stdin.buffer.read(MAX_CODE * 6 + 1024)
        request = json.loads(request_text)
        if not isinstance(request, dict) or not isinstance(request.get("code"), str):
            raise ValueError("Expected a JSON object with a code string.")
        result = run_code(request["code"])
    except Exception as exception:
        result = {"events": [], "output": "", "error": {"type": "InputError", "message": str(exception)[:300], "line": 1}, "truncated": False}
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
