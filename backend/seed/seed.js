require("dotenv").config();
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/User");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const AptitudeQuestion = require("../models/AptitudeQuestion");
const CodingQuestion = require("../models/CodingQuestion");
const TheoryQuestion = require("../models/TheoryQuestion");

async function seed() {
  await connectDB();

  console.log("Clearing existing data...");
  await Promise.all([
    User.deleteMany({ role: "admin" }),
    Company.deleteMany({}),
    CompanyPattern.deleteMany({}),
    AptitudeQuestion.deleteMany({}),
    CodingQuestion.deleteMany({}),
    TheoryQuestion.deleteMany({}),
  ]);

  // ---------------- Admin account ----------------
  const adminPasswordHash = await bcrypt.hash("Admin@1234", 10);
  await User.create({
    firstName: "Portal",
    lastName: "Admin",
    email: "admin@smartinterview.local",
    passwordHash: adminPasswordHash,
    role: "admin",
  });
  console.log("Admin account created -> admin@smartinterview.local / Admin@1234");

  // ---------------- Demo student account for standard login testing ----------------
  await User.deleteOne({ email: "demo@student.local" });
  const demoPasswordHash = await bcrypt.hash("Demo@1234", 10);
  await User.create({
    firstName: "Demo",
    lastName: "Student",
    email: "demo@student.local",
    passwordHash: demoPasswordHash,
    role: "student",
  });
  console.log("Demo student account created -> demo@student.local / Demo@1234");

  // ---------------- Theory questions (4 subjects x 3 difficulties, 2 each = 24) ----------------
  const theoryQuestions = await TheoryQuestion.insertMany([
    // Operating Systems
    { subject: "Operating Systems", question_text: "What is the difference between a process and a thread?", difficulty: "Easy", ideal_concepts: ["independent memory space", "shared memory", "lightweight", "context switching cost"] },
    { subject: "Operating Systems", question_text: "What is an operating system, and what are its main functions?", difficulty: "Easy", ideal_concepts: ["resource management", "interface between user and hardware", "process management", "memory management"] },
    { subject: "Operating Systems", question_text: "Explain how a round robin scheduler works, and where it can fall short.", difficulty: "Medium", ideal_concepts: ["fixed time quantum", "circular queue", "preemption", "context-switch overhead", "throughput trade-off"] },
    { subject: "Operating Systems", question_text: "Explain the concept of virtual memory.", difficulty: "Medium", ideal_concepts: ["logical address space", "paging", "secondary storage", "demand paging"] },
    { subject: "Operating Systems", question_text: "Explain deadlock and the four necessary conditions for it to occur.", difficulty: "Hard", ideal_concepts: ["mutual exclusion", "hold and wait", "no preemption", "circular wait"] },
    { subject: "Operating Systems", question_text: "Explain the producer-consumer problem and how semaphores solve it.", difficulty: "Hard", ideal_concepts: ["shared buffer", "synchronization", "mutex", "semaphore wait signal"] },

    // DBMS
    { subject: "DBMS", question_text: "What is a primary key, and how is it different from a unique key?", difficulty: "Easy", ideal_concepts: ["unique identifier", "not null", "single per table", "table constraint"] },
    { subject: "DBMS", question_text: "What is the difference between DELETE and TRUNCATE?", difficulty: "Easy", ideal_concepts: ["row by row deletion", "rollback possible", "faster truncate", "resets auto increment"] },
    { subject: "DBMS", question_text: "What is normalization, and why is 3NF important?", difficulty: "Medium", ideal_concepts: ["redundancy", "functional dependency", "transitive dependency", "data integrity"] },
    { subject: "DBMS", question_text: "Explain ACID properties in a database transaction.", difficulty: "Medium", ideal_concepts: ["atomicity", "consistency", "isolation", "durability"] },
    { subject: "DBMS", question_text: "Explain the concept of indexing and its trade-offs.", difficulty: "Hard", ideal_concepts: ["faster read", "b-tree structure", "slower write", "additional storage"] },
    { subject: "DBMS", question_text: "Explain deadlock in DBMS and how it differs from deadlock in an operating system.", difficulty: "Hard", ideal_concepts: ["transaction waiting", "lock contention", "wait for graph", "rollback"] },

    // Computer Networks
    { subject: "Computer Networks", question_text: "What is the difference between TCP and UDP?", difficulty: "Easy", ideal_concepts: ["connection-oriented", "reliable delivery", "connectionless", "lower overhead"] },
    { subject: "Computer Networks", question_text: "What is an IP address, and what is the difference between IPv4 and IPv6?", difficulty: "Easy", ideal_concepts: ["unique identifier", "network layer", "logical address", "larger address space"] },
    { subject: "Computer Networks", question_text: "Explain the OSI model and its layers.", difficulty: "Medium", ideal_concepts: ["seven layers", "physical layer", "data link layer", "application layer"] },
    { subject: "Computer Networks", question_text: "What is the difference between a hub, a switch, and a router?", difficulty: "Medium", ideal_concepts: ["broadcast", "MAC address", "routing", "different network layers"] },
    { subject: "Computer Networks", question_text: "Explain the three-way handshake used to establish a TCP connection.", difficulty: "Hard", ideal_concepts: ["SYN", "SYN-ACK", "ACK", "connection establishment"] },
    { subject: "Computer Networks", question_text: "Explain how DNS resolution works when you type a website address into a browser.", difficulty: "Hard", ideal_concepts: ["domain name to IP", "recursive query", "DNS server hierarchy", "caching"] },

    // Object-Oriented Programming
    { subject: "Object-Oriented Programming", question_text: "Explain polymorphism with a real-world example.", difficulty: "Easy", ideal_concepts: ["method overriding", "runtime binding", "same interface", "different implementation"] },
    { subject: "Object-Oriented Programming", question_text: "What is encapsulation in OOP?", difficulty: "Easy", ideal_concepts: ["data hiding", "private variables", "getter setter", "bundling data and methods"] },
    { subject: "Object-Oriented Programming", question_text: "Explain the difference between method overloading and method overriding.", difficulty: "Medium", ideal_concepts: ["compile-time polymorphism", "runtime polymorphism", "same method name", "inheritance required for overriding"] },
    { subject: "Object-Oriented Programming", question_text: "What is inheritance, and what are its advantages?", difficulty: "Medium", ideal_concepts: ["code reuse", "parent child class", "is-a relationship", "extending functionality"] },
    { subject: "Object-Oriented Programming", question_text: "Explain the SOLID principles briefly.", difficulty: "Hard", ideal_concepts: ["single responsibility", "open closed", "liskov substitution", "dependency inversion"] },
    { subject: "Object-Oriented Programming", question_text: "Explain the difference between abstract classes and interfaces.", difficulty: "Hard", ideal_concepts: ["partial implementation", "multiple inheritance", "contract definition", "cannot instantiate"] },
  ]);

  // ---------------- Aptitude questions (3 categories x 3 difficulties, 3 each = 27) ----------------
  const aptitudeQuestions = await AptitudeQuestion.insertMany([
    // Quantitative
    { category: "quantitative", question_text: "What is 15% of 480?", options: ["62", "72", "84", "96"], correct_option: "72", difficulty: "Easy" },
    { category: "quantitative", question_text: "A shopkeeper sells an item for $60 after a 20% discount. What was the original price?", options: ["70", "72", "75", "80"], correct_option: "75", difficulty: "Easy" },
    { category: "quantitative", question_text: "If a car travels 180 km in 3 hours, what is its average speed?", options: ["50 km/h", "55 km/h", "60 km/h", "65 km/h"], correct_option: "60 km/h", difficulty: "Easy" },
    { category: "quantitative", question_text: "A train 150m long crosses a platform 250m long in 20 seconds. What is the speed of the train in km/h?", options: ["54 km/h", "60 km/h", "72 km/h", "80 km/h"], correct_option: "72 km/h", difficulty: "Medium" },
    { category: "quantitative", question_text: "The average of 5 numbers is 20. If one number is removed, the average of the remaining 4 becomes 18. What was the removed number?", options: ["24", "26", "28", "30"], correct_option: "28", difficulty: "Medium" },
    { category: "quantitative", question_text: "A sum of money doubles itself in 8 years at simple interest. What is the rate of interest per annum?", options: ["10%", "12.5%", "15%", "20%"], correct_option: "12.5%", difficulty: "Medium" },
    { category: "quantitative", question_text: "Two pipes A and B can fill a tank in 12 and 18 minutes respectively. If both pipes are opened together, how long will it take to fill the tank?", options: ["7.2 minutes", "7.5 minutes", "8 minutes", "9 minutes"], correct_option: "7.2 minutes", difficulty: "Hard" },
    { category: "quantitative", question_text: "A sum of $8000 is invested at compound interest of 10% per annum. What is the amount after 2 years?", options: ["9600", "9680", "9800", "10000"], correct_option: "9680", difficulty: "Hard" },
    { category: "quantitative", question_text: "In how many ways can the letters of the word 'LEADER' be arranged?", options: ["360", "720", "120", "180"], correct_option: "360", difficulty: "Hard" },

    // Logical
    { category: "logical", question_text: "Find the odd one out: Apple, Banana, Carrot, Mango", options: ["Apple", "Banana", "Carrot", "Mango"], correct_option: "Carrot", difficulty: "Easy" },
    { category: "logical", question_text: "Complete the series: 2, 4, 6, 8, ?", options: ["9", "10", "11", "12"], correct_option: "10", difficulty: "Easy" },
    { category: "logical", question_text: "If all Cats are Animals, and all Animals need food, do all Cats need food?", options: ["Yes", "No", "Cannot be determined", "Only some"], correct_option: "Yes", difficulty: "Easy" },
    { category: "logical", question_text: "If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops definitely Lazzies?", options: ["Yes", "No", "Cannot be determined", "Only sometimes"], correct_option: "Yes", difficulty: "Medium" },
    { category: "logical", question_text: "Find the odd one out: 2, 3, 5, 9, 11, 13", options: ["3", "5", "9", "13"], correct_option: "9", difficulty: "Medium" },
    { category: "logical", question_text: "Pointing to a photograph, a man says, 'She is the daughter of my grandfather's only son.' How is the woman related to the man?", options: ["Mother", "Sister", "Aunt", "Cousin"], correct_option: "Sister", difficulty: "Medium" },
    { category: "logical", question_text: "Five friends P, Q, R, S, T sit in a row. P is to the left of Q but right of R. S is to the right of T but left of R. Who is in the middle?", options: ["P", "Q", "R", "S"], correct_option: "R", difficulty: "Hard" },
    { category: "logical", question_text: "A is the brother of B. B is the sister of C. C is the father of D. How is A related to D?", options: ["Uncle", "Father", "Brother", "Cousin"], correct_option: "Uncle", difficulty: "Hard" },
    { category: "logical", question_text: "Statements: All pens are pencils. Some pencils are erasers. Conclusions: I. Some pens are erasers. II. Some erasers are pencils. Which conclusion(s) follow?", options: ["Only I follows", "Only II follows", "Both follow", "Neither follows"], correct_option: "Only II follows", difficulty: "Hard" },

    // Verbal
    { category: "verbal", question_text: "Choose the word most nearly opposite in meaning to 'Frugal'", options: ["Thrifty", "Extravagant", "Modest", "Careful"], correct_option: "Extravagant", difficulty: "Easy" },
    { category: "verbal", question_text: "Choose the correctly spelled word.", options: ["Acommodate", "Accommodate", "Acomodate", "Accomodate"], correct_option: "Accommodate", difficulty: "Easy" },
    { category: "verbal", question_text: "Choose the correct synonym for 'Happy'", options: ["Joyful", "Sad", "Angry", "Tired"], correct_option: "Joyful", difficulty: "Easy" },
    { category: "verbal", question_text: "Choose the word that best completes the sentence: She was ____ to hear the good news.", options: ["elated", "dejected", "indifferent", "confused"], correct_option: "elated", difficulty: "Medium" },
    { category: "verbal", question_text: "Identify the correctly punctuated sentence.", options: ["Its a beautiful day.", "It's a beautiful day.", "Its' a beautiful day.", "It is a beautiful, day."], correct_option: "It's a beautiful day.", difficulty: "Medium" },
    { category: "verbal", question_text: "Choose the antonym of 'Benevolent'", options: ["Kind", "Generous", "Malevolent", "Charitable"], correct_option: "Malevolent", difficulty: "Medium" },
    { category: "verbal", question_text: "Choose the option that best expresses the meaning of the idiom 'Bite the bullet'", options: ["To avoid a difficult situation", "To face a difficult situation bravely", "To argue aggressively", "To celebrate a victory"], correct_option: "To face a difficult situation bravely", difficulty: "Hard" },
    { category: "verbal", question_text: "Fill in the blank with the most appropriate word: The committee's decision was ____, leaving no room for further debate.", options: ["ambiguous", "tentative", "conclusive", "arbitrary"], correct_option: "conclusive", difficulty: "Hard" },
    { category: "verbal", question_text: "Choose the correctly restructured sentence: 'Despite of his hard work, he failed the exam.'", options: ["Despite his hard work, he failed the exam.", "In spite his hard work, he failed the exam.", "Despite of his hard working, he failed the exam.", "Although of his hard work, he failed the exam."], correct_option: "Despite his hard work, he failed the exam.", difficulty: "Hard" },
  ]);

  // ---------------- Coding questions (3 per difficulty = 9) ----------------
  const codingQuestions = await CodingQuestion.insertMany([
    // Easy
    {
      title: "Reverse a Linked List",
      description: "Given the head of a singly linked list, reverse the list and return the new head.",
      difficulty: "Easy",
      tags: ["linked list"],
      starter_code: {
        python3: "def reverse_list(values):\n    pass\n\nif __name__ == \"__main__\":\n    values = list(map(int, input().split()))\n    result = reverse_list(values)\n    print(\" \".join(map(str, result)))",
        javascript: "function reverseList(values) {\n    // TODO: return the reversed array\n}\n\nconst fs = require(\"fs\");\nconst values = fs.readFileSync(0, \"utf8\").trim().split(\" \").map(Number);\nconst result = reverseList(values);\nconsole.log(result.join(\" \"));",
        cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nvector<int> reverseList(vector<int> values) {\n    // TODO: return the reversed vector\n    return {};\n}\n\nint main() {\n    vector<int> values; int x;\n    while (cin >> x) values.push_back(x);\n    vector<int> result = reverseList(values);\n    for (size_t i = 0; i < result.size(); i++) { cout << result[i]; if (i+1 < result.size()) cout << \" \"; }\n    cout << endl;\n    return 0;\n}",
        java: "import java.util.*;\n\npublic class Main {\n    static List<Integer> reverseList(List<Integer> values) {\n        // TODO: return the reversed list\n        return new ArrayList<>();\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        List<Integer> values = new ArrayList<>();\n        while (sc.hasNextInt()) values.add(sc.nextInt());\n        List<Integer> result = reverseList(values);\n        StringBuilder sb = new StringBuilder();\n        for (int i = 0; i < result.size(); i++) { sb.append(result.get(i)); if (i+1 < result.size()) sb.append(\" \"); }\n        System.out.println(sb.toString());\n    }\n}",
      },
      test_cases: [
        { input: "1 2 3 4 5", expected_output: "5 4 3 2 1", hidden: false },
        { input: "1", expected_output: "1", hidden: false },
        { input: "1 2", expected_output: "2 1", hidden: true },
      ],
    },
    {
      title: "Sum of Array Elements",
      description: "Given an array of integers, print the sum of all elements.",
      difficulty: "Easy",
      tags: ["arrays"],
      starter_code: {
        python3: "def array_sum(nums):\n    pass\n\nif __name__ == \"__main__\":\n    nums = list(map(int, input().split()))\n    print(array_sum(nums))",
        javascript: "function arraySum(nums) {\n    // TODO: return the sum\n}\n\nconst fs = require(\"fs\");\nconst nums = fs.readFileSync(0, \"utf8\").trim().split(\" \").map(Number);\nconsole.log(arraySum(nums));",
        cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint arraySum(vector<int> nums) {\n    // TODO: return the sum\n    return -999999;\n}\n\nint main() {\n    vector<int> nums; int x;\n    while (cin >> x) nums.push_back(x);\n    cout << arraySum(nums) << endl;\n    return 0;\n}",
        java: "import java.util.*;\n\npublic class Main {\n    static int arraySum(List<Integer> nums) {\n        // TODO: return the sum\n        return -999999;\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        List<Integer> nums = new ArrayList<>();\n        while (sc.hasNextInt()) nums.add(sc.nextInt());\n        System.out.println(arraySum(nums));\n    }\n}",
      },
      test_cases: [
        { input: "1 2 3 4 5", expected_output: "15", hidden: false },
        { input: "10 -2 3", expected_output: "11", hidden: false },
        { input: "0 0 0", expected_output: "0", hidden: true },
      ],
    },
    {
      title: "Check Palindrome String",
      description: "Given a string, print True if it reads the same forwards and backwards, otherwise print False.",
      difficulty: "Easy",
      tags: ["strings"],
      starter_code: {
        python3: "def is_palindrome(s):\n    pass\n\nif __name__ == \"__main__\":\n    s = input().strip()\n    print(is_palindrome(s))",
        javascript: "function isPalindrome(s) {\n    // TODO: return the string \"True\" or \"False\"\n}\n\nconst fs = require(\"fs\");\nconst s = fs.readFileSync(0, \"utf8\").trim();\nconsole.log(isPalindrome(s));",
        cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nstring isPalindrome(string s) {\n    // TODO: return \"True\" or \"False\"\n    return \"\";\n}\n\nint main() {\n    string s; cin >> s;\n    cout << isPalindrome(s) << endl;\n    return 0;\n}",
        java: "import java.util.*;\n\npublic class Main {\n    static String isPalindrome(String s) {\n        // TODO: return \"True\" or \"False\"\n        return \"\";\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        String s = sc.next();\n        System.out.println(isPalindrome(s));\n    }\n}",
      },
      test_cases: [
        { input: "madam", expected_output: "True", hidden: false },
        { input: "hello", expected_output: "False", hidden: false },
        { input: "racecar", expected_output: "True", hidden: true },
      ],
    },

    // Medium
    {
      title: "Two Sum",
      description: "Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target.",
      difficulty: "Medium",
      tags: ["arrays", "hash map"],
      starter_code: {
        python3: "def two_sum(nums, target):\n    pass\n\nif __name__ == \"__main__\":\n    nums = list(map(int, input().split()))\n    target = int(input())\n    result = two_sum(nums, target)\n    print(\" \".join(map(str, result)))",
        javascript: "function twoSum(nums, target) {\n    // TODO: return [i, j]\n}\n\nconst fs = require(\"fs\");\nconst lines = fs.readFileSync(0, \"utf8\").trim().split(\"\\n\");\nconst nums = lines[0].split(\" \").map(Number);\nconst target = parseInt(lines[1]);\nconst result = twoSum(nums, target);\nconsole.log(result.join(\" \"));",
        cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nvector<int> twoSum(vector<int> nums, int target) {\n    // TODO: return {i, j}\n    return {};\n}\n\nint main() {\n    string line1; getline(cin, line1);\n    vector<int> nums; stringstream ss(line1); int x;\n    while (ss >> x) nums.push_back(x);\n    int target; cin >> target;\n    vector<int> result = twoSum(nums, target);\n    for (size_t i = 0; i < result.size(); i++) { cout << result[i]; if (i+1 < result.size()) cout << \" \"; }\n    cout << endl;\n    return 0;\n}",
        java: "import java.util.*;\n\npublic class Main {\n    static int[] twoSum(int[] nums, int target) {\n        // TODO: return new int[]{i, j}\n        return new int[]{};\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        String line1 = sc.nextLine();\n        String[] parts = line1.trim().split(\" \");\n        int[] nums = new int[parts.length];\n        for (int i = 0; i < parts.length; i++) nums[i] = Integer.parseInt(parts[i]);\n        int target = Integer.parseInt(sc.nextLine().trim());\n        int[] result = twoSum(nums, target);\n        StringBuilder sb = new StringBuilder();\n        for (int i = 0; i < result.length; i++) { sb.append(result[i]); if (i+1 < result.length) sb.append(\" \"); }\n        System.out.println(sb.toString());\n    }\n}",
      },
      test_cases: [
        { input: "2 7 11 15\n9", expected_output: "0 1", hidden: false },
        { input: "3 2 4\n6", expected_output: "1 2", hidden: false },
        { input: "3 3\n6", expected_output: "0 1", hidden: true },
      ],
    },
    {
      title: "Valid Parentheses",
      description: "Given a string containing just the characters (){}[], determine if the brackets are validly matched and nested.",
      difficulty: "Medium",
      tags: ["stack"],
      starter_code: {
        python3: "def is_valid(s):\n    pass\n\nif __name__ == \"__main__\":\n    s = input().strip()\n    print(is_valid(s))",
        javascript: "function isValid(s) {\n    // TODO: return \"True\" or \"False\"\n}\n\nconst fs = require(\"fs\");\nconst s = fs.readFileSync(0, \"utf8\").trim();\nconsole.log(isValid(s));",
        cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nstring isValid(string s) {\n    // TODO: return \"True\" or \"False\"\n    return \"\";\n}\n\nint main() {\n    string s; cin >> s;\n    cout << isValid(s) << endl;\n    return 0;\n}",
        java: "import java.util.*;\n\npublic class Main {\n    static String isValid(String s) {\n        // TODO: return \"True\" or \"False\"\n        return \"\";\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        String s = sc.next();\n        System.out.println(isValid(s));\n    }\n}",
      },
      test_cases: [
        { input: "()[]{}", expected_output: "True", hidden: false },
        { input: "(]", expected_output: "False", hidden: false },
        { input: "{[]}", expected_output: "True", hidden: true },
      ],
    },
    {
      title: "Merge Two Sorted Arrays",
      description: "Given two sorted arrays, merge them into a single sorted array.",
      difficulty: "Medium",
      tags: ["arrays", "sorting"],
      starter_code: {
        python3: "def merge_sorted(a, b):\n    pass\n\nif __name__ == \"__main__\":\n    a = list(map(int, input().split()))\n    b = list(map(int, input().split()))\n    result = merge_sorted(a, b)\n    print(\" \".join(map(str, result)))",
        javascript: "function mergeSorted(a, b) {\n    // TODO: return the merged sorted array\n}\n\nconst fs = require(\"fs\");\nconst lines = fs.readFileSync(0, \"utf8\").trim().split(\"\\n\");\nconst a = lines[0].split(\" \").map(Number);\nconst b = lines[1].split(\" \").map(Number);\nconst result = mergeSorted(a, b);\nconsole.log(result.join(\" \"));",
        cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nvector<int> mergeSorted(vector<int> a, vector<int> b) {\n    // TODO: return the merged sorted vector\n    return {};\n}\n\nint main() {\n    string line1, line2; getline(cin, line1); getline(cin, line2);\n    vector<int> a, b; stringstream ss1(line1), ss2(line2); int x;\n    while (ss1 >> x) a.push_back(x);\n    while (ss2 >> x) b.push_back(x);\n    vector<int> result = mergeSorted(a, b);\n    for (size_t i = 0; i < result.size(); i++) { cout << result[i]; if (i+1 < result.size()) cout << \" \"; }\n    cout << endl;\n    return 0;\n}",
        java: "import java.util.*;\n\npublic class Main {\n    static List<Integer> mergeSorted(List<Integer> a, List<Integer> b) {\n        // TODO: return the merged sorted list\n        return new ArrayList<>();\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        List<Integer> a = new ArrayList<>(), b = new ArrayList<>();\n        for (String p : sc.nextLine().trim().split(\" \")) a.add(Integer.parseInt(p));\n        for (String p : sc.nextLine().trim().split(\" \")) b.add(Integer.parseInt(p));\n        List<Integer> result = mergeSorted(a, b);\n        StringBuilder sb = new StringBuilder();\n        for (int i = 0; i < result.size(); i++) { sb.append(result.get(i)); if (i+1 < result.size()) sb.append(\" \"); }\n        System.out.println(sb.toString());\n    }\n}",
      },
      test_cases: [
        { input: "1 3 5\n2 4 6", expected_output: "1 2 3 4 5 6", hidden: false },
        { input: "1 2 3\n4 5 6", expected_output: "1 2 3 4 5 6", hidden: false },
        { input: "-5 5\n0 10", expected_output: "-5 0 5 10", hidden: true },
      ],
    },

    // Hard
    {
      title: "Longest Increasing Subsequence",
      description: "Given an integer array nums, return the length of the longest strictly increasing subsequence.",
      difficulty: "Hard",
      tags: ["dynamic programming"],
      starter_code: {
        python3: "def length_of_lis(nums):\n    pass\n\nif __name__ == \"__main__\":\n    nums = list(map(int, input().split()))\n    print(length_of_lis(nums))",
        javascript: "function lengthOfLIS(nums) {\n    // TODO: return the length of the longest increasing subsequence\n}\n\nconst fs = require(\"fs\");\nconst nums = fs.readFileSync(0, \"utf8\").trim().split(\" \").map(Number);\nconsole.log(lengthOfLIS(nums));",
        cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint lengthOfLIS(vector<int> nums) {\n    // TODO: return the length of the longest increasing subsequence\n    return -1;\n}\n\nint main() {\n    vector<int> nums; int x;\n    while (cin >> x) nums.push_back(x);\n    cout << lengthOfLIS(nums) << endl;\n    return 0;\n}",
        java: "import java.util.*;\n\npublic class Main {\n    static int lengthOfLIS(int[] nums) {\n        // TODO: return the length of the longest increasing subsequence\n        return -1;\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        List<Integer> list = new ArrayList<>();\n        while (sc.hasNextInt()) list.add(sc.nextInt());\n        int[] nums = list.stream().mapToInt(Integer::intValue).toArray();\n        System.out.println(lengthOfLIS(nums));\n    }\n}",
      },
      test_cases: [
        { input: "10 9 2 5 3 7 101 18", expected_output: "4", hidden: false },
        { input: "0 1 0 3 2 3", expected_output: "4", hidden: false },
        { input: "7 7 7 7", expected_output: "1", hidden: true },
      ],
    },
    {
      title: "Median of Two Sorted Arrays",
      description: "Given two sorted arrays, find the median of the combined set of elements.",
      difficulty: "Hard",
      tags: ["arrays", "binary search"],
      starter_code: {
        python3: "def find_median(a, b):\n    pass\n\nif __name__ == \"__main__\":\n    a = list(map(int, input().split()))\n    b = list(map(int, input().split()))\n    print(find_median(a, b))",
        javascript: "function findMedian(a, b) {\n    // TODO: return the median as a number\n}\n\nconst fs = require(\"fs\");\nconst lines = fs.readFileSync(0, \"utf8\").trim().split(\"\\n\");\nconst a = lines[0].split(\" \").map(Number);\nconst b = lines[1].split(\" \").map(Number);\nconst result = findMedian(a, b);\nconsole.log(Number(result).toFixed(1));",
        cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\ndouble findMedian(vector<int> a, vector<int> b) {\n    // TODO: return the median\n    return -1.0;\n}\n\nint main() {\n    string line1, line2; getline(cin, line1); getline(cin, line2);\n    vector<int> a, b; stringstream ss1(line1), ss2(line2); int x;\n    while (ss1 >> x) a.push_back(x);\n    while (ss2 >> x) b.push_back(x);\n    double result = findMedian(a, b);\n    cout << fixed << setprecision(1) << result << endl;\n    return 0;\n}",
        java: "import java.util.*;\n\npublic class Main {\n    static double findMedian(List<Integer> a, List<Integer> b) {\n        // TODO: return the median\n        return -1.0;\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        List<Integer> a = new ArrayList<>(), b = new ArrayList<>();\n        for (String p : sc.nextLine().trim().split(\" \")) a.add(Integer.parseInt(p));\n        for (String p : sc.nextLine().trim().split(\" \")) b.add(Integer.parseInt(p));\n        double result = findMedian(a, b);\n        System.out.printf(\"%.1f%n\", result);\n    }\n}",
      },
      test_cases: [
        { input: "1 3\n2", expected_output: "2.0", hidden: false },
        { input: "1 2\n3 4", expected_output: "2.5", hidden: false },
        { input: "0 0\n0 0", expected_output: "0.0", hidden: true },
      ],
    },
    {
      title: "Detect Cycle in a Linked List",
      description: "Given a linked list and a position where the tail connects back to (or -1 for no cycle), determine whether the list contains a cycle.",
      difficulty: "Hard",
      tags: ["linked list", "two pointer"],
      starter_code: {
        python3: "def has_cycle(values, pos):\n    pass\n\nif __name__ == \"__main__\":\n    values = list(map(int, input().split()))\n    pos = int(input())\n    print(has_cycle(values, pos))",
        javascript: "function hasCycle(values, pos) {\n    // TODO: return \"True\" or \"False\"\n}\n\nconst fs = require(\"fs\");\nconst lines = fs.readFileSync(0, \"utf8\").trim().split(\"\\n\");\nconst values = lines[0].split(\" \").map(Number);\nconst pos = parseInt(lines[1]);\nconsole.log(hasCycle(values, pos));",
        cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nstring hasCycle(vector<int> values, int pos) {\n    // TODO: return \"True\" or \"False\"\n    return \"\";\n}\n\nint main() {\n    string line1; getline(cin, line1);\n    vector<int> values; stringstream ss(line1); int x;\n    while (ss >> x) values.push_back(x);\n    int pos; cin >> pos;\n    cout << hasCycle(values, pos) << endl;\n    return 0;\n}",
        java: "import java.util.*;\n\npublic class Main {\n    static String hasCycle(List<Integer> values, int pos) {\n        // TODO: return \"True\" or \"False\"\n        return \"\";\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        List<Integer> values = new ArrayList<>();\n        for (String p : sc.nextLine().trim().split(\" \")) values.add(Integer.parseInt(p));\n        int pos = Integer.parseInt(sc.nextLine().trim());\n        System.out.println(hasCycle(values, pos));\n    }\n}",
      },
      test_cases: [
        { input: "3 2 0 -4\n1", expected_output: "True", hidden: false },
        { input: "1\n-1", expected_output: "False", hidden: false },
        { input: "1 2\n0", expected_output: "True", hidden: true },
      ],
    },
  ]);

  // ---------------- Companies + patterns ----------------
  const companySpecs = [
    { name: "TCS", description: "TCS NQT pattern", pattern: [
      { round_type: "aptitude", question_count: 3, time_limit_seconds: 60 },
      { round_type: "coding", question_count: 1, time_limit_seconds: 900 },
      { round_type: "theory", question_count: 2, time_limit_seconds: 360 },
    ]},
    { name: "Zoho", description: "Zoho written test pattern", pattern: [
      { round_type: "aptitude", question_count: 2, time_limit_seconds: 60 },
      { round_type: "coding", question_count: 1, time_limit_seconds: 900 },
      { round_type: "theory", question_count: 2, time_limit_seconds: 360 },
    ]},
    { name: "Infosys", description: "Infosys pattern test", pattern: [
      { round_type: "aptitude", question_count: 3, time_limit_seconds: 60 },
      { round_type: "coding", question_count: 1, time_limit_seconds: 900 },
      { round_type: "theory", question_count: 1, time_limit_seconds: 360 },
    ]},
    { name: "Amazon", description: "Amazon OA pattern", pattern: [
      { round_type: "coding", question_count: 2, time_limit_seconds: 900 },
      { round_type: "theory", question_count: 2, time_limit_seconds: 360 },
    ]},
    { name: "Cognizant", description: "Cognizant GenC pattern", pattern: [
      { round_type: "aptitude", question_count: 3, time_limit_seconds: 60 },
      { round_type: "coding", question_count: 1, time_limit_seconds: 900 },
      { round_type: "theory", question_count: 1, time_limit_seconds: 360 },
    ]},
  ];

  for (const spec of companySpecs) {
    const company = await Company.create({ name: spec.name, description: spec.description });
    await CompanyPattern.create({ company: company._id, round_sequence: spec.pattern });
  }

  console.log(`Seeded: 1 admin, ${companySpecs.length} companies, ${theoryQuestions.length} theory Qs, ${aptitudeQuestions.length} aptitude Qs, ${codingQuestions.length} coding Qs.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
