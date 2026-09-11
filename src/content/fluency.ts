import type { Challenge } from "../types";
import { debugging, make, pyBool, pyList, stdout, variants } from "./helpers";

export const fluency: Challenge[] = variants.flatMap((v) => {
  const n = v + 3;
  const list = [n, n + 1, n + 2];
  return [
    make("list-alias", v, {
      topic: "collections",
      subtopic: "list mutation and aliases",
      difficulty: 2,
      type: "collection-state",
      title: "Two names, one list",
      code: `original = [${n}, ${n + 1}]\nalias = original\nalias.append(${n + 2})\nprint(original)`,
      question: "What is original after the append?",
      correct: pyList(list),
      distractors: [
        [
          pyList([n, n + 1]),
          "alias = original binds a second name to the same list; it does not copy it.",
        ],
        [
          pyList([n + 2]),
          "append adds an item without removing the existing elements.",
        ],
        [
          "None",
          "append returns None, but this code does not assign that return value to original.",
        ],
      ],
      expectedOutput: stdout(pyList(list)),
      focusLine: 2,
      explanation:
        "Both names refer to one mutable list. Appending through alias changes that shared list, so original sees the extra element too.",
      misconception: "list-assignment-copies",
      hints: [
        "Check whether a copy operation appears.",
        "A list can have more than one name referring to it.",
        "Mutation changes the object that both names share.",
      ],
    }),
    make("append-return", v, {
      topic: "collections",
      subtopic: "mutating methods",
      difficulty: 2,
      type: "predict-output",
      title: "A mutation and its return value",
      code: `items = [${n}]\nresult = items.append(${n + 1})\nprint(items)\nprint(result)`,
      question: "What are the two output lines?",
      correct: `${pyList([n, n + 1])}\nNone`,
      distractors: [
        [
          `${pyList([n, n + 1])}\n${pyList([n, n + 1])}`,
          "append changes the list in place and returns None, not the updated list.",
        ],
        [
          `${pyList([n])}\n${pyList([n + 1])}`,
          "append mutates items rather than producing a separate one-element list.",
        ],
        [
          "None\nNone",
          "items remains a list. Only result receives append’s return value.",
        ],
      ],
      expectedOutput: `${pyList([n, n + 1])}\nNone\n`,
      focusLine: 2,
      explanation: `items becomes ${pyList([n, n + 1])}. The append method returns None, so result holds None. Object state and method return value are different things.`,
      misconception: "append-returns-list",
      hints: [
        "Track items and result separately.",
        "append changes its existing list.",
        "Many in-place list methods return None.",
      ],
    }),
    make("dictionary-update", v, {
      topic: "collections",
      subtopic: "dictionary mutation",
      difficulty: 2,
      type: "collection-state",
      title: "Update one key",
      code: `stock = {"fuel": ${n}, "food": 2}\nstock["fuel"] += 3\nstock["tools"] = 1\nprint(stock["fuel"], len(stock))`,
      question: "What fuel amount and key count are printed?",
      correct: `${n + 3} 3`,
      distractors: [
        [
          `${n + 3} 4`,
          "Updating an existing key does not create another key. Only tools is new.",
        ],
        [`${n} 3`, "The fuel update modifies the existing value."],
        [
          `${n + 3} 2`,
          "Assigning to tools creates a new key, increasing the key count from two to three.",
        ],
      ],
      expectedOutput: stdout(`${n + 3} 3`),
      focusLine: 2,
      explanation: `fuel changes from ${n} to ${n + 3}. tools adds a third key. The final keys are fuel, food, and tools.`,
      misconception: "dictionary-update-adds-key",
      hints: [
        "Separate updating a known key from adding a new key.",
        "Track fuel’s value through +=.",
        "len counts keys, not all updates performed.",
      ],
    }),
    make("dictionary-membership", v, {
      topic: "collections",
      subtopic: "dictionary membership",
      difficulty: 2,
      type: "condition",
      title: "Membership checks keys",
      code: `stock = {"fuel": ${n}}\nprint("fuel" in stock, ${n} in stock)`,
      question: "Which two Boolean values are printed?",
      correct: "True False",
      distractors: [
        [
          "True True",
          "in on a dictionary tests keys only. The numeric value is not a key.",
        ],
        [
          "False True",
          "The string fuel is the key, while the number is its value.",
        ],
        ["False False", "fuel is present as a key."],
      ],
      expectedOutput: stdout("True False"),
      focusLine: 2,
      explanation:
        'Dictionary membership checks keys. "fuel" is a key; its numeric value is not. Use stock.values() when the question is about values.',
      misconception: "dictionary-membership-checks-values",
      hints: [
        "Identify the text before the colon.",
        "That part is the key.",
        "A plain in test on a dictionary searches keys.",
      ],
    }),
    make("comprehension-filter", v, {
      topic: "collections",
      subtopic: "list comprehensions",
      difficulty: 2,
      type: "collection-state",
      title: "Filter, then transform",
      code: `values = ${pyList([n - 1, n, n + 1, n + 2])}\nresult = [value * 2 for value in values if value > ${n}]\nprint(result)`,
      question: "What list does the comprehension create?",
      correct: pyList([2 * (n + 1), 2 * (n + 2)]),
      distractors: [
        [
          pyList([2 * n, 2 * (n + 1), 2 * (n + 2)]),
          "The condition is strictly >, so the value equal to the threshold is filtered out.",
        ],
        [
          pyList([n + 1, n + 2]),
          "Those values pass the condition, but each is then multiplied by 2.",
        ],
        [
          pyList([2 * (n - 1), 2 * n, 2 * (n + 1), 2 * (n + 2)]),
          "The if clause filters the original values before including their transformed results.",
        ],
      ],
      expectedOutput: stdout(pyList([2 * (n + 1), 2 * (n + 2)])),
      focusLine: 2,
      explanation: `${n + 1} and ${n + 2} pass the condition. Multiplying each by 2 produces ${pyList([2 * (n + 1), 2 * (n + 2)])}.`,
      misconception: "comprehension-skips-filter",
      hints: [
        "First decide which original values pass the if test.",
        "Keep only those values.",
        "Now apply the expression before for to each kept value.",
      ],
    }),
    make("string-methods", v, {
      topic: "strings",
      subtopic: "strip and upper",
      difficulty: 2,
      type: "predict-output",
      title: "Methods produce a new string",
      code: `name = "  unit${n}  "\nclean = name.strip().upper()\nprint(clean)\nprint(len(name))`,
      question: "What are the two output lines?",
      correct: `UNIT${n}\n9`,
      distractors: [
        [
          `UNIT${n}\n5`,
          "strip and upper produce a new string assigned to clean. The original name keeps its spaces.",
        ],
        [
          `unit${n}\n9`,
          "upper converts letters in the stripped result to uppercase.",
        ],
        [
          `  UNIT${n}  \n9`,
          "strip removes the leading and trailing spaces from the value used for clean.",
        ],
      ],
      expectedOutput: `UNIT${n}\n9\n`,
      focusLine: 2,
      explanation: `clean receives the stripped uppercase text UNIT${n}. name is unchanged and still has two spaces on either side, for 9 characters.`,
      misconception: "string-method-mutates-original",
      hints: [
        "Follow the chained methods left to right.",
        "Check which variable receives the result.",
        "Strings are immutable; name still refers to its original value.",
      ],
    }),
    make("builtins-sorted", v, {
      topic: "other",
      subtopic: "common built-ins",
      difficulty: 2,
      type: "predict-output",
      title: "A sorted copy",
      code: `values = [${n + 2}, ${n}, ${n + 1}]\nordered = sorted(values)\nprint(ordered[0], max(values), len(values))`,
      question: "What three values are printed?",
      correct: `${n} ${n + 2} 3`,
      distractors: [
        [
          `${n + 2} ${n + 2} 3`,
          "sorted returns elements in ascending order, so ordered[0] is the smallest.",
        ],
        [
          `${n} ${n + 2} ${3 * n + 3}`,
          "len counts elements; it does not sum their values.",
        ],
        [
          `${n} ${n} 3`,
          "max selects the largest value regardless of the original order.",
        ],
      ],
      expectedOutput: stdout(`${n} ${n + 2} 3`),
      focusLine: 3,
      explanation: `ordered becomes ${pyList(list)}. Its first item is ${n}; max(values) is ${n + 2}; len(values) is 3.`,
      misconception: "len-is-sum",
      hints: [
        "Evaluate each print argument independently.",
        "sorted uses ascending order by default.",
        "max chooses a value; len counts entries.",
      ],
    }),
    make("explicit-conversion", v, {
      topic: "other",
      subtopic: "type conversion",
      difficulty: 1,
      type: "predict-output",
      title: "Convert before adding",
      code: `text = "${n}"\nvalue = int(text) + 2\nprint(value)`,
      question: "What does Python print?",
      correct: `${n + 2}`,
      distractors: [
        [
          `${n}2`,
          "int converts the numeric string to an integer before + runs.",
        ],
        [
          "TypeError",
          "The explicit int conversion makes both addition operands integers.",
        ],
        [`${n}`, "The addition still runs after conversion."],
      ],
      expectedOutput: stdout(n + 2),
      focusLine: 2,
      explanation: `int("${n}") gives the integer ${n}. Integer addition then produces ${n + 2}.`,
      misconception: "conversion-does-not-change-type",
      hints: [
        "Evaluate the inner int call first.",
        "Ask what type that call returns.",
        "Now determine what + does for two integers.",
      ],
    }),
    make("nested-conditions", v, {
      topic: "conditionals",
      subtopic: "nested if",
      difficulty: 2,
      type: "predict-output",
      title: "Enter the inner decision",
      code: `score = ${n + 5}\nurgent = ${pyBool(v % 2 === 0)}\nif score >= 8:\n    if urgent:\n        print("now")\n    else:\n        print("later")\nelse:\n    print("review")`,
      question: "What word is printed?",
      correct: v % 2 === 0 ? "now" : "later",
      distractors: [
        [
          v % 2 === 0 ? "later" : "now",
          "The outer condition passes, but the inner urgent value chooses between now and later.",
        ],
        [
          "review",
          "The outer score condition is true, so its else body is skipped.",
        ],
        ["now\nlater", "The inner if/else executes exactly one branch."],
      ],
      expectedOutput: stdout(v % 2 === 0 ? "now" : "later"),
      focusLine: 4,
      explanation: `score >= 8 passes. Inside that branch, urgent is ${pyBool(v % 2 === 0)}, selecting ${v % 2 === 0 ? "now" : "later"}. Indentation identifies which else belongs to which if.`,
      misconception: "else-attaches-wrong-if",
      hints: [
        "Resolve the outer decision first.",
        "Read indentation to pair each else with its if.",
        "Once inside the outer branch, evaluate urgent.",
      ],
    }),
    make("nested-loops", v, {
      topic: "loops",
      subtopic: "nested loops",
      difficulty: 2,
      type: "loop-count",
      title: "A full inner loop each time",
      code: `visits = 0\nfor row in range(${v + 2}):\n    for column in range(3):\n        visits += 1\nprint(visits)`,
      question: "How many times does visits += 1 run?",
      correct: `${(v + 2) * 3}`,
      distractors: [
        [
          `${v + 5}`,
          "Nested iteration multiplies the visit counts; it does not add them.",
        ],
        ["3", "The inner loop restarts for each outer iteration."],
        [
          "0",
          "The loops do execute their bodies, so visits increases from its initial zero.",
        ],
      ],
      expectedOutput: stdout((v + 2) * 3),
      focusLine: 3,
      explanation: `For each of ${v + 2} rows, the inner loop visits 3 columns. That creates ${(v + 2) * 3} total visits.`,
      misconception: "nested-loops-add-counts",
      hints: [
        "Count outer iterations.",
        "Count inner iterations within one outer visit.",
        "The inner loop runs from its start for every row.",
      ],
    }),
    make("functions-compose", v, {
      topic: "functions",
      subtopic: "functions calling functions",
      difficulty: 2,
      type: "function-return",
      title: "Return through two calls",
      code: `def double(value):\n    return value * 2\n\ndef score(value):\n    return double(value + 1)\n\nprint(score(${n}))`,
      question: "What does score return?",
      correct: `${(n + 1) * 2}`,
      distractors: [
        [
          `${n * 2 + 1}`,
          "score adds 1 before calling double, not after receiving its result.",
        ],
        [
          `${n + 1}`,
          "That is the argument sent to double. Continue through the nested call.",
        ],
        ["None", "Both functions explicitly return their results."],
      ],
      expectedOutput: stdout((n + 1) * 2),
      focusLine: 5,
      explanation: `score receives ${n}, then calls double with ${n + 1}. double returns ${(n + 1) * 2}, which score passes back to its caller.`,
      misconception: "nested-call-argument-order",
      hints: [
        "Evaluate the argument expression to the inner call.",
        "Follow that value into double.",
        "Bring its return value back to score.",
      ],
    }),
    make("default-argument", v, {
      topic: "functions",
      subtopic: "default arguments",
      difficulty: 2,
      type: "function-return",
      title: "Use the default only when omitted",
      code: `def scale(value, factor=2):\n    return value * factor\n\nprint(scale(${n}), scale(${n}, 3))`,
      question: "What are the two returned values printed here?",
      correct: `${n * 2} ${n * 3}`,
      distractors: [
        [
          `${n * 2} ${n * 2}`,
          "An explicit second argument overrides the default for that call.",
        ],
        [`${n * 3} ${n * 3}`, "The first call omits factor, so it uses 2."],
        [
          "TypeError",
          "A parameter with a default may be omitted by the caller.",
        ],
      ],
      expectedOutput: stdout(`${n * 2} ${n * 3}`),
      focusLine: 4,
      explanation: `scale(${n}) uses factor=2. scale(${n}, 3) binds factor to 3 for that call. Defaults fill omitted arguments.`,
      misconception: "default-overrides-explicit-argument",
      hints: [
        "Examine the two calls separately.",
        "Which call supplies a factor?",
        "Use the default only for a missing argument.",
      ],
    }),
    make("local-scope", v, {
      topic: "functions",
      subtopic: "local and global scope",
      difficulty: 2,
      type: "scope",
      title: "Same spelling, different scope",
      code: `level = ${n}\n\ndef advance():\n    level = ${n + 5}\n    return level\n\nprint(advance())\nprint(level)`,
      question: "What are the two output lines?",
      correct: `${n + 5}\n${n}`,
      distractors: [
        [
          `${n + 5}\n${n + 5}`,
          "The assignment inside advance creates a local name; it does not reassign the module-level level.",
        ],
        [
          `${n}\n${n}`,
          "Inside advance, the local assignment is used by its return statement.",
        ],
        ["UnboundLocalError", "The local level is assigned before it is read."],
      ],
      expectedOutput: `${n + 5}\n${n}\n`,
      focusLine: 4,
      explanation: `The function’s local level is ${n + 5}. The module-level level remains ${n}. A matching name does not automatically connect the two scopes.`,
      misconception: "local-assignment-changes-global",
      hints: [
        "Separate the module’s names from the function’s names.",
        "Locate the assignment inside advance.",
        "No global declaration appears in this function.",
      ],
    }),
    make("mutable-default", v, {
      topic: "functions",
      subtopic: "mutable default arguments",
      difficulty: 3,
      type: "collection-state",
      title: "A default list survives the call",
      code: `def record(value, log=[]):\n    log.append(value)\n    return log\n\nrecord(${n})\nprint(record(${n + 1}))`,
      question: "What list does the second call return?",
      correct: pyList([n, n + 1]),
      distractors: [
        [
          pyList([n + 1]),
          "The default list is created once at function definition, then reused by omitted-argument calls.",
        ],
        [pyList([n]), "The second call also appends its own value."],
        ["None", "The function explicitly returns log after mutating it."],
      ],
      expectedOutput: stdout(pyList([n, n + 1])),
      focusLine: 1,
      explanation: `Both calls omit log and share the same default list. The first appends ${n}, the second appends ${n + 1}. A None default with a fresh list inside the function avoids unintended sharing.`,
      misconception: "mutable-default-created-each-call",
      hints: [
        "Both calls omit the second argument.",
        "Default expressions are evaluated when def runs.",
        "Ask whether the two calls receive one shared list or two newly created lists.",
      ],
    }),
    make("type-mismatch", v, {
      topic: "exceptions",
      subtopic: "TypeError",
      difficulty: 1,
      type: "exception",
      title: "Types must agree",
      code: `count = "${n}"\nprint(count + 1)`,
      question: "Which exception stops the program?",
      correct: "TypeError",
      distractors: [
        [
          "ValueError",
          "The problem is combining incompatible operand types, not parsing an invalid numeric string.",
        ],
        ["NameError", "count has been defined."],
        [
          "No exception",
          "Python does not implicitly convert a string to an integer for +.",
        ],
      ],
      expectedOutput: "",
      expectedException: "TypeError",
      focusLine: 2,
      explanation:
        "count is a string, while 1 is an integer. + cannot combine these operand types. int(count) + 1 would perform numeric addition.",
      misconception: "implicit-string-number-conversion",
      hints: [
        "Check the type of each side of +.",
        "Quotation marks make count a string.",
        "The operation has incompatible operand types.",
      ],
    }),
    make("index-error", v, {
      topic: "exceptions",
      subtopic: "IndexError",
      difficulty: 1,
      type: "exception",
      title: "Length is beyond the last index",
      code: `values = ${pyList(list)}\nprint(values[len(values)])`,
      question: "Which exception occurs?",
      correct: "IndexError",
      distractors: [
        ["KeyError", "This is a list index, not a missing dictionary key."],
        [
          "No exception",
          "A list of length 3 ends at index 2. Index 3 is out of range.",
        ],
        [
          "TypeError",
          "The index has the correct integer type; its value is outside the list.",
        ],
      ],
      expectedOutput: "",
      expectedException: "IndexError",
      focusLine: 2,
      explanation:
        "len(values) is 3, but the valid nonnegative indexes are 0, 1, and 2. Accessing index 3 raises IndexError.",
      misconception: "length-is-last-index",
      hints: [
        "Compute the length.",
        "List every valid zero-based index.",
        "Compare the requested index with that list.",
      ],
    }),
    make("traceback-read", v, {
      topic: "exceptions",
      subtopic: "reading tracebacks",
      difficulty: 2,
      type: "traceback",
      title: "Locate the failing operation",
      code: `def lookup(values):\n    return values[3]\n\nprint(lookup(${pyList(list)}))`,
      question:
        "A traceback points to the call on line 4, then line 2: IndexError: list index out of range. Which line contains the failing operation?",
      correct: "Line 2: return values[3]",
      distractors: [
        [
          "Line 1: def lookup(values):",
          "Defining the function succeeds. The traceback’s innermost frame identifies the failed indexing operation.",
        ],
        [
          "Line 4: print(lookup(...))",
          "That line called the function. The actual invalid access occurs inside it on line 2.",
        ],
        [
          "No faulty line; print is broken",
          "print never receives a completed return value because the lookup raises an exception first.",
        ],
      ],
      expectedOutput: "",
      expectedException: "IndexError",
      focusLine: 2,
      explanation:
        "Read the innermost traceback entry for the failing operation: values[3] on line 2. The call on line 4 explains how execution reached it.",
      misconception: "traceback-first-frame-is-root-cause",
      hints: [
        "Distinguish a caller from the operation it calls.",
        "Look at the innermost traceback frame.",
        "A three-item list has indexes 0 through 2.",
      ],
    }),
    make("try-except-finally", v, {
      topic: "exceptions",
      subtopic: "try / except / finally",
      difficulty: 2,
      type: "predict-output",
      title: "Handle the error, then finish",
      code: `text = "${v % 2 ? n : `bad${n}`}"\ntry:\n    print(int(text))\nexcept ValueError:\n    print("invalid")\nfinally:\n    print("done")`,
      question: "What are the output lines?",
      correct: `${v % 2 ? n : "invalid"}\ndone`,
      distractors: [
        [
          `${v % 2 ? n : "invalid"}`,
          "finally executes after this try/except flow, including when conversion succeeds or is handled.",
        ],
        [
          "done",
          "Before finally, either the successful conversion or the except block produces output.",
        ],
        [
          v % 2 ? "invalid\ndone" : "ValueError stops the program",
          v % 2
            ? "This numeric text converts successfully, so the except body is skipped."
            : "The matching except ValueError catches this conversion error.",
        ],
      ],
      expectedOutput: `${v % 2 ? n : "invalid"}\ndone\n`,
      focusLine: v % 2 ? 3 : 5,
      explanation: `${v % 2 ? `int(text) succeeds and prints ${n}` : "int(text) raises ValueError, so the matching handler prints invalid"}. The finally body then prints done.`,
      misconception: "finally-only-runs-on-error",
      hints: [
        "Decide whether int can parse the text.",
        "Use the handler only if its matching exception occurs.",
        "The finally body executes afterward in either path here.",
      ],
    }),
    make("test-boundary-input", v, {
      topic: "conditionals",
      subtopic: "boundary tests",
      difficulty: 2,
      type: "test-input",
      title: "Find the revealing input",
      code: `def qualifies(score):\n    return score > ${n}\n\nprint(qualifies(${n}))`,
      question: `The rule says "a score of at least ${n} qualifies." Which input exposes the bug?`,
      correct: `${n}`,
      distractors: [
        [
          `${n - 1}`,
          "This input should fail and the function returns False, so it does not expose the mismatch.",
        ],
        [
          `${n + 1}`,
          "This input should pass and the function returns True, so it does not expose the bug.",
        ],
        [
          "0",
          `Zero is below ${n}, so both the rule and the function reject it.`,
        ],
      ],
      expectedOutput: stdout("False"),
      focusLine: 2,
      explanation: `The boundary score ${n} should qualify, but ${n} > ${n} is False. Replacing > with >= includes the promised boundary.`,
      misconception: "boundary-tests-unnecessary",
      hints: [
        "Translate “at least” into a comparison.",
        "Where do > and >= disagree?",
        "Test exactly the threshold.",
      ],
    }),
    make("repair-empty-check", v, {
      topic: "conditionals",
      subtopic: "truthiness repairs",
      difficulty: 2,
      type: "repair",
      title: "Choose the smallest guard repair",
      code: `items = [${n}][:0]\nif not items:\n    print("empty")\nelse:\n    print("loaded")`,
      displayCode: `items = [${n}][:0]\nif len(items) < 0:\n    print("empty")\nelse:\n    print("loaded")`,
      question:
        "The condition should detect an empty list for every input. Which replacement for line 2 fixes it?",
      correct: "if not items:",
      distractors: [
        [
          "if items:",
          "That condition is true for nonempty lists, which reverses the intended meaning.",
        ],
        [
          "if len(items) <= 1:",
          "A one-element list is nonempty, but this condition would label it empty.",
        ],
        [
          "if items is None:",
          "None and an empty list are different values. An empty list does not satisfy this identity check.",
        ],
      ],
      expectedOutput: stdout("empty"),
      focusLine: 2,
      explanation:
        "The [:0] slice creates an empty list. Its length cannot be negative, so the original guard fails. The repaired condition not items is True for an empty list and prints empty. The revealed source shows that repair.",
      misconception: "empty-list-is-none",
      hints: [
        "Think about the smallest possible list length.",
        "An empty list is falsy.",
        "Negating that truth value gives an empty-list check.",
      ],
    }),
    debugging(
      "bug-running-total",
      v,
      {
        topic: "loops",
        subtopic: "debug accumulation",
        difficulty: 2,
        type: "find-bug",
        title: "Incident: the missing total",
        code: `def total(numbers):\n    result = 0\n    for number in numbers:\n        result = number\n    return result\n\nprint(total(${pyList(list)}))`,
        question: "This function must sum all inputs. Which line is wrong?",
        correct: "Line 4",
        distractors: [
          ["Line 2", "Zero is the correct initial value for a sum."],
          [
            "Line 3",
            "Iterating directly through the list visits all its numbers.",
          ],
          [
            "Line 5",
            "Returning after the loop is correct; the accumulated value itself is wrong.",
          ],
        ],
        expectedOutput: stdout(n + 2),
        focusLine: 4,
        explanation:
          "Line 4 overwrites result on each iteration, keeping only the final number. The repair must add each number to the existing total.",
        misconception: "debug-accumulator-overwrite",
        hints: [
          "Compare the observed output with the final input element.",
          "Watch result after each iteration.",
          "Look for replacement where you need accumulation.",
        ],
      },
      {
        line: 4,
        answer: "add",
        choices: [
          {
            id: "add",
            text: "result += number",
            feedback:
              "This preserves the running total and adds the current number.",
          },
          {
            id: "count",
            text: "result += 1",
            feedback: "This counts numbers rather than adding their values.",
          },
          {
            id: "double",
            text: "result = number * 2",
            feedback: "This still overwrites the running total on each visit.",
          },
        ],
        code: `def total(numbers):\n    result = 0\n    for number in numbers:\n        result += number\n    return result\n\nprint(total(${pyList(list)}))`,
        expectedOutput: stdout(3 * n + 3),
      },
    ),
    debugging(
      "bug-inclusive-range",
      v,
      {
        topic: "loops",
        subtopic: "debug off-by-one",
        difficulty: 2,
        type: "find-bug",
        title: "Incident: one number short",
        code: `def sum_to(limit):\n    result = 0\n    for value in range(1, limit):\n        result += value\n    return result\n\nprint(sum_to(${n}))`,
        question: `The function should sum 1 through limit, including limit. Which line is wrong?`,
        correct: "Line 3",
        distractors: [
          ["Line 2", "A sum should start at zero."],
          [
            "Line 4",
            "Adding each value to result is correct; the sequence leaves one value out.",
          ],
          ["Line 5", "Returning after the loop is appropriate."],
        ],
        expectedOutput: stdout((n * (n - 1)) / 2),
        focusLine: 3,
        explanation:
          "range excludes its stop argument. The current loop never visits limit, so the final addend is missing.",
        misconception: "debug-exclusive-stop",
        hints: [
          "Write the values yielded by range.",
          "Compare the last yielded value with the stated requirement.",
          "The stop argument must sit just beyond the final wanted value.",
        ],
      },
      {
        line: 3,
        answer: "inclusive",
        choices: [
          {
            id: "same",
            text: "for value in range(limit):",
            feedback: "This includes zero but still omits limit.",
          },
          {
            id: "inclusive",
            text: "for value in range(1, limit + 1):",
            feedback:
              "The excluded stop is one past limit, so limit is included.",
          },
          {
            id: "overshoot",
            text: "for value in range(1, limit + 2):",
            feedback:
              "This also adds limit + 1, which exceeds the requirement.",
          },
        ],
        code: `def sum_to(limit):\n    result = 0\n    for value in range(1, limit + 1):\n        result += value\n    return result\n\nprint(sum_to(${n}))`,
        expectedOutput: stdout((n * (n + 1)) / 2),
      },
    ),
    debugging(
      "bug-missing-return",
      v,
      {
        topic: "functions",
        subtopic: "debug missing return",
        difficulty: 2,
        type: "find-bug",
        title: "Incident: the missing return",
        code: `def double(value):\n    result = value * 2\n    print(result)\n\nanswer = double(${n})\nprint(answer)`,
        question:
          "The function must return the doubled value without printing internally. Which line needs replacement?",
        correct: "Line 3",
        distractors: [
          ["Line 1", "The parameter correctly accepts one input value."],
          ["Line 2", "The multiplication computes the desired result."],
          [
            "Line 6",
            "The caller should be able to print the return value; the function failed to supply it.",
          ],
        ],
        expectedOutput: `${n * 2}\nNone\n`,
        focusLine: 3,
        explanation:
          "Printing inside the function does not return result to answer. Line 3 should return result, leaving output to the caller.",
        misconception: "debug-print-versus-return",
        hints: [
          "Track output separately from the value assigned to answer.",
          "Find whether double has a return statement.",
          "The function already computed result; it must send it to the caller.",
        ],
      },
      {
        line: 3,
        answer: "return",
        choices: [
          {
            id: "return",
            text: "return result",
            feedback:
              "This sends the computed value to the caller and performs no internal print.",
          },
          {
            id: "input",
            text: "return value",
            feedback: "This returns the original input, skipping the doubling.",
          },
          {
            id: "print",
            text: "return print(result)",
            feedback:
              "print still produces internal output and itself returns None.",
          },
        ],
        code: `def double(value):\n    result = value * 2\n    return result\n\nanswer = double(${n})\nprint(answer)`,
        expectedOutput: stdout(n * 2),
      },
    ),
    debugging(
      "bug-dictionary-key",
      v,
      {
        topic: "collections",
        subtopic: "debug dictionary updates",
        difficulty: 2,
        type: "find-bug",
        title: "Incident: stock that never falls",
        code: `stock = {"fuel": ${n}, "food": 2}\nused = 1\nstock["used"] = stock["fuel"] - used\nprint(stock["fuel"])`,
        question:
          "Using fuel should reduce its stored stock by used. Which line is wrong?",
        correct: "Line 3",
        distractors: [
          ["Line 1", "The initial stock dictionary matches the starting data."],
          ["Line 2", "used correctly records one unit consumed."],
          [
            "Line 4",
            "Printing the fuel key is correct; that key was never updated.",
          ],
        ],
        expectedOutput: stdout(n),
        focusLine: 3,
        explanation:
          'The assignment writes to a new key, "used", while the existing "fuel" entry stays unchanged. Update the key representing the stock being consumed.',
        misconception: "debug-wrong-dictionary-key",
        hints: [
          "Compare the key being assigned with the key later printed.",
          "A new key does not replace an unrelated existing key.",
          "The subtraction is correct; its destination is wrong.",
        ],
      },
      {
        line: 3,
        answer: "fuel",
        choices: [
          {
            id: "plus",
            text: 'stock["fuel"] += used',
            feedback:
              "That increases stock when the requirement is to consume it.",
          },
          {
            id: "fuel",
            text: 'stock["fuel"] -= used',
            feedback: "This subtracts usage from the existing fuel entry.",
          },
          {
            id: "used",
            text: 'used = stock["fuel"] - used',
            feedback:
              "That updates the usage variable, leaving the fuel stock unchanged.",
          },
        ],
        code: `stock = {"fuel": ${n}, "food": 2}\nused = 1\nstock["fuel"] -= used\nprint(stock["fuel"])`,
        expectedOutput: stdout(n - 1),
      },
    ),
    debugging(
      "bug-loop-return",
      v,
      {
        topic: "functions",
        subtopic: "debug early return",
        difficulty: 3,
        type: "find-bug",
        title: "Incident: a search that gives up",
        code: `def contains_even(values):\n    for value in values:\n        if value % 2 == 0:\n            return True\n        return False\n    return False\n\nprint(contains_even([${2 * n + 1}, ${2 * n + 2}]))`,
        question:
          "The function should report whether any input is even. Which line makes it stop too early?",
        correct: "Line 5",
        distractors: [
          ["Line 3", "Remainder zero correctly detects an even integer."],
          [
            "Line 4",
            "Returning True immediately after a match is valid for an “any” search.",
          ],
          [
            "Line 6",
            "A False return after all values are checked is appropriate.",
          ],
        ],
        expectedOutput: stdout("False"),
        focusLine: 5,
        explanation: `The first input ${2 * n + 1} is odd. Line 5 returns False immediately, before the even second input can be tested. Failure should be declared only after every candidate fails.`,
        misconception: "debug-return-inside-search",
        hints: [
          "Follow only the first iteration.",
          "What happens before the second value can be checked?",
          "Look for a return that declares failure before the loop has finished.",
        ],
      },
      {
        line: 5,
        answer: "continue",
        choices: [
          {
            id: "true",
            text: "return True",
            feedback: "This would report success for an odd first value too.",
          },
          {
            id: "break",
            text: "break",
            feedback:
              "This still prevents checking later values and then returns False.",
          },
          {
            id: "continue",
            text: "continue",
            feedback:
              "This proceeds to the next candidate, leaving the final False return outside the loop.",
          },
        ],
        code: `def contains_even(values):\n    for value in values:\n        if value % 2 == 0:\n            return True\n        continue\n    return False\n\nprint(contains_even([${2 * n + 1}, ${2 * n + 2}]))`,
        expectedOutput: stdout("True"),
      },
    ),
  ];
});
