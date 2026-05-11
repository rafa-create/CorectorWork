const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { createWorker } = require("tesseract.js");
const NSpell = require("nspell");

const PORT = Number(process.env.PORT || 4000);
const UPLOADS_DIR = path.join(__dirname, "uploads");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const DATA_PATH = path.join(__dirname, "data", "store.json");
fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });

function loadStore() {
  if (!fs.existsSync(DATA_PATH)) {
    return {
      nextStudentId: 1,
      nextSubmissionId: 1,
      students: [],
      submissions: [],
    };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    return {
      nextStudentId: 1,
      nextSubmissionId: 1,
      students: [],
      submissions: [],
    };
  }
}

function saveStore(store) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), "utf8");
}

const store = loadStore();

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
  const dictionaryDir = path.dirname(require.resolve("dictionary-fr"));
  const aff = fs.readFileSync(path.join(dictionaryDir, "index.aff"));
  const dic = fs.readFileSync(path.join(dictionaryDir, "index.dic"));
  return new NSpell({ aff, dic });
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

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout spell init after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function getSpellChecker(appRef) {
  if (appRef.locals.spellInstance) {
    return appRef.locals.spellInstance;
  }
  if (!appRef.locals.spellPromise) {
    appRef.locals.spellPromise = withTimeout(loadFrenchSpell(), 15000)
      .then((spell) => {
        appRef.locals.spellInstance = spell;
        return spell;
      })
      .catch((error) => {
        appRef.locals.spellPromise = null;
        throw error;
      });
  }
  return appRef.locals.spellPromise;
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
  const students = store.students
    .map((student) => {
      const studentSubs = store.submissions.filter((submission) => submission.student_id === student.id);
      const average =
        studentSubs.length > 0
          ? Number(
              (
                studentSubs.reduce((sum, item) => sum + Number(item.score_orthography || 0), 0) /
                studentSubs.length
              ).toFixed(2)
            )
          : null;
      return {
        ...student,
        average_orthography: average,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  res.json(students);
});

app.post("/api/students", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const className = String(req.body?.className || "").trim();

  if (!name) {
    res.status(400).json({ error: "Le nom de l'élève est obligatoire." });
    return;
  }

  const created = {
    id: store.nextStudentId++,
    name,
    class_name: className || null,
    created_at: nowIso(),
  };
  store.students.push(created);
  saveStore(store);
  res.status(201).json(created);
});

app.get("/api/students/:id/submissions", (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    res.status(400).json({ error: "Identifiant d'élève invalide." });
    return;
  }

  const student = store.students.find((item) => item.id === studentId);
  if (!student) {
    res.status(404).json({ error: "Élève introuvable." });
    return;
  }

  const submissions = store.submissions
    .filter((item) => item.student_id === studentId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((item) => ({
      ...item,
      criteria: item.criteria,
    }));

  res.json({ student, submissions });
});

app.get("/api/submissions/:id", (req, res) => {
  const submissionId = Number(req.params.id);
  if (!Number.isInteger(submissionId)) {
    res.status(400).json({ error: "Identifiant de copie invalide." });
    return;
  }

  const submission = store.submissions.find((item) => item.id === submissionId);
  if (!submission) {
    res.status(404).json({ error: "Copie introuvable." });
    return;
  }

  res.json({
    ...submission,
    criteria: submission.criteria,
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

  const student = store.students.find((item) => item.id === studentId);
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
    let spell = null;
    try {
      spell = await getSpellChecker(app);
    } catch (error) {
      console.warn("Dictionnaire indisponible:", String(error?.message || error));
    }
    const orthography = spell
      ? correctOrthography(rawText, spell)
      : {
          correctedText: rawText,
          mistakes: 0,
          orthographyScore: 20,
          suggestions: [],
        };

    const criteria = {
      orthographe: {
        score: orthography.orthographyScore,
        mistakes: orthography.mistakes,
      },
    };

    const created = {
      id: store.nextSubmissionId++,
      student_id: studentId,
      title: title || "Copie sans titre",
      image_path: image.filename,
      text_raw: rawText,
      text_corrected: orthography.correctedText,
      mistakes_count: orthography.mistakes,
      score_orthography: orthography.orthographyScore,
      criteria,
      created_at: nowIso(),
    };

    store.submissions.push(created);
    saveStore(store);
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
  app.locals.spellPromise = null;
  app.locals.spellInstance = null;

  app.listen(PORT, () => {
    console.log(`API Corector démarrée sur http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Échec au démarrage:", error);
  process.exit(1);
});
