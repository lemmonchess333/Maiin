import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../lib/auth";
import { db } from "../lib/firebase";

export default function BodyweightLogger() {
  const { profile } = useAuth();
  const [weight, setWeight] = useState("");

  async function handleSubmit() {
    if (!weight || !profile) return;

    await addDoc(collection(db, "users", profile.uid, "bodyweight"), {
      weight: Number(weight),
      createdAt: serverTimestamp(),
    });

    setWeight("");
  }

  return (
    <div>
      <h3>Log Bodyweight</h3>
      <input
        type="number"
        placeholder="Weight (kg)"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
      />
      <button onClick={handleSubmit}>Save</button>
    </div>
  );
}