require("dotenv").config();
const mongoose = require("mongoose");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const MockDrive = require("../models/MockDrive");
const AptitudeQuestion = require("../models/AptitudeQuestion");
const TheoryQuestion = require("../models/TheoryQuestion");
const CodingQuestion = require("../models/CodingQuestion");
const CompanyQuestionAssignment = require("../models/CompanyQuestionAssignment");
const { validateRoundAvailability, validateRoundSequence } = require("../utils/companyPattern");
const { getCompanyQuestionIds } = require("../utils/companyQuestionAssignments");

const QUESTION_BANKS = {
  aptitude: AptitudeQuestion,
  theory: TheoryQuestion,
  coding: CodingQuestion,
};

const COMPANIES = [
  ["Amazon", "E-commerce, cloud computing, and digital services."],
  ["TCS", "IT services, consulting, and software development."],
  ["Infosys", "IT services and digital transformation."],
  ["Wipro", "Technology services and software engineering."],
  ["Accenture", "Technology, consulting, and digital transformation."],
  ["Cognizant", "IT services, digital technology, and business solutions."],
];

const APTITUDE_QUESTIONS = [
  { category: "quantitative", difficulty: "Easy", question_text: "A product priced at 800 is discounted by 15%. What is its sale price?", options: ["660", "680", "700", "720"], correct_option: "680", explanation: "The discount is 0.15 × 800 = 120, so the sale price is 800 − 120 = 680." },
  { category: "quantitative", difficulty: "Easy", question_text: "The average of 12, 18, and 24 is:", options: ["16", "18", "20", "22"], correct_option: "18", explanation: "The sum is 54; dividing by 3 gives an average of 18." },
  { category: "quantitative", difficulty: "Medium", question_text: "A train travels 210 km in 3.5 hours. What is its average speed?", options: ["50 km/h", "55 km/h", "60 km/h", "65 km/h"], correct_option: "60 km/h", explanation: "Average speed is distance divided by time: 210 ÷ 3.5 = 60 km/h." },
  { category: "quantitative", difficulty: "Medium", question_text: "A sum of 2400 earns simple interest at 5% per year for 2 years. What is the interest?", options: ["120", "200", "240", "300"], correct_option: "240", explanation: "Simple interest is principal × rate × time ÷ 100: 2400 × 5 × 2 ÷ 100 = 240." },
  { category: "quantitative", difficulty: "Hard", question_text: "A can finish a task in 12 days and B in 18 days. How long do they take working together at constant rates?", options: ["6 days", "7.2 days", "8 days", "9 days"], correct_option: "7.2 days", explanation: "Their combined daily rate is 1/12 + 1/18 = 5/36, so the task takes 36/5 = 7.2 days." },
  { category: "logical", difficulty: "Easy", question_text: "Find the next number: 3, 6, 12, 24, __.", options: ["30", "36", "48", "54"], correct_option: "48", explanation: "Each term is twice the preceding term; 24 × 2 = 48." },
  { category: "logical", difficulty: "Medium", question_text: "All analysts are employees. Some employees work remotely. Which conclusion must be true?", options: ["All analysts work remotely", "Some analysts work remotely", "Every analyst is an employee", "No employees are analysts"], correct_option: "Every analyst is an employee", explanation: "This repeats the first premise. The premises do not establish whether any analysts work remotely." },
  { category: "logical", difficulty: "Hard", question_text: "In a code, each letter is replaced by the next letter in the alphabet. How is CODE written?", options: ["DPEF", "BNCD", "DPED", "DODF"], correct_option: "DPEF", explanation: "Move each character forward by one: C→D, O→P, D→E, E→F." },
  { category: "verbal", difficulty: "Easy", question_text: "Choose the closest meaning of 'concise'.", options: ["Brief", "Unclear", "Careless", "Unusual"], correct_option: "Brief", explanation: "Concise means expressing something clearly in few words." },
  { category: "verbal", difficulty: "Medium", question_text: "Choose the grammatically correct sentence.", options: ["Neither answer are correct.", "Neither answer is correct.", "Neither answers is correct.", "Neither of answer are correct."], correct_option: "Neither answer is correct.", explanation: "'Neither' is singular in this construction, so it takes the singular verb 'is'." },
];

