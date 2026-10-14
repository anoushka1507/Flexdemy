import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Initialize Gemini AI Client
  const apiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // API endpoint: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', hasApiKey: !!apiKey });
  });

  // API endpoint: Generate quiz using Gemini
  app.post('/api/generate-quiz', async (req, res) => {
    try {
      const { topic, content, questionCount = 10, difficulty = 'Medium' } = req.body;

      if (!topic && !content) {
        return res.status(400).json({ error: 'Topic or material content is required' });
      }

      if (!ai) {
        // Fallback pre-generated quiz if API key is not configured
        console.log('Gemini API key not found, returning smart fallback quiz.');
        return res.json(getFallbackQuiz(topic || 'Study Material', difficulty, questionCount));
      }

      const prompt = `Create a high-quality educational quiz based on the following material/topic.
Topic/Title: ${topic || 'Study Material'}
Difficulty Level: ${difficulty}
Number of Questions: ${Math.min(questionCount, 10)}

Input Content/Notes:
${content || topic}

Generate a JSON object with:
1. "title": Quiz title string
2. "topic": Main subject area string
3. "difficulty": "${difficulty}"
4. "questions": Array of questions where each item has:
   - "id": number (1 to N)
   - "question": clear question text
   - "options": array of 4 string options (A, B, C, D)
   - "correctAnswerIndex": number (0 for A, 1 for B, 2 for C, 3 for D)
   - "hint": a helpful hint without giving away the exact answer directly
   - "explanation": a concise explanation of why the correct option is right`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              topic: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    question: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    correctAnswerIndex: { type: Type.INTEGER },
                    hint: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                  },
                  required: ['id', 'question', 'options', 'correctAnswerIndex', 'hint', 'explanation'],
                },
              },
            },
            required: ['title', 'topic', 'difficulty', 'questions'],
          },
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Empty response from Gemini model');
      }

      const quizData = JSON.parse(responseText);
      return res.json(quizData);
    } catch (error: any) {
  console.error('ERROR GENERATING QUIZ WITH GEMINI:', error);

  return res.status(500).json({
    error: 'Gemini quiz generation failed',
    details: error?.message || String(error),
  });
}
  });

  // Vite middleware for dev mode
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Flexdemy Server running on http://localhost:${PORT}`);
  });
}

