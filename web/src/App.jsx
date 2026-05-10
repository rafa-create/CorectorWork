import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function scoreClass(score) {
  if (score >= 15) return "good";
  if (score >= 10) return "medium";
  return "low";
}

function App() {
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");

  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentClass, setNewStudentClass] = useState("");

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  async function loadStudents() {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${API_BASE}/students`);
      setStudents(data);
      if (!selectedStudentId && data.length > 0) {
        setSelectedStudentId(data[0].id);
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
      await loadStudents();
    } catch {
      setError("Impossible de créer l'élève.");
    }
  }

  const evolution = submissions
    .slice()
    .reverse()
    .map((submission, index) => ({
      label: `Copie ${index + 1}`,
      score: submission.score_orthography,
    }));

  return (
    <main className="layout">
      <header>
        <h1>Suivi des copies - Orthographe</h1>
        <p>
          Version web pour visualiser la transcription, la correction orthographique et
          l'évolution de chaque élève.
        </p>
      </header>

      <section className="cards">
        <article className="card">
          <h2>Nouvel élève</h2>
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
            <button type="submit">Ajouter</button>
          </form>
        </article>

        <article className="card">
          <h2>Élèves</h2>
          {loading ? <p>Chargement...</p> : null}
          <div className="student-list">
            {students.map((student) => (
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
            {!students.length && !loading ? <p>Aucun élève pour le moment.</p> : null}
          </div>
        </article>
      </section>

      <section className="cards">
        <article className="card">
          <h2>Évolution de {selectedStudent?.name || "..."}</h2>
          {detailsLoading ? <p>Chargement des copies...</p> : null}
          {!detailsLoading && !evolution.length ? <p>Aucune copie encore.</p> : null}
          <div className="timeline">
            {evolution.map((item) => (
              <div className="timeline-row" key={item.label}>
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
                <strong>Critère:</strong> Orthographe
              </p>
              <p>
                <strong>Note attribuée:</strong> {selectedSubmission.score_orthography}/20
              </p>
              <p>
                <strong>Fautes détectées:</strong> {selectedSubmission.mistakes_count}
              </p>
              <h3>Transcription</h3>
              <pre>{selectedSubmission.text_raw || "Aucun texte reconnu."}</pre>
              <h3>Texte corrigé</h3>
              <pre>{selectedSubmission.text_corrected || "Aucune correction disponible."}</pre>
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
