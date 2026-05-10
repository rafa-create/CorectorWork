const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const Database = require("better-sqlite3");
const { createWorker } = require("tesseract.js");
const NSpell = require("nspell");
require("dotenv").config();

const PORT = Number(process.env.PORT || 4000);
const DB_PATH = path.join(__dirname, "data", "corector.db");
const UPLOADS_DIR = path.join(__dirname, "uploads");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    class_name TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    title TEXT,
    image_path TEXT NOT NULL,
    text_raw TEXT NOT NULL,
    text_corrected TEXT NOT NULL,
    mistakes_count INTEGER NOT NULL,
    score_orthography REAL NOT NULL,
    criteria_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id)
  );
`);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

function nowIso() {
  return new Date().toISOString();
}

async function loadFrenchSpell() {
  const dictionaryModule = await import("dictionary-fr");
  return new NSpell(dictionaryModule.default);
}

function fixCase(sourceWord, candidate) {
  if (!candidate) return sourceWord;
  if (sourceWord === sourceWord.toUpperCase()) {
    return candidate.toUpperCase();
  }
  if (sourceWord[0] && sourceWord[0] === sourceWord[0].toUpperCase()) {
    return candidate[0].toUpperCase() + candidate.slice(1);
  }
  return candidate;
}

async function runOcr(imagePath) {
  const worker = await createWorker("fra");
  try {
    const result = await worker.recognize(imagePath);
    return (result.data.text || "").trim();
  } finally {
    await worker.terminate();
  }
}

function correctOrthography(rawText, spell) {
  let mistakes = 0;
  const suggestions = [];

  const correctedText = rawText.replace(/\b[\p{L}’-]+\b/gu, (word) => {
    const lower = word.toLowerCase();
    if (spell.correct(lower)) {
      return word;
    }

    const proposed = spell.suggest(lower)[0];
    if (!proposed) {
      return word;
    }

    mistakes += 1;
    const correctedWord = fixCase(word, proposed);
    suggestions.push({ original: word, corrected: correctedWord });
    return correctedWord;
  });

  const orthographyScore = Math.max(0, Math.min(20, Number((20 - mistakes * 0.5).toFixed(2))));

  return {
    correctedText,
    mistakes,
    orthographyScore,
    suggestions,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/students", (_req, res) => {
  const students = db
    .prepare(
      `SELECT s.*,
        (
          SELECT ROUND(AVG(score_orthography), 2)
          FROM submissions sub
          WHERE sub.student_id = s.id
        ) AS average_orthography
      FROM students s
      ORDER BY s.name ASC`
    )
    .all();
  res.json(students);
});

app.post("/api/students", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const className = String(req.body?.className || "").trim();

  if (!name) {
    res.status(400).json({ error: "Le nom de l'élève est obligatoire." });
    return;
  }

  const insert = db
    .prepare("INSERT INTO students (name, class_name, created_at) VALUES (?, ?, ?)")
    .run(name, className || null, nowIso());

  const created = db.prepare("SELECT * FROM students WHERE id = ?").get(insert.lastInsertRowid);
  res.status(201).json(created);
});

app.get("/api/students/:id/submissions", (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    res.status(400).json({ error: "Identifiant d'élève invalide." });
    return;
  }

  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
  if (!student) {
    res.status(404).json({ error: "Élève introuvable." });
    return;
  }

  const submissions = db
    .prepare("SELECT * FROM submissions WHERE student_id = ? ORDER BY datetime(created_at) DESC")
    .all(studentId)
    .map((item) => ({
      ...item,
      criteria: JSON.parse(item.criteria_json),
    }));

  res.json({ student, submissions });
});

app.get("/api/submissions/:id", (req, res) => {
  const submissionId = Number(req.params.id);
  if (!Number.isInteger(submissionId)) {
    res.status(400).json({ error: "Identifiant de copie invalide." });
    return;
  }

  const submission = db.prepare("SELECT * FROM submissions WHERE id = ?").get(submissionId);
  if (!submission) {
    res.status(404).json({ error: "Copie introuvable." });
    return;
  }

  res.json({
    ...submission,
    criteria: JSON.parse(submission.criteria_json),
  });
});

app.post("/api/submissions", upload.single("image"), async (req, res) => {
  const studentId = Number(req.body?.studentId);
  const title = String(req.body?.title || "").trim();
  const image = req.file;

  if (!Number.isInteger(studentId)) {
    res.status(400).json({ error: "studentId est obligatoire." });
    return;
  }

  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
  if (!student) {
    res.status(404).json({ error: "Élève introuvable." });
    return;
  }

  if (!image) {
    res.status(400).json({ error: "Image de copie obligatoire." });
    return;
  }

  const imagePath = image.path;
  try {
    const rawText = await runOcr(imagePath);
    const spell = await app.locals.spellPromise;
    const orthography = correctOrthography(rawText, spell);

    const criteria = {
      orthographe: {
        score: orthography.orthographyScore,
        mistakes: orthography.mistakes,
      },
    };

    const createdAt = nowIso();
    const insert = db
      .prepare(
        `INSERT INTO submissions
          (student_id, title, image_path, text_raw, text_corrected, mistakes_count, score_orthography, criteria_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        studentId,
        title || "Copie sans titre",
        image.filename,
        rawText,
        orthography.correctedText,
        orthography.mistakes,
        orthography.orthographyScore,
        JSON.stringify(criteria),
        createdAt
      );

    const created = db.prepare("SELECT * FROM submissions WHERE id = ?").get(insert.lastInsertRowid);
    res.status(201).json({
      ...created,
      criteria,
      spelling_suggestions: orthography.suggestions,
      image_url: `/uploads/${created.image_path}`,
    });
  } catch (error) {
    res.status(500).json({
      error: "Impossible de traiter la copie.",
      details: String(error?.message || error),
    });
  }
});

async function start() {
  app.locals.spellPromise = loadFrenchSpell();
  await app.locals.spellPromise;

  app.listen(PORT, () => {
    console.log(`API Corector démarrée sur http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Échec au démarrage:", error);
  process.exit(1);
});