const THEORY_QUESTIONS = [
  {
    subject: "Operating Systems", difficulty: "Easy",
    question_text: "Explain how virtual memory lets a process use an address space larger than available physical memory.",
    reference_answer: "Virtual memory gives each process a logical address space. The operating system and memory-management hardware map virtual pages to physical frames; pages not currently resident can be kept on secondary storage and brought into memory on demand. This allows isolation and a larger apparent address space, although page faults and excessive paging add latency.",
    ideal_concepts: ["logical address space", "virtual pages mapped to physical frames", "secondary storage and demand paging", "page-fault cost and process isolation"],
    marking_rubric: ["Explains per-process logical address space", "Describes mapping virtual pages to physical frames", "Explains demand paging or backing storage", "Notes isolation or page-fault performance cost"],
    max_marks: 10,
  },
  {
    subject: "Operating Systems", difficulty: "Medium",
    question_text: "What causes a deadlock, and how do the four Coffman conditions relate to it?",
    reference_answer: "A deadlock is a set of processes that cannot proceed because each is waiting for a resource held by another. The necessary Coffman conditions are mutual exclusion, hold and wait, no preemption, and circular wait. Breaking any one condition prevents this form of deadlock.",
    ideal_concepts: ["processes wait indefinitely for resources", "mutual exclusion", "hold and wait", "no preemption", "circular wait"],
    marking_rubric: ["Defines a resource-wait cycle that prevents progress", "Identifies mutual exclusion", "Identifies hold and wait", "Identifies no preemption", "Identifies circular wait"],
    max_marks: 10,
  },
  {
    subject: "DBMS", difficulty: "Easy",
    question_text: "Explain the four ACID properties and why they matter for transactions.",
    reference_answer: "Atomicity makes a transaction all-or-nothing. Consistency preserves database constraints. Isolation prevents concurrent transactions from interfering beyond the chosen isolation level. Durability ensures committed changes survive failures. Together these properties make transaction outcomes dependable.",
    ideal_concepts: ["atomicity all or nothing", "consistency preserves constraints", "isolation controls concurrent transactions", "durability survives failures"],
    marking_rubric: ["Correctly explains atomicity", "Correctly explains consistency", "Correctly explains isolation", "Correctly explains durability"],
    max_marks: 10,
  },
  {
    subject: "DBMS", difficulty: "Medium",
    question_text: "What is a database index, and what trade-offs does it introduce?",
    reference_answer: "An index is an auxiliary data structure, commonly a B-tree or hash index, that helps locate rows without scanning the entire table. It can speed up selected reads and ordering operations, but consumes storage and adds work to inserts, updates, and deletes because the index must also be maintained.",
    ideal_concepts: ["auxiliary lookup structure", "avoids full table scan", "speeds selected reads", "uses storage and slows writes"],
    marking_rubric: ["Describes an index as a lookup structure", "Explains how it reduces search work", "States a read-performance benefit", "States storage and write-maintenance costs"],
    max_marks: 10,
  },
  {
    subject: "Computer Networks", difficulty: "Easy",
    question_text: "Compare TCP and UDP and give a reason to choose each.",
    reference_answer: "TCP establishes a connection and provides ordered, reliable byte-stream delivery using acknowledgements and retransmissions. UDP sends independent datagrams without guaranteeing delivery or order and has less protocol overhead. TCP suits reliable transfers; UDP can suit latency-sensitive traffic that handles loss itself.",
    ideal_concepts: ["TCP reliable ordered connection", "acknowledgements or retransmission", "UDP datagrams without delivery guarantee", "trade-off between reliability and latency"],
    marking_rubric: ["Describes TCP connection and reliable ordered delivery", "Mentions recovery or acknowledgements", "Describes UDP datagrams and lack of guarantee", "Connects the difference to appropriate use cases"],
    max_marks: 10,
  },
  {
    subject: "Computer Networks", difficulty: "Medium",
    question_text: "Describe the TCP three-way handshake and the purpose of each message.",
    reference_answer: "The client sends SYN with its initial sequence number. The server replies SYN-ACK, acknowledging that number and providing its own. The client sends ACK of the server's number. This synchronizes sequence state and confirms both directions can communicate before normal data transfer.",
    ideal_concepts: ["client SYN", "server SYN-ACK acknowledges and supplies sequence number", "client ACK", "sequence synchronization before data transfer"],
    marking_rubric: ["Describes the initial SYN", "Describes server SYN-ACK and acknowledgement", "Describes final client ACK", "Explains sequence synchronization or bidirectional readiness"],
    max_marks: 10,
  },
  {
    subject: "Object-Oriented Programming", difficulty: "Easy",
    question_text: "Explain encapsulation and how it helps protect an object's state.",
    reference_answer: "Encapsulation bundles state with the operations that manage it and restricts direct access to internal representation. A class can enforce invariants through a controlled public interface while keeping implementation details private. It is not merely placing fields and methods in one file.",
    ideal_concepts: ["bundles state and behavior", "restricts direct access", "controlled interface enforces invariants", "hides implementation details"],
    marking_rubric: ["Connects data with the operations that manage it", "Explains access restriction", "Explains invariant enforcement through methods", "Distinguishes encapsulation from only grouping code"],
    max_marks: 10,
  },
  {
    subject: "Object-Oriented Programming", difficulty: "Medium",
    question_text: "Differentiate method overloading from method overriding.",
    reference_answer: "Overloading uses the same method name with different parameter lists, usually resolved at compile time. Overriding replaces an inherited method implementation with a compatible implementation in a subclass and supports runtime dispatch. Return type alone generally does not distinguish overloads.",
    ideal_concepts: ["overloading changes parameter list", "overloading selected at compile time", "overriding replaces inherited implementation", "overriding uses runtime dispatch"],
    marking_rubric: ["Explains overload parameter/signature differences", "Identifies compile-time selection", "Explains subclass override of inherited behavior", "Identifies runtime dispatch"],
    max_marks: 10,
  },
  {
    subject: "Data Structures and Algorithms", difficulty: "Medium",
    question_text: "How does a hash table handle collisions, and what affects its performance?",
    reference_answer: "A collision occurs when distinct keys map to the same bucket. Common approaches include separate chaining and open addressing such as linear probing. Expected operations can be near constant time with a suitable hash function and controlled load factor, but clustering, poor hashes, or many collisions can degrade performance.",
    ideal_concepts: ["distinct keys can map to same bucket", "separate chaining", "open addressing", "hash quality and load factor affect performance"],
    marking_rubric: ["Defines a collision", "Describes separate chaining", "Describes an open-addressing approach", "Explains expected complexity and degradation factors"],
    max_marks: 10,
  },
  {
    subject: "Compiler Design", difficulty: "Medium",
    question_text: "What is the difference between lexical analysis and parsing in a compiler?",
    reference_answer: "Lexical analysis scans characters and groups them into tokens such as identifiers, keywords, and operators, typically discarding irrelevant whitespace and reporting lexical errors. Parsing consumes the token stream and checks whether it follows the language grammar, producing a syntax tree or reporting syntax errors.",
    ideal_concepts: ["lexer scans characters into tokens", "tokens represent language units", "parser checks token sequence against grammar", "parser builds syntax structure and detects syntax errors"],
    marking_rubric: ["Explains character-to-token conversion", "Gives or describes token categories", "Explains grammar-based parsing", "Mentions syntax tree or syntax error detection"],
    max_marks: 10,
  },
];