function getFallbackQuiz(topic: string, difficulty: string, count: number) {
  const isPython = topic.toLowerCase().includes('python');
  const isDBMS = topic.toLowerCase().includes('dbms') || topic.toLowerCase().includes('database');
  const isNet = topic.toLowerCase().includes('net');

  if (isDBMS) {
    return {
      title: 'DBMS Fundamentals Quiz',
      topic: 'Database Management Systems',
      difficulty,
      questions: [
        {
          id: 1,
          question: 'What does ACID stand for in database transaction management?',
          options: [
            'Atomicity, Consistency, Isolation, Durability',
            'Accuracy, Control, Integration, Data',
            'Access, Concurrency, Indexing, Deletion',
            'Automated, Checked, Isolated, Distributed',
          ],
          correctAnswerIndex: 0,
          hint: 'Think of properties that guarantee valid transactions in database systems.',
          explanation: 'ACID guarantees Atomicity (all or nothing), Consistency, Isolation (independent execution), and Durability (permanence).',
        },
        {
          id: 2,
          question: 'Which SQL command is used to retrieve unique values from a table?',
          options: ['SELECT UNIQUE', 'SELECT DISTINCT', 'SELECT DIFFERENT', 'SELECT SEPARATE'],
          correctAnswerIndex: 1,
          hint: 'The keyword starts with D and removes duplicate rows from result sets.',
          explanation: 'SELECT DISTINCT is used in SQL queries to remove duplicate rows from the output.',
        },
        {
          id: 3,
          question: 'Which normal form eliminates partial dependencies in database tables?',
          options: ['1NF', '2NF', '3NF', 'BCNF'],
          correctAnswerIndex: 1,
          hint: 'It builds directly on First Normal Form by ensuring non-prime attributes depend on the full primary key.',
          explanation: '2NF requires 1NF compliance and that all non-key columns depend entirely on the composite primary key.',
        },
        {
          id: 4,
          question: 'What type of key uniquely identifies a record across tables?',
          options: ['Primary Key', 'Foreign Key', 'Candidate Key', 'Super Key'],
          correctAnswerIndex: 1,
          hint: 'It links child tables back to the primary key of a parent table.',
          explanation: 'A Foreign Key establishes relational references between tables.',
        },
        {
          id: 5,
          question: 'Which indexing structure is commonly used in relational databases for range queries?',
          options: ['Hash Index', 'B+ Tree Index', 'Binary Search Tree', 'Heap Index'],
          correctAnswerIndex: 1,
          hint: 'All keys are stored at leaf nodes connected in a sequential linked list.',
          explanation: 'B+ Trees provide efficient O(log N) lookup and contiguous sequential scanning for range queries.',
        },
      ],
    };
  }

  if (isNet) {
    return {
      title: 'Networking Basics Quiz',
      topic: 'Computer Networks',
      difficulty,
      questions: [
        {
          id: 1,
          question: 'Which layer of the OSI model handles end-to-end packet routing across networks?',
          options: ['Data Link Layer', 'Network Layer', 'Transport Layer', 'Application Layer'],
          correctAnswerIndex: 1,
          hint: 'IP addresses operate at this third layer of the OSI stack.',
          explanation: 'The Network Layer (Layer 3) handles IP addressing, packet forwarding, and routing protocols.',
        },
        {
          id: 2,
          question: 'What is the default port used for secure HTTP communications (HTTPS)?',
          options: ['80', '21', '443', '8080'],
          correctAnswerIndex: 2,
          hint: 'HTTP is 80, while the TLS/SSL encrypted counterpart uses three digits ending in 3.',
          explanation: 'HTTPS operates over TCP port 443 by default.',
        },
        {
          id: 3,
          question: 'Which protocol translates domain names like example.com to IP addresses?',
          options: ['DHCP', 'DNS', 'ARP', 'ICMP'],
          correctAnswerIndex: 1,
          hint: 'It acts as the phonebook of the Internet.',
          explanation: 'Domain Name System (DNS) maps human-readable domain names to numerical IP addresses.',
        },
        {
          id: 4,
          question: 'Which TCP flag is sent to initiate a 3-way handshake connection?',
          options: ['ACK', 'FIN', 'SYN', 'RST'],
          correctAnswerIndex: 2,
          hint: 'Short for Synchronize.',
          explanation: 'The client sends a SYN packet to request a new connection; server responds with SYN-ACK.',
        },
        {
          id: 5,
          question: 'What is the subnet mask for a standard /24 CIDR block?',
          options: ['255.255.0.0', '255.255.255.0', '255.255.255.128', '255.0.0.0'],
          correctAnswerIndex: 1,
          hint: 'It reserves 24 bits (3 bytes) for the network prefix.',
          explanation: '/24 equals 24 ones in binary, representing 255.255.255.0 with 256 host IP addresses.',
        },
      ],
    };
  }

  // Default Python Basics Quiz (matches screenshot #3)
  return {
    title: 'Python Basics Quiz',
    topic: 'Python Programming',
    difficulty,
    questions: [
      {
        id: 1,
        question: 'What is a variable in Python?',
        options: [
          'A container for storing data values.',
          'A fixed command that cannot change.',
          'A type of loop for repeating statements.',
          'A system file stored on the hard drive.',
        ],
        correctAnswerIndex: 0,
        hint: 'Variables hold values that can be referenced and manipulated in Python code.',
        explanation: 'In Python, a variable is created the moment you assign a value to it, serving as a named reference container.',
      },
      {
        id: 2,
        question: 'Which symbol is used for inline comments in Python code?',
        options: ['//', '/*', '#', '<!--'],
        correctAnswerIndex: 2,
        hint: 'It is also known as the hash or pound symbol.',
        explanation: 'In Python, single-line comments start with the # character.',
      },
      {
        id: 3,
        question: 'Which of the following is used to define a function in Python?',
        options: ['def', 'func', 'define', 'function'],
        correctAnswerIndex: 0,
        hint: 'Functions are defined using a keyword that tells Python you are creating a block of reusable code.',
        explanation: 'The `def` keyword defines a function header in Python syntax (e.g. `def my_func():`).',
      },
      {
        id: 4,
        question: 'Which of the following is an immutable data type in Python?',
        options: ['List', 'Tuple', 'Dictionary', 'Set'],
        correctAnswerIndex: 1,
        hint: 'Once instantiated, elements inside this sequence type cannot be modified or replaced.',
        explanation: 'Tuples are immutable sequence objects in Python, unlike Lists or Dictionaries which are mutable.',
      },
      {
        id: 5,
        question: 'What is the correct syntax to output "Hello World" in Python 3?',
        options: ['echo("Hello World")', 'print("Hello World")', 'console.log("Hello World")', 'System.out.println("Hello World")'],
        correctAnswerIndex: 1,
        hint: 'Python uses a built-in function named print().',
        explanation: 'Python 3 requires parentheses around parameters in `print("Hello World")`.',
      },
      {
        id: 6,
        question: 'How do you create a list in Python?',
        options: ['my_list = (1, 2, 3)', 'my_list = [1, 2, 3]', 'my_list = {1, 2, 3}', 'my_list = <1, 2, 3>'],
        correctAnswerIndex: 1,
        hint: 'Lists use square brackets.',
        explanation: 'Square brackets `[]` create a list, parentheses `()` create a tuple, and curly braces `{}` create a set or dict.',
      },
      {
        id: 7,
        question: "What is the output of 'def foo(): pass' when called as 'print(foo())'?",
        options: ['An error is thrown.', 'None', '0', 'False'],
        correctAnswerIndex: 1,
        hint: 'Python functions without an explicit return statement return a special singleton object.',
        explanation: 'Functions in Python implicitly return `None` if execution reaches the end without a `return` statement.',
      },
      {
        id: 8,
        question: 'Which operator is used for exponentiation (power) in Python?',
        options: ['^', '**', '^^', 'pow() only'],
        correctAnswerIndex: 1,
        hint: 'It consists of two consecutive asterisk symbols.',
        explanation: 'In Python, `2 ** 3` evaluates to `8`.',
      },
      {
        id: 9,
        question: 'How do you start a WHILE loop in Python?',
        options: ['while x > y:', 'while (x > y)', 'while x > y do:', 'loop while x > y:'],
        correctAnswerIndex: 0,
        hint: 'Python control flow statements end with a colon.',
        explanation: 'A `while` statement in Python is written as `while condition:` with an indented block.',
      },
      {
        id: 10,
        question: 'What method can be used to convert a string to uppercase in Python?',
        options: ['upper()', 'toUpperCase()', 'uppercase()', 'to_upper()'],
        correctAnswerIndex: 0,
        hint: 'It is a string method with a short 5-letter name.',
        explanation: 'String objects in Python have a `.upper()` method that returns an uppercase copy.',
      },
    ],
  };
}

startServer();
