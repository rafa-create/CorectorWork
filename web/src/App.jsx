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

  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentClass, setNewStudentClass] = useState("");
  const [showNewStudentForm, setShowNewStudentForm] = useState(false);
  const [selectedClass, setSelectedClass] = useState("__ALL__");
  const [showRawText, setShowRawText] = useState(false);
  const [showCorrectedText, setShowCorrectedText] = useState(false);
  const [showCopyImage, setShowCopyImage] = useState(false);
  const [showNoteDetails, setShowNoteDetails] = useState(false);

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

  async function loadStudents() {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${API_BASE}/students`);
      setStudents(data);
      if (data.length > 0) {
        setSelectedStudentId((current) => current ?? data[0].id);
      } else {
        setSelectedStudentId(null);
      }
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
        if (data.length > 0) {
          setSelectedStudentId((current) => current ?? data[0].id);
        } else {
          setSelectedStudentId(null);
        }
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
              <select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}>
                <option value="__ALL__">Toutes les classes</option>
                {classOptions.map((className) => (
                  <option value={className} key={className}>
                    {className}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="student-list">
            {filteredStudents.map((student) => (
              <button
                key={student.id}
                className={student.id === selectedStudentId ? "student active" : "student"}
                onClick={() => setSelectedStudentId(student.id)}
              >
                <strong>{student.name}</strong>
                <span>{student.class_name || "Classe non renseignée"}</span>
                <span className={`badge ${scoreClass(student.average_orthography || 0)}`}>
                  Moy. orthographe: {student.average_orthography ?? "-"} / 20
                </span>
              </button>
            ))}
            {!filteredStudents.length && !loading ? <p>Aucun élève pour ce filtre.</p> : null}
          </div>
        </article>

        <article className="card">
          <h2>Ajouter une copie</h2>
          <form onSubmit={handleUploadSubmission} className="student-form">
            <select
              value={selectedStudentId ?? ""}
              onChange={(event) => setSelectedStudentId(Number(event.target.value) || null)}
              disabled={uploading}
            >
              <option value="">Sélectionner un élève</option>
              {filteredStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
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
            {uploading && uploadProgress !== null && uploadProgress < 100 ? (
              <p>Téléversement de la copie: {uploadProgress}%</p>
            ) : null}
            {uploading && (uploadProgress === null || uploadProgress >= 100) ? (
              <p>Téléversement terminé, traitement en cours...</p>
            ) : null}
            <button type="submit" className="upload-submit-btn" disabled={uploading || !selectedStudentId}>
              {uploading ? "Traitement..." : "Prendre/Charger puis corriger"}
            </button>
          </form>
          {uploadFeedback ? <p>{uploadFeedback}</p> : null}
        </article>
      </section>

      <section className="cards">
        <article className="card">
          <h2>Évolution de {selectedStudent?.name || "..."}</h2>
          {detailsLoading ? <p>Chargement des copies...</p> : null}
          {!detailsLoading && !evolution.length ? <p>Aucune copie encore.</p> : null}
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
        </article>

        <article className="card">
          <h2>Détail de la copie</h2>
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
                {showRawText ? "Masquer la transcription" : "Afficher la transcription"}
              </button>
              {showRawText ? (
                <pre>{selectedSubmission.text_raw || "Aucun texte reconnu."}</pre>
              ) : null}
              <button type="button" onClick={() => setShowCorrectedText((value) => !value)}>
                {showCorrectedText ? "Masquer le texte corrigé" : "Afficher le texte corrigé"}
              </button>
              {showCorrectedText ? (
                <pre>{selectedSubmission.text_corrected || "Aucune correction disponible."}</pre>
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