const CODING_QUESTIONS = [
  {
    title: "Reverse Words in a String", difficulty: "Easy", tags: ["arrays", "strings"],
    description: "Given a line of words separated by single spaces, print the words in reverse order. Preserve each word's spelling.",
    input_format: "One line containing space-separated words.",
    output_format: "The same words in reverse order, separated by one space.",
    constraints: ["1 <= number of words <= 10000", "Each word contains only non-space characters"],
    sample_input: "smart interview practice", sample_output: "practice interview smart",
    starter_code: { python3: "words = input().split()\nprint(' '.join(reversed(words)))" },
    test_cases: [
      { input: "smart interview practice", expected_output: "practice interview smart", hidden: false },
      { input: "one", expected_output: "one", hidden: false },
      { input: "red blue green yellow", expected_output: "yellow green blue red", hidden: true },
    ],
  },
  {
    title: "Binary Search", difficulty: "Easy", tags: ["arrays", "searching"],
    description: "Given a sorted array of distinct integers and a target, print the zero-based index of the target or -1 if it is absent.",
    input_format: "First line: sorted integers separated by spaces. Second line: target integer.",
    output_format: "One integer: the target index, or -1.",
    constraints: ["1 <= array length <= 200000", "Array values are distinct and sorted ascending"],
    sample_input: "1 4 7 9 13\n9", sample_output: "3",
    starter_code: { python3: "values = list(map(int, input().split()))\ntarget = int(input())\nleft, right = 0, len(values) - 1\nanswer = -1\nwhile left <= right:\n    middle = (left + right) // 2\n    if values[middle] == target:\n        answer = middle\n        break\n    if values[middle] < target:\n        left = middle + 1\n    else:\n        right = middle - 1\nprint(answer)" },
    test_cases: [
      { input: "1 4 7 9 13\n9", expected_output: "3", hidden: false },
      { input: "2 5 8\n1", expected_output: "-1", hidden: false },
      { input: "-10 -3 0 6 11\n-10", expected_output: "0", hidden: true },
    ],
  },
  {
    title: "Two Sum", difficulty: "Medium", tags: ["arrays", "hashing"],
    description: "Given an integer array and a target, print the indices of two distinct elements whose values sum to the target. Exactly one solution is guaranteed.",
    input_format: "First line: space-separated integers. Second line: target integer.",
    output_format: "The two zero-based indices in ascending order.",
    constraints: ["2 <= array length <= 200000", "Values and target fit in signed 32-bit integers"],
    sample_input: "2 7 11 15\n9", sample_output: "0 1",
    starter_code: { python3: "values = list(map(int, input().split()))\ntarget = int(input())\nseen = {}\nfor index, value in enumerate(values):\n    other = target - value\n    if other in seen:\n        print(seen[other], index)\n        break\n    seen[value] = index" },
    test_cases: [
      { input: "2 7 11 15\n9", expected_output: "0 1", hidden: false },
      { input: "3 2 4\n6", expected_output: "1 2", hidden: false },
      { input: "-5 8 1 6\n1", expected_output: "0 2", hidden: true },
    ],
  },
  {
    title: "Merge Sort", difficulty: "Medium", tags: ["arrays", "sorting", "recursion"],
    description: "Sort the given integers in nondecreasing order using merge sort and print the result.",
    input_format: "One line of space-separated integers.",
    output_format: "The integers sorted in nondecreasing order, separated by spaces.",
    constraints: ["0 <= array length <= 100000", "-10^9 <= each value <= 10^9"],
    sample_input: "8 3 5 1 9 2", sample_output: "1 2 3 5 8 9",
    starter_code: { python3: "def merge_sort(values):\n    if len(values) <= 1:\n        return values\n    middle = len(values) // 2\n    left = merge_sort(values[:middle])\n    right = merge_sort(values[middle:])\n    result = []\n    i = j = 0\n    while i < len(left) and j < len(right):\n        if left[i] <= right[j]:\n            result.append(left[i]); i += 1\n        else:\n            result.append(right[j]); j += 1\n    return result + left[i:] + right[j:]\n\nimport sys\nvalues = list(map(int, sys.stdin.read().split()))\nprint(' '.join(map(str, merge_sort(values))))" },
    test_cases: [
      { input: "8 3 5 1 9 2", expected_output: "1 2 3 5 8 9", hidden: false },
      { input: "4 4 -1 0", expected_output: "-1 0 4 4", hidden: false },
      { input: "7", expected_output: "7", hidden: true },
    ],
  },
  {
    title: "Greatest Common Divisor", difficulty: "Easy", tags: ["mathematics", "recursion"],
    description: "Given two non-negative integers, compute and print their greatest common divisor using the Euclidean algorithm.",
    input_format: "Two non-negative integers separated by whitespace.",
    output_format: "One integer: the greatest common divisor.",
    constraints: ["0 <= both integers <= 10^18", "At least one integer is positive"],
    sample_input: "48 18", sample_output: "6",
    starter_code: { python3: "import sys\nfrom functools import reduce\na, b = map(int, sys.stdin.read().split())\nwhile b:\n    a, b = b, a % b\nprint(a)" },
    test_cases: [
      { input: "48 18", expected_output: "6", hidden: false },
      { input: "17 13", expected_output: "1", hidden: false },
      { input: "0 25", expected_output: "25", hidden: true },
    ],
  },
];

