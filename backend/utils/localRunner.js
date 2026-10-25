/**
 * Local code execution — a genuine offline alternative to Judge0.
 *
 * Runs submitted Python (via a local python3/python interpreter) or
 * JavaScript (via the same Node.js binary already running this server)
 * directly on this machine, feeding real stdin and capturing real stdout.
 * This is REAL execution, not simulation — wrong code genuinely fails,
 * correct code genuinely passes.
 *
 * Scope/safety note: this is designed for single-user local practice
 * (the student runs their own submitted code on their own machine). It is
 * NOT a sandboxed, multi-tenant-safe judge — it should not be exposed on
 * a shared or public server without proper sandboxing (containers, resource
 * limits, restricted syscalls, etc.). A timeout is enforced to stop runaway
 * loops, but there is no protection against arbitrary filesystem/network
 * access from submitted code.
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function detectCommand(candidates) {
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: "ignore" });
      return cmd;
    } catch (e) {
      // try next candidate
    }
  }
  return null;
}

const PYTHON_CMD = detectCommand(process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"]);
const GPP_CMD = detectCommand(["g++"]);
const JAVA_CMD = detectCommand(["java"]); // JDK 11+ single-file source launcher: `java Main.java`
const TIMEOUT_MS = 5000;
const COMPILE_TIMEOUT_MS = 10000;

function runWithStdin(command, args, stdin, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args);
    } catch (err) {
      resolve({ stdout: "", stderr: err.message, timedOut: false, exitCode: -1 });
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut, exitCode: code });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout: "", stderr: err.message, timedOut: false, exitCode: -1 });
    });

    try {
      child.stdin.write(stdin || "");
      child.stdin.end();
    } catch (e) {
      // process may have already exited (e.g. syntax error before reading stdin)
    }
  });
}

function writeTempFile(code, ext) {
  const file = path.join(os.tmpdir(), `sip_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(file, code);
  return file;
}

async function runPython(code, stdin) {
  if (!PYTHON_CMD) return null;
  const file = writeTempFile(code, "py");
  try {
    return await runWithStdin(PYTHON_CMD, [file], stdin);
  } finally {
    fs.unlink(file, () => {});
  }
}

async function runJavaScript(code, stdin) {
  const file = writeTempFile(code, "js");
  try {
    return await runWithStdin(process.execPath, [file], stdin);
  } finally {
    fs.unlink(file, () => {});
  }
}

async function compileCpp(code) {
  if (!GPP_CMD) return null;
  const srcFile = writeTempFile(code, "cpp");
  const binFile = srcFile.replace(/\.cpp$/, process.platform === "win32" ? ".exe" : ".out");
  const compile = await runWithStdin(GPP_CMD, [srcFile, "-o", binFile, "-O2"], "", COMPILE_TIMEOUT_MS);
  fs.unlink(srcFile, () => {});
  if (compile.exitCode !== 0 || compile.timedOut) {
    return { ok: false, error: compile.stderr || "Compilation failed", timedOut: compile.timedOut };
  }
  return { ok: true, run: (stdin) => runWithStdin(binFile, [], stdin), cleanup: () => fs.unlink(binFile, () => {}) };
}

async function prepareJava(code) {
  if (!JAVA_CMD) return null;
  // The single-file source launcher (`java Main.java`, JDK 11+) requires the
  // filename to match the public class name — every Java template here must
  // declare `public class Main`.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sip_java_"));
  const file = path.join(dir, "Main.java");
  fs.writeFileSync(file, code);
  return {
    ok: true,
    run: (stdin) => runWithStdin(JAVA_CMD, [file], stdin, TIMEOUT_MS + COMPILE_TIMEOUT_MS),
    cleanup: () => fs.rm(dir, { recursive: true, force: true }, () => {}),
  };
}

const INTERPRETED = { python3: runPython, python: runPython, javascript: runJavaScript };
const COMPILED = { cpp: compileCpp, "c++": compileCpp, java: prepareJava };

function isSupported(language) {
  const key = (language || "").toLowerCase();
  if (key === "python3" || key === "python") return !!PYTHON_CMD;
  if (key === "javascript") return true; // Node is always available — this server IS Node
  if (key === "cpp" || key === "c++") return !!GPP_CMD;
  if (key === "java") return !!JAVA_CMD;
  return false;
}

function buildResult(tc, execResult) {
  const actual = (execResult.stdout || "").trim();
  const expected = (tc.expected_output || "").trim();

  let verdict, passed;
  if (execResult.timedOut) {
    verdict = "Time Limit Exceeded"; passed = false;
  } else if (execResult.compileError) {
    verdict = "Compilation Error"; passed = false;
  } else if (execResult.exitCode !== 0 && execResult.stderr) {
    verdict = "Runtime Error"; passed = false;
  } else if (actual === expected) {
    verdict = "Accepted"; passed = true;
  } else {
    verdict = "Wrong Answer"; passed = false;
  }

  return {
    input: tc.hidden ? "(hidden)" : tc.input,
    expected_output: tc.hidden ? "(hidden)" : tc.expected_output,
    actual_output: tc.hidden
      ? "(hidden)"
      : execResult.stderr ? `Error: ${execResult.stderr.split("\n")[0]}` : actual,
    passed,
    verdict,
    time_ms: execResult.time_ms ?? null,
    memory_kb: null, // not measured locally (would need OS-level process monitoring)
    hidden: tc.hidden,
  };
}

async function runLocal(code, language, testCases) {
  const key = (language || "").toLowerCase();

  if (INTERPRETED[key]) {
    const runner = INTERPRETED[key];
    const results = [];
    for (const tc of testCases) {
      const t0 = Date.now();
      const execResult = await runner(code, tc.input);
      execResult.time_ms = Date.now() - t0;
      results.push(buildResult(tc, execResult));
    }
    return results;
  }

  if (COMPILED[key]) {
    const prepare = COMPILED[key];
    const build = await prepare(code);
    if (!build.ok) {
      // compilation failed once — every test case reports the same compile error
      return testCases.map((tc) => buildResult(tc, { compileError: true, stderr: build.error, timedOut: build.timedOut, exitCode: 1 }));
    }
    const results = [];
    for (const tc of testCases) {
      const t0 = Date.now();
      const execResult = await build.run(tc.input);
      execResult.time_ms = Date.now() - t0;
      results.push(buildResult(tc, execResult));
    }
    build.cleanup();
    return results;
  }

  return null; // language not locally supported
}

module.exports = {
  runLocal,
  isSupported,
  isPythonAvailable: () => !!PYTHON_CMD,
  isCppAvailable: () => !!GPP_CMD,
  isJavaAvailable: () => !!JAVA_CMD,
};
