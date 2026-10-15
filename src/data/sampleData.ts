import { Quiz, UserProfile } from '../types';

export const INITIAL_USER_PROFILE: UserProfile = {
  name: 'Asdaqa Arif',
  role: 'Student',
  email: 'alex.johnson@university.edu',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
  totalQuizzesAttempted: 0,
  averageScore: 0,
  bestScore: 0,
  accuracy: 0,
  streakDays: 0,
  overallProgress: 0,
};

export const SAMPLE_QUIZZES: Quiz[] = [
  {
    id: 'python-basics',
    title: 'Python Basics Quiz',
    topic: 'Python Programming',
    difficulty: 'Medium',
    totalQuestions: 10,
    timeLimitMinutes: 15,
    questions: [
      {
        id: 1,
        question: 'What is a variable in Python?',
        options: [
          'A container for storing data values.',
          'A fixed command that cannot change.',
          'A type of loop for repeating statements.',
          'A system file stored on the hard drive.'
        ],
        correctAnswerIndex: 0,
        hint: 'Variables hold values that can be referenced and manipulated in Python code.',
        explanation: 'In Python, a variable is created the moment you assign a value to it, serving as a named reference container.'
      },
      {
        id: 2,
        question: 'Which symbol is used for inline comments in Python code?',
        options: ['//', '/*', '#', '<!--'],
        correctAnswerIndex: 2,
        hint: 'It is also known as the hash or pound symbol.',
        explanation: 'In Python, single-line comments start with the # character.'
      },
      {
        id: 3,
        question: 'Which of the following is used to define a function in Python?',
        options: ['def', 'func', 'define', 'function'],
        correctAnswerIndex: 0,
        hint: 'Functions are defined using a keyword that tells Python you are creating a block of reusable code.',
        explanation: 'The `def` keyword defines a function header in Python syntax (e.g. `def my_func():`).'
      },
      {
        id: 4,
        question: 'Which of the following is an immutable data type in Python?',
        options: ['List', 'Tuple', 'Dictionary', 'Set'],
        correctAnswerIndex: 1,
        hint: 'Once instantiated, elements inside this sequence type cannot be modified or replaced.',
        explanation: 'Tuples are immutable sequence objects in Python, unlike Lists or Dictionaries which are mutable.'
      },
      {
        id: 5,
        question: 'What is the correct syntax to output "Hello World" in Python 3?',
        options: ['echo("Hello World")', 'print("Hello World")', 'console.log("Hello World")', 'System.out.println("Hello World")'],
        correctAnswerIndex: 1,
        hint: 'Python uses a built-in function named print().',
        explanation: 'Python 3 requires parentheses around parameters in `print("Hello World")`.'
      },
      {
        id: 6,
        question: 'How do you create a list in Python?',
        options: ['my_list = (1, 2, 3)', 'my_list = [1, 2, 3]', 'my_list = {1, 2, 3}', 'my_list = <1, 2, 3>'],
        correctAnswerIndex: 1,
        hint: 'Lists use square brackets.',
        explanation: 'Square brackets `[]` create a list, parentheses `()` create a tuple, and curly braces `{}` create a set or dict.'
      },
      {
        id: 7,
        question: "What is the output of 'def foo(): pass' when called as 'print(foo())'?",
        options: ['An error is thrown.', 'None', '0', 'False'],
        correctAnswerIndex: 1,
        hint: 'Python functions without an explicit return statement return a special singleton object.',
        explanation: 'Functions in Python implicitly return `None` if execution reaches the end without a `return` statement.'
      },
      {
        id: 8,
        question: 'Which operator is used for exponentiation (power) in Python?',
        options: ['^', '**', '^^', 'pow() only'],
        correctAnswerIndex: 1,
        hint: 'It consists of two consecutive asterisk symbols.',
        explanation: 'In Python, `2 ** 3` evaluates to `8`.'
      },
      {
        id: 9,
        question: 'How do you start a WHILE loop in Python?',
        options: ['while x > y:', 'while (x > y)', 'while x > y do:', 'loop while x > y:'],
        correctAnswerIndex: 0,
        hint: 'Python control flow statements end with a colon.',
        explanation: 'A `while` statement in Python is written as `while condition:` with an indented block.'
      },
      {
        id: 10,
        question: 'What method can be used to convert a string to uppercase in Python?',
        options: ['upper()', 'toUpperCase()', 'uppercase()', 'to_upper()'],
        correctAnswerIndex: 0,
        hint: 'It is a string method with a short 5-letter name.',
        explanation: 'String objects in Python have a `.upper()` method that returns an uppercase copy.'
      }
    ]
  },
  {
    id: 'dbms-quiz',
    title: 'DBMS Fundamentals Quiz',
    topic: 'Database Management',
    difficulty: 'Hard',
    totalQuestions: 5,
    timeLimitMinutes: 10,
    questions: [
      {
        id: 1,
        question: 'What does ACID stand for in database transaction management?',
        options: [
          'Atomicity, Consistency, Isolation, Durability',
          'Accuracy, Control, Integration, Data',
          'Access, Concurrency, Indexing, Deletion',
          'Automated, Checked, Isolated, Distributed'
        ],
        correctAnswerIndex: 0,
        hint: 'Guarantees valid transactions in database systems.',
        explanation: 'ACID guarantees Atomicity, Consistency, Isolation, and Durability.'
      },
      {
        id: 2,
        question: 'Which SQL command removes duplicate rows from query results?',
        options: ['SELECT UNIQUE', 'SELECT DISTINCT', 'SELECT DIFFERENT', 'SELECT SEPARATE'],
        correctAnswerIndex: 1,
        hint: 'Starts with D.',
        explanation: 'SELECT DISTINCT filters out duplicate result tuples.'
      },
      {
        id: 3,
        question: 'Which normal form eliminates partial key dependencies?',
        options: ['1NF', '2NF', '3NF', 'BCNF'],
        correctAnswerIndex: 1,
        hint: 'Builds on First Normal Form.',
        explanation: '2NF requires non-prime attributes to be fully functionally dependent on the primary key.'
      },
      {
        id: 4,
        question: 'What establishes relational links between child and parent tables?',
        options: ['Primary Key', 'Foreign Key', 'Candidate Key', 'Super Key'],
        correctAnswerIndex: 1,
        hint: 'References another table.',
        explanation: 'A Foreign Key references the primary key of another table.'
      },
      {
        id: 5,
        question: 'Which indexing structure is optimal for sequential range queries in relational DBs?',
        options: ['Hash Index', 'B+ Tree Index', 'Binary Search Tree', 'Heap Index'],
        correctAnswerIndex: 1,
        hint: 'All keys reside at linked leaf nodes.',
        explanation: 'B+ Trees provide efficient O(log N) lookup and sequential leaf node range scans.'
      }
    ]
  },
  {
    id: 'networking-basics',
    title: 'Computer Networks Quiz',
    topic: 'Networking',
    difficulty: 'Medium',
    totalQuestions: 5,
    timeLimitMinutes: 8,
    questions: [
      {
        id: 1,
        question: 'Which OSI layer handles end-to-end packet routing across networks?',
        options: ['Data Link Layer', 'Network Layer', 'Transport Layer', 'Application Layer'],
        correctAnswerIndex: 1,
        hint: 'Layer 3 of the OSI stack.',
        explanation: 'The Network Layer handles IP addressing and packet routing.'
      },
      {
        id: 2,
        question: 'What is the default port used for HTTPS communications?',
        options: ['80', '21', '443', '8080'],
        correctAnswerIndex: 2,
        hint: 'Standard encrypted web port.',
        explanation: 'HTTPS operates over TCP port 443.'
      },
      {
        id: 3,
        question: 'Which protocol translates hostnames to IP addresses?',
        options: ['DHCP', 'DNS', 'ARP', 'ICMP'],
        correctAnswerIndex: 1,
        hint: 'The phonebook of the Internet.',
        explanation: 'DNS resolves domain names to IP addresses.'
      },
      {
        id: 4,
        question: 'Which TCP flag initiates a connection request?',
        options: ['ACK', 'FIN', 'SYN', 'RST'],
        correctAnswerIndex: 2,
        hint: 'First packet in 3-way handshake.',
        explanation: 'SYN is sent to synchronize sequence numbers.'
      },
      {
        id: 5,
        question: 'What is the subnet mask for a /24 CIDR prefix?',
        options: ['255.255.0.0', '255.255.255.0', '255.255.255.128', '255.0.0.0'],
        correctAnswerIndex: 1,
        hint: 'Reserves 24 bits for network id.',
        explanation: '/24 represents 255.255.255.0 with 256 addresses.'
      }
    ]
  }
];

export const RECENT_QUIZZES_HISTORY = [
  { id: '1', title: 'DBMS Quiz', topic: 'Databases', score: 90, date: 'Yesterday', icon: 'database', difficulty: 'Hard' },
  { id: '2', title: 'Networking Basics', topic: 'Networks', score: 75, date: '2 days ago', icon: 'hub', difficulty: 'Medium' },
  { id: '3', title: 'Python Basics', topic: 'Python', score: 85, date: '3 days ago', icon: 'code', difficulty: 'Medium' },
  { id: '4', title: 'C++ Fundamentals', topic: 'Programming', score: 60, date: '5 days ago', icon: 'terminal', difficulty: 'Hard' }
];

export const TOPIC_STRENGTHS = [
  { name: 'Python Basics', score: 90, status: 'Strong' },
  { name: 'Data Types', score: 80, status: 'Strong' },
  { name: 'Operators', score: 70, status: 'Moderate' },
  { name: 'Control Flow', score: 60, status: 'Needs Practice' },
  { name: 'Functions', score: 40, status: 'Needs Practice' }
];