const SUBJECT_DISTRIBUTION = {
  "Operating Systems": 2,
  DBMS: 2,
  "Computer Networks": 2,
  "Object-Oriented Programming": 2,
  "Data Structures and Algorithms": 1,
  "Compiler Design": 1,
};

const CATEGORY_DISTRIBUTION = { quantitative: 5, logical: 3, verbal: 2 };
const ROUND_CONFIG = [
  { round_type: "aptitude", question_count: 10, difficulty_counts: { easy: 4, medium: 4, hard: 2 }, time_limit_seconds: 1800 },
  { round_type: "theory", question_count: 10, difficulty_counts: { easy: 4, medium: 6, hard: 0 }, time_limit_seconds: 3600 },
  { round_type: "coding", question_count: 5, difficulty_counts: { easy: 3, medium: 2, hard: 0 }, time_limit_seconds: 5400 },
];

function questionKey(question) {
  return question.question_text || question.title;
}

async function ensureQuestions(Model, fixtures) {
  const result = [];
  for (const fixture of fixtures) {
    const existing = await Model.findOne({ [fixture.question_text ? "question_text" : "title"]: questionKey(fixture) });
    const question = existing || await Model.create(fixture);
    result.push(question);
  }
  return result;
}

async function selectDistributedQuestions(questions, field, distribution) {
  const selected = [];
  for (const [value, count] of Object.entries(distribution)) {
    const matches = questions.filter((question) => question[field] === value);
    if (matches.length < count) throw new Error(`Question bank has only ${matches.length} ${value} questions; ${count} are required.`);
    selected.push(...matches.slice(0, count));
  }
  return selected;
}

