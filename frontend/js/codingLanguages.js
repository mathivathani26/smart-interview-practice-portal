(function (global) {
  const languages = [
    { id: "python3", label: "Python 3", monacoLanguage: "python" },
    { id: "c", label: "C", monacoLanguage: "c" },
    { id: "cpp", label: "C++", monacoLanguage: "cpp" },
    { id: "java", label: "Java", monacoLanguage: "java" },
    { id: "javascript", label: "JavaScript (Node.js)", monacoLanguage: "javascript" },
  ];

  const defaultStarterCode = {
    python3: `import sys

def solve():
    data = sys.stdin.read().strip().split()
    # TODO: Read input and implement your solution
    pass

if __name__ == "__main__":
    solve()
`,
    c: `#include <stdio.h>

int main(void) {
    /* TODO: Read input and implement your solution */
    return 0;
}
`,
    cpp: `#include <iostream>
using namespace std;

int main() {
    // TODO: Read input and implement your solution
    return 0;
}
`,
    java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // TODO: Read input and implement your solution
        sc.close();
    }
}
`,
    javascript: `const fs = require("fs");

const input = fs.readFileSync(0, "utf8").trim();
// TODO: Read input and implement your solution
`,
  };

  const api = Object.freeze({
    languages: Object.freeze(languages.map((language) => Object.freeze(language))),
    defaultStarterCode: Object.freeze(defaultStarterCode),
    getStarterCode(language, questionStarterCode) {
      const questionCode = questionStarterCode && questionStarterCode[language];
      return typeof questionCode === "string" && questionCode.trim()
        ? questionCode
        : defaultStarterCode[language] || "";
    },
  });

  global.CodingLanguages = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
