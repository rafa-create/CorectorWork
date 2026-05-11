import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function scoreClass(score) {
  if (score >= 15) return "good";
  if (score >= 10) return "medium";
  return "low";
}

function generateDefaultCopyTitle() {
  const now = new Date();
  const date = now.toLocaleDateString("fr-FR");
  const time = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Copie ${date} ${time}`;
}

function getSubmissionImageUrl(submission) {
  if (!submission?.image_path) return "";
  return `/uploads/${submission.image_path}`;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedPre(text, words, highlightClassName) {
  const safeText = text || "";
  const targets = [...new Set((words || []).filter(Boolean))];
  if (!targets.length) {
    return <pre>{safeText || "Aucun texte reconnu."}</pre>;
  }

  const pattern = targets.map((word) => escapeRegExp(word)).join("|");
  if (!pattern) {
    return <pre>{safeText || "Aucun texte reconnu."}</pre>;
  }
  const regex = new RegExp(`\\b(${pattern})\\b`, "giu");
  const lines = safeText.split("\n");

  return (
    <pre>
      {lines.map((line, lineIndex) => {
        const parts = [];
        let lastIndex = 0;
        regex.lastIndex = 0;
        let match = regex.exec(line);
        while (match) {
          const matchedText = match[0];
          const index = match.index ?? 0;
          if (index > lastIndex) {
            parts.push(line.slice(lastIndex, index));
          }
          parts.push(
            <span className={highlightClassName} key={`${lineIndex}-${index}-${matchedText}`}>
              {matchedText}
            </span>
          );
          lastIndex = index + matchedText.length;
          match = regex.exec(line);
        }
        if (lastIndex < line.length) {
          parts.push(line.slice(lastIndex));
        }
        return (
          <span key={`line-${lineIndex}`}>
            {parts}
            {lineIndex < lines.length - 1 ? "\n" : null}
          </span>
        );
      })}
    </pre>
  );
}

function getFirstStudentIdForClass(students, classFilter) {
  const visibleStudents =
    classFilter === "__ALL__"
      ? students
      : students.filter((student) => (student.class_name || "Sans classe") === classFilter);
  return visibleStudents[0]?.id ?? null;
}

function App() {
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState(() => generateDefaultCopyTitle());
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadFeedback, setUploadFeedback] = useState("");
  const [uploadStartedAt, setUploadStartedAt] = useState(null);
  const [processingStartedAt, setProcessingStartedAt] = useState(null);
  const [uploadElapsedSec, setUploadElapsedSec] = useState(0);
  const [processingElapsedSec, setProcessingElapsedSec] = useState(0);

  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentClass, setNewStudentClass] = useState("");
  const [showNewStudentForm, setShowNewStudentForm] = useState(false);
  const [selectedClass, setSelectedClass] = useState("__ALL__");
  const [showRawText, setShowRawText] = useState(false);
  const [showCorrectedText, setShowCorrectedText] = useState(false);
  const [showCopyImage, setShowCopyImage] = useState(false);
  const [showNoteDetails, setShowNoteDetails] = useState(false);
  const [showEvolutionSection, setShowEvolutionSection] = useState(false);
  const [evolutionView, setEvolutionView] = useState("graph");

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const classOptions = useMemo(() => {
    const values = students
      .map((student) => student.class_name || "Sans classe")
      .filter((value, index, array) => array.indexOf(value) === index);
    return values.sort((a, b) => a.localeCompare(b, "fr"));
  }, [students]);

  const filteredStudents = useMemo(() => {
    if (selectedClass === "__ALL__") return students;
    return students.filter((student) => (student.class_name || "Sans classe") === selectedClass);
  }, [students, selectedClass]);

  useEffect(() => {
    if (!uploading) return;

    const tick = () => {
      const now = Date.now();
      if (uploadStartedAt) {
        setUploadElapsedSec(Math.max(0, Math.floor((now - uploadStartedAt) / 1000)));
      }
      if (processingStartedAt) {
        setProcessingElapsedSec(Math.max(0, Math.floor((now - processingStartedAt) / 1000)));
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [uploading, uploadStartedAt, processingStartedAt]);

  async function loadStudents() {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${API_BASE}/students`);
      setStudents(data);
      setSelectedStudentId((current) => {
        if (current && data.some((student) => student.id === current)) return current;
        return getFirstStudentIdForClass(data, selectedClass);
      });
    } catch {
      setError("Impossible de charger les élèves.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await axios.get(`${API_BASE}/students`);
        if (!active) return;
        setStudents(data);
        setSelectedStudentId((current) => {
          if (current && data.some((student) => student.id === current)) return current;
          return data[0]?.id ?? null;
        });
      } catch {
        if (active) {
          setError("Impossible de charger les élèves.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedStudentId) return;

    let active = true;
    (async () => {
      setDetailsLoading(true);
      setError("");
      try {
        const { data } = await axios.get(`${API_BASE}/students/${selectedStudentId}/submissions`);
        if (!active) return;
        setSubmissions(data.submissions);
        setSelectedSubmission(data.submissions[0] || null);
        setShowRawText(false);
        setShowCorrectedText(false);
        setShowCopyImage(false);
        setShowNoteDetails(false);
      } catch {
        if (active) {
          setError("Impossible de charger les copies de cet élève.");
          setSubmissions([]);
          setSelectedSubmission(null);
        }
      } finally {
        if (active) {
          setDetailsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedStudentId]);

  async function handleCreateStudent(event) {
    event.preventDefault();
    const name = newStudentName.trim();
    if (!name) return;

    setError("");
    try {
      await axios.post(`${API_BASE}/students`, {
        name,
        className: newStudentClass.trim(),
      });
      setNewStudentName("");
      setNewStudentClass("");
      setShowNewStudentForm(false);
      await loadStudents();
    } catch {
      setError("Impossible de créer l'élève.");
    }
  }

  async function handleDeleteSelectedStudent() {
    if (!selectedStudent) return;
    const shouldDelete = window.confirm(
      `Supprimer l'élève ${selectedStudent.name} et toutes ses copies ? Cette action est définitive.`
    );
    if (!shouldDelete) return;

    setError("");
    try {
      await axios.delete(`${API_BASE}/students/${selectedStudent.id}`);
      setSelectedSubmission(null);
      setSubmissions([]);
      setShowEvolutionSection(false);
      await loadStudents();
    } catch {
      setError("Impossible de supprimer l'élève.");
    }
  }

  async function handleUploadSubmission(event) {
    event.preventDefault();
    if (!selectedStudentId) {
      setError("Sélectionner un élève avant d'ajouter une copie.");
      return;
    }
    if (!uploadFile) {
      setError("Choisir une image de copie.");
      return;
    }

    setError("");
    setUploadFeedback("");
    setUploadProgress(0);
    setUploadStartedAt(Date.now());
    setProcessingStartedAt(null);
    setUploadElapsedSec(0);
    setProcessingElapsedSec(0);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("studentId", String(selectedStudentId));
      formData.append("title", uploadTitle.trim() || generateDefaultCopyTitle());
      formData.append("image", uploadFile);

      const { data } = await axios.post(`${API_BASE}/submissions`, formData, {
        onUploadProgress: (eventInfo) => {
          if (!eventInfo?.total) return;
          const percent = Math.min(100, Math.round((eventInfo.loaded / eventInfo.total) * 100));
          setUploadProgress(percent);
          if (percent >= 100) {
            setProcessingStartedAt((current) => current ?? Date.now());
          }
        },
      });

      setUploadFeedback(
        `Copie traitée. Note orthographe ${data.score_orthography ?? "-"} /20, fautes ${
          data.mistakes_count ?? "-"
        }.`
      );
      setUploadFile(null);
      setUploadTitle(generateDefaultCopyTitle());
      await loadStudents();
      const submissionsData = await axios.get(`${API_BASE}/students/${selectedStudentId}/submissions`);
      setSubmissions(submissionsData.data.submissions);
      setSelectedSubmission(submissionsData.data.submissions[0] || null);
    } catch (uploadError) {
      if (uploadError?.response?.status === 413) {
        setError("Image trop volumineuse. Réduire la taille ou la qualité de la photo.");
      } else if (uploadError?.response?.status === 429) {
        setError("Traitement déjà en cours sur le serveur. Réessaie dans quelques instants.");
      } else if (uploadError?.response?.status === 400) {
        setError(uploadError?.response?.data?.error || "Copie invalide.");
      } else {
        setError("Impossible d'envoyer la copie.");
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setUploadStartedAt(null);
      setProcessingStartedAt(null);
    }
  }

  const evolution = submissions
    .slice()
    .reverse()
    .map((submission, index) => ({
      id: submission.id,
      label: `Copie ${index + 1}`,
      score: Number(submission.score_orthography || 0),
    }));

  const graphWidth = 640;
  const graphHeight = 280;
  const margin = { top: 20, right: 24, bottom: 42, left: 38 };
  const innerWidth = graphWidth - margin.left - margin.right;
  const innerHeight = graphHeight - margin.top - margin.bottom;

  const graphPoints = evolution.map((item, index) => {
    const x =
      evolution.length <= 1
        ? margin.left + innerWidth / 2
        : margin.left + (index / (evolution.length - 1)) * innerWidth;
    const y = margin.top + ((20 - item.score) / 20) * innerHeight;
    return { ...item, x, y };
  });

  const polylinePoints = graphPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const spellingDetails = useMemo(() => {
    const suggestions = selectedSubmission?.spelling_suggestions || [];
    const grouped = new Map();
    for (const item of suggestions) {
      const original = String(item?.original || "").trim();
      const corrected = String(item?.corrected || "").trim();
      if (!original || !corrected) continue;
      const key = `${original}__${corrected}`;
      const existing = grouped.get(key) || { original, corrected, count: 0 };
      existing.count += 1;
      grouped.set(key, existing);
    }
    return [...grouped.values()].sort((a, b) => b.count - a.count);
  }, [selectedSubmission]);
  const rawHighlightWords = spellingDetails.map((item) => item.original);
  const correctedHighlightWords = spellingDetails.map((item) => item.corrected);
  const isUploadingToServer = uploading && Number(uploadProgress ?? 0) < 100;
  const isProcessingServerSide = uploading && Number(uploadProgress ?? 0) >= 100;
  const isLongProcessing = isProcessingServerSide && processingElapsedSec >= 20;
  const transcriptionStepState = isProcessingServerSide
    ? processingElapsedSec < 12
      ? "active"
      : "done"
    : "pending";
  const correctionStepState = isProcessingServerSide && processingElapsedSec >= 12 ? "active" : "pending";

  return (
    <main className="layout">
      <header>
        <h1>Suivi des copies</h1>
        <p>Version test de l'appli</p>
      </header>

      <section className="cards">
        <article className="card">
          <h2>Élèves</h2>
          {loading ? <p>Chargement...</p> : null}
          {!showNewStudentForm ? (
            <button type="button" onClick={() => setShowNewStudentForm(true)}>
              Ajouter un élève
            </button>
          ) : (
            <form onSubmit={handleCreateStudent} className="student-form">
              <input
                value={newStudentName}
                onChange={(event) => setNewStudentName(event.target.value)}
                placeholder="Nom de l'élève"
              />
              <input
                value={newStudentClass}
                onChange={(event) => setNewStudentClass(event.target.value)}
                placeholder="Classe (optionnel)"
              />
              <div className="actions-row">
                <button type="submit">Enregistrer l'élève</button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    setShowNewStudentForm(false);
                    setNewStudentName("");
                    setNewStudentClass("");
                  }}
                >
                  Annuler
                </button>
              </div>
            </form>
          )}
          {students.length ? (
            <label className="stack-label">
              Classe
              <select
                value={selectedClass}
                onChange={(event) => {
                  const nextClass = event.target.value;
                  setSelectedClass(nextClass);
                  setSelectedStudentId(getFirstStudentIdForClass(students, nextClass));
                  setShowEvolutionSection(false);
                }}
              >
                <option value="__ALL__">Toutes les classes</option>
                {classOptions.map((className) => (
                  <option value={className} key={className}>
                    {className}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="stack-label">
            Élève
            <select
              value={selectedStudentId ?? ""}
              onChange={(event) => setSelectedStudentId(Number(event.target.value) || null)}
              disabled={!filteredStudents.length}
            >
              <option value="">Sélectionner un élève</option>
              {filteredStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} - {student.class_name || "Sans classe"}
                </option>
              ))}
            </select>
          </label>
          {!filteredStudents.length && !loading ? <p>Aucun élève pour ce filtre.</p> : null}
          {selectedStudent ? (
            <div className="student-selected-card">
              <strong>{selectedStudent.name}</strong>
              <span>{selectedStudent.class_name || "Classe non renseignée"}</span>
              <span className={`badge ${scoreClass(selectedStudent.average_orthography || 0)}`}>
                Moy. orthographe: {selectedStudent.average_orthography ?? "-"} / 20
              </span>
            </div>
          ) : null}
          {selectedStudent ? (
            <div className="actions-row">
              <button type="button" className="secondary-btn" onClick={() => setShowEvolutionSection((value) => !value)}>
                {showEvolutionSection ? "Masquer évolution" : "Montrer évolution"}
              </button>
              <button type="button" className="danger-btn" onClick={handleDeleteSelectedStudent}>
                Supprimer l'élève
              </button>
            </div>
          ) : null}
        </article>

        <article className="card">
          <h2>Ajouter une copie de {selectedStudent?.name || "..."}</h2>
          <form onSubmit={handleUploadSubmission} className="student-form">
            <input
              value={uploadTitle}
              onChange={(event) => setUploadTitle(event.target.value)}
              placeholder="Titre de la copie"
              disabled={uploading}
            />
            <label className="file-picker">
              Prendre une photo (caméra)
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={uploading}
                onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
              />
            </label>
            <label className="file-picker">
              Charger depuis le téléphone (galerie)
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
              />
            </label>
            {uploadFile ? <p>{uploadFile.name}</p> : null}
            {uploading ? (
              <div className="upload-status-block">
                <p className="upload-status-title">
                  {isLongProcessing
                    ? `Traitement long en cours... (${processingElapsedSec}s côté serveur)`
                    : `Traitement en cours... (${uploadElapsedSec}s)`}
                </p>
                <ol className="upload-steps">
                  <li className={isUploadingToServer ? "active" : "done"}>Téléversement de l'image</li>
                  <li className={transcriptionStepState}>Fiabilité et transcription</li>
                  <li className={correctionStepState}>Correction orthographique et note</li>
                </ol>
                {isUploadingToServer ? <p>Téléversement: {uploadProgress ?? 0}%</p> : null}
                {isProcessingServerSide ? <p>Téléversement terminé, analyse côté serveur en cours.</p> : null}
              </div>
            ) : null}
            <button type="submit" className="upload-submit-btn" disabled={uploading || !selectedStudentId}>
              {uploading ? "Traitement..." : "Prendre/Charger puis corriger"}
            </button>
          </form>
          {uploadFeedback ? <p>{uploadFeedback}</p> : null}
        </article>
      </section>

      <section className="cards">
        {showEvolutionSection ? (
          <article className="card">
            <h2>Évolution de {selectedStudent?.name || "..."}</h2>
            <div className="actions-row">
              <button
                type="button"
                className={evolutionView === "bars" ? "view-btn active" : "view-btn"}
                onClick={() => setEvolutionView("bars")}
              >
                Vue liste
              </button>
              <button
                type="button"
                className={evolutionView === "graph" ? "view-btn active" : "view-btn"}
                onClick={() => setEvolutionView("graph")}
              >
                Vue graphique
              </button>
            </div>
            {detailsLoading ? <p>Chargement des copies...</p> : null}
            {!detailsLoading && !evolution.length ? <p>Aucune copie encore.</p> : null}
            {evolutionView === "bars" ? (
              <div className="timeline">
                {evolution.map((item) => (
                  <div className="timeline-row" key={item.id}>
                    <span>{item.label}</span>
                    <div className="bar-wrapper">
                      <div
                        className={`bar ${scoreClass(item.score)}`}
                        style={{ width: `${Math.max(4, (item.score / 20) * 100)}%` }}
                      />
                    </div>
                    <strong>{item.score}/20</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {evolutionView === "graph" && evolution.length ? (
              <div className="graph-wrap">
                <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} className="evolution-graph">
                  {[0, 5, 10, 15, 20].map((tick) => {
                    const y = margin.top + ((20 - tick) / 20) * innerHeight;
                    return (
                      <g key={tick}>
                        <line
                          x1={margin.left}
                          y1={y}
                          x2={graphWidth - margin.right}
                          y2={y}
                          className="graph-grid"
                        />
                        <text x={6} y={y + 4} className="graph-label">
                          {tick}
                        </text>
                      </g>
                    );
                  })}

                  {graphPoints.length > 1 ? (
                    <polyline fill="none" points={polylinePoints} className="graph-line" />
                  ) : null}

                  {graphPoints.map((point) => (
                    <g key={point.id}>
                      <circle cx={point.x} cy={point.y} r="4" className="graph-point" />
                      <text x={point.x} y={graphHeight - 10} textAnchor="middle" className="graph-label">
                        {point.label}
                      </text>
                    </g>
                  ))}
                </svg>
                <p className="graph-caption">Abscisse: copies - Ordonnée: note /20</p>
              </div>
            ) : null}
          </article>
        ) : null}

        <article className="card">
          <h2>Détail des copies de {selectedStudent?.name || "..."}</h2>
          <select
            value={selectedSubmission?.id || ""}
            onChange={(event) => {
              const id = Number(event.target.value);
              setSelectedSubmission(submissions.find((item) => item.id === id) || null);
              setShowRawText(false);
              setShowCorrectedText(false);
              setShowCopyImage(false);
              setShowNoteDetails(false);
            }}
          >
            <option value="">Sélectionner une copie</option>
            {submissions.map((submission) => (
              <option value={submission.id} key={submission.id}>
                {submission.title} - {new Date(submission.created_at).toLocaleDateString("fr-FR")}
              </option>
            ))}
          </select>

          {selectedSubmission ? (
            <div className="submission-detail">
              <p>
                <strong>Global:</strong> {selectedSubmission.score_orthography ?? "-"} /20
              </p>
              <button type="button" className="secondary-btn" onClick={() => setShowNoteDetails((value) => !value)}>
                {showNoteDetails ? "Masquer détails note" : "Détails note"}
              </button>
              {showNoteDetails ? (
                <div className="note-details-block">
                  <p>
                    <strong>Orthographe:</strong> {selectedSubmission.score_orthography ?? "-"} /20
                  </p>
                  <p>
                    <strong>Fautes détectées:</strong> {selectedSubmission.mistakes_count ?? 0}
                  </p>
                  {spellingDetails.length ? (
                    <ul className="details-list">
                      {spellingDetails.map((item) => (
                        <li key={`${item.original}-${item.corrected}`}>
                          <strong>{item.original}</strong> {"->"} <strong>{item.corrected}</strong> ({item.count}x)
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Aucun détail de correction disponible pour cette copie.</p>
                  )}
                </div>
              ) : null}
              <button type="button" onClick={() => setShowCopyImage((value) => !value)}>
                {showCopyImage ? "Masquer la copie" : "Voir la copie"}
              </button>
              {showCopyImage ? (
                getSubmissionImageUrl(selectedSubmission) ? (
                  <div className="copy-gallery">
                    <a href={getSubmissionImageUrl(selectedSubmission)} target="_blank" rel="noreferrer">
                      <img src={getSubmissionImageUrl(selectedSubmission)} alt="Copie élève" loading="lazy" />
                    </a>
                  </div>
                ) : (
                  <p>Aucune photo trouvée pour cette copie.</p>
                )
              ) : null}
              <button type="button" onClick={() => setShowRawText((value) => !value)}>
                {showRawText ? "Masquer la transcription brute (OCR)" : "Afficher la transcription brute (OCR)"}
              </button>
              {showRawText ? (
                <>
                  <p className="text-caption">Texte brut issu de l'OCR, avant correction orthographique.</p>
                  {renderHighlightedPre(selectedSubmission.text_raw, rawHighlightWords, "text-error-highlight")}
                </>
              ) : null}
              <button type="button" onClick={() => setShowCorrectedText((value) => !value)}>
                {showCorrectedText ? "Masquer le texte corrigé (automatique)" : "Afficher le texte corrigé (automatique)"}
              </button>
              {showCorrectedText ? (
                <>
                  <p className="text-caption">
                    Correction automatique: peut être imparfaite si la transcription OCR est bruitée.
                  </p>
                  {renderHighlightedPre(
                    selectedSubmission.text_corrected || "Aucune correction disponible.",
                    correctedHighlightWords,
                    "text-corrected-highlight"
                  )}
                </>
              ) : null}
            </div>
          ) : (
            <p>Sélectionner une copie pour voir les détails.</p>
          )}
        </article>
      </section>
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

export default App;