async function ensureAssignments(company, roundType, questions) {
  for (const question of questions) {
    await CompanyQuestionAssignment.updateOne(
      { company: company._id, round_type: roundType, question: question._id },
      { $setOnInsert: { company: company._id, round_type: roundType, question: question._id } },
      { upsert: true }
    );
  }
}

async function seedPracticeData() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is required; no fallback database is permitted.");
  const expectedDatabase = decodeURIComponent(new URL(uri).pathname.replace(/^\/+/, ""));
  if (!expectedDatabase) throw new Error("MONGO_URI must identify a database explicitly.");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const actualDatabase = mongoose.connection.db.databaseName;
  if (actualDatabase !== expectedDatabase) {
    throw new Error("Connected database name does not match the database selected in MONGO_URI.");
  }
  console.log(`Connected to configured database "${actualDatabase}".`);
  await CompanyQuestionAssignment.init();
  await MockDrive.init();

  const companyDocuments = [];
  for (const [name, description] of COMPANIES) {
    const company = await Company.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (company) {
      companyDocuments.push(company);
      console.log(`Company exists: ${company.name}`);
    } else {
      const created = await Company.create({ name, description });
      companyDocuments.push(created);
      console.log(`Company added: ${created.name}`);
    }
  }

  const aptitudeQuestions = await ensureQuestions(AptitudeQuestion, APTITUDE_QUESTIONS);
  const theoryQuestions = await ensureQuestions(TheoryQuestion, THEORY_QUESTIONS);
  const codingQuestions = await ensureQuestions(CodingQuestion, CODING_QUESTIONS);
  const selectedAptitude = await selectDistributedQuestions(aptitudeQuestions, "category", CATEGORY_DISTRIBUTION);
  const selectedTheory = await selectDistributedQuestions(theoryQuestions, "subject", SUBJECT_DISTRIBUTION);

  for (const company of companyDocuments) {
    await ensureAssignments(company, "aptitude", selectedAptitude);
    await ensureAssignments(company, "theory", selectedTheory);
    await ensureAssignments(company, "coding", codingQuestions);

    const existingPattern = await CompanyPattern.findOne({ company: company._id });
    const existingLegacyDrive = await MockDrive.exists({ company: company._id });
    if (!existingPattern && !existingLegacyDrive) {
      const questionIdsByType = await getCompanyQuestionIds(company._id);
      const validationError = validateRoundSequence(ROUND_CONFIG, { allowLegacy: false });
      if (validationError) throw new Error(validationError);
      const allocationErrors = await validateRoundAvailability(
        ROUND_CONFIG,
        QUESTION_BANKS,
        company.name,
        questionIdsByType
      );
      if (allocationErrors.length) throw new Error(allocationErrors.join("\n"));
      await CompanyPattern.create({
        company: company._id,
        round_sequence: ROUND_CONFIG,
      });
      console.log(`Saved validated single-drive configuration for ${company.name}.`);
    }
  }

  const counts = {
    companies: await Company.countDocuments({}),
    aptitude_questions: await AptitudeQuestion.countDocuments({}),
    theory_questions: await TheoryQuestion.countDocuments({}),
    coding_questions: await CodingQuestion.countDocuments({}),
    company_question_assignments: await CompanyQuestionAssignment.countDocuments({
      company: { $in: companyDocuments.map((company) => company._id) },
    }),
    drives_by_company: await Promise.all(companyDocuments.map(async (company) => ({
      company: company.name,
      assignments: {
        aptitude: await CompanyQuestionAssignment.countDocuments({ company: company._id, round_type: "aptitude" }),
        theory: await CompanyQuestionAssignment.countDocuments({ company: company._id, round_type: "theory" }),
        coding: await CompanyQuestionAssignment.countDocuments({ company: company._id, round_type: "coding" }),
      },
      published_drives: await MockDrive.countDocuments({ company: company._id, status: "published" }),
    }))),
    seeded_companies: await Company.find({ _id: { $in: companyDocuments.map((company) => company._id) } }, { name: 1 }).sort({ name: 1 }).lean(),
  };
  console.log(JSON.stringify(counts, null, 2));
  return counts;
}

if (require.main === module) {
  if (!process.argv.includes("--apply")) {
    console.error("No changes made. Rerun with --apply to add missing practice data.");
    process.exitCode = 2;
  } else {
    seedPracticeData()
      .catch((err) => {
        const safeMessage = String(err.message || "Unexpected error")
          .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "[redacted MongoDB URI]");
        console.error("Practice data seeding failed:", err.name, err.code || "", safeMessage);
        process.exitCode = 1;
      })
      .finally(async () => {
        await mongoose.disconnect();
      });
  }
}

module.exports = {
  seedPracticeData,
  COMPANIES,
  APTITUDE_QUESTIONS,
  THEORY_QUESTIONS,
  CODING_QUESTIONS,
  ROUND_CONFIG,
};
