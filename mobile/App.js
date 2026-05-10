import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import axios from "axios";

// Remplace cette URL par l'IP publique ou LAN du serveur API.
const API_URL = "http://129.151.255.80:4000";

export default function App() {
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [title, setTitle] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [imageUri, setImageUri] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadStudents() {
    try {
      const { data } = await axios.get(`${API_URL}/api/students`);
      setStudents(data);
      if (!selectedStudentId && data.length > 0) {
        setSelectedStudentId(data[0].id);
      }
    } catch (error) {
      setMessage("Impossible de charger les élèves.");
    }
  }

  useEffect(() => {
    loadStudents();
  }, []);

  async function addStudent() {
    const name = newStudentName.trim();
    if (!name) {
      Alert.alert("Nom requis", "Merci d'indiquer le nom de l'élève.");
      return;
    }

    try {
      await axios.post(`${API_URL}/api/students`, { name });
      setNewStudentName("");
      await loadStudents();
      setMessage("Élève ajouté.");
    } catch (error) {
      setMessage("Création de l'élève impossible.");
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission refusée", "L'accès à la caméra est nécessaire.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      allowsEditing: false,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
      setMessage("Photo capturée.");
    }
  }

  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission refusée", "L'accès à la galerie est nécessaire.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.9,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
      setMessage("Image sélectionnée.");
    }
  }

  async function uploadSubmission() {
    if (!selectedStudentId) {
      Alert.alert("Élève manquant", "Sélectionne un élève avant l'envoi.");
      return;
    }
    if (!imageUri) {
      Alert.alert("Image manquante", "Prends une photo ou choisis une image.");
      return;
    }

    const formData = new FormData();
    formData.append("studentId", String(selectedStudentId));
    formData.append("title", title.trim() || "Nouvelle copie");
    formData.append("image", {
      uri: imageUri,
      name: `copie-${Date.now()}.jpg`,
      type: "image/jpeg",
    });

    setLoading(true);
    setMessage("Envoi et traitement OCR en cours...");
    try {
      const { data } = await axios.post(`${API_URL}/api/submissions`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage(
        `Copie traitée. Note orthographe: ${data.score_orthography}/20, fautes: ${data.mistakes_count}.`
      );
      setImageUri("");
      setTitle("");
    } catch (error) {
      setMessage("Échec d'envoi. Vérifie que l'API est accessible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>App mobile professeur</Text>
      <Text style={styles.subtitle}>Photo de copie + envoi vers l'API de correction.</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Créer un élève</Text>
        <TextInput
          style={styles.input}
          placeholder="Nom de l'élève"
          value={newStudentName}
          onChangeText={setNewStudentName}
        />
        <Button title="Ajouter l'élève" onPress={addStudent} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Choisir l'élève</Text>
        {students.map((student) => (
          <Text
            key={student.id}
            onPress={() => setSelectedStudentId(student.id)}
            style={[
              styles.studentRow,
              selectedStudentId === student.id ? styles.studentSelected : null,
            ]}
          >
            {student.name} {selectedStudentId === student.id ? "✓" : ""}
          </Text>
        ))}
        {!students.length ? <Text>Aucun élève pour le moment.</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nouvelle copie</Text>
        <TextInput
          style={styles.input}
          placeholder="Titre de la copie (optionnel)"
          value={title}
          onChangeText={setTitle}
        />
        <View style={styles.row}>
          <Button title="Prendre une photo" onPress={takePhoto} />
        </View>
        <View style={styles.row}>
          <Button title="Choisir depuis la galerie" onPress={pickFromGallery} />
        </View>

        {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} /> : null}

        <View style={styles.row}>
          <Button title="Envoyer la copie" onPress={uploadSubmission} disabled={loading} />
        </View>
        {loading ? <ActivityIndicator size="small" /> : null}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}
      <StatusBar style="dark" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    backgroundColor: "#f4f6fb",
    flexGrow: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    color: "#4c5668",
    marginBottom: 16,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#c9d4e2",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  row: {
    marginTop: 8,
  },
  preview: {
    width: "100%",
    height: 240,
    borderRadius: 10,
    marginTop: 10,
    backgroundColor: "#eef2f8",
  },
  studentRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#ecf0f6",
  },
  studentSelected: {
    color: "#163f8c",
    fontWeight: "700",
  },
  message: {
    marginTop: 8,
    color: "#163f8c",
    fontWeight: "600",
  },
});
