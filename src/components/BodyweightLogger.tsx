import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function BodyweightLogger() {
  const [weight, setWeight] = useState("");

  async function handleSubmit() {
    if (!weight) return;

    await addDoc(collection(db, "bodyweight"), {
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