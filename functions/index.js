const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

exports.analyzeFood = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const token = authHeader.split("Bearer ")[1];
      await admin.auth().verifyIdToken(token);

      const { imageBase64 } = req.body;
      if (!imageBase64) {
        res.status(400).json({ error: "No image provided" });
        return;
      }

      const projectId = process.env.GCLOUD_PROJECT;
      const accessToken = await admin.credential.applicationDefault().getAccessToken();

      const prompt = "Analyze this food image and provide nutritional estimates. Return ONLY a valid JSON object with this exact format, no other text: {\"foodName\": \"name of the food/meal\", \"items\": [{\"name\": \"item name\", \"portionSize\": \"estimated portion\", \"calories\": 0, \"protein\": 0, \"carbs\": 0, \"fat\": 0}], \"totalCalories\": 0, \"totalProtein\": 0, \"totalCarbs\": 0, \"totalFat\": 0, \"confidence\": \"high/medium/low\"}";

      const url = "https://us-central1-aiplatform.googleapis.com/v1/projects/" + projectId + "/locations/us-central1/publishers/google/models/gemini-1.5-flash:generateContent";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + accessToken.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          }
        })
      });

      const data = await response.json();
      console.log("Vertex AI response:", JSON.stringify(data));

      if (!response.ok) {
        console.error("Vertex AI error:", JSON.stringify(data));
        res.status(500).json({ error: "AI service error" });
        return;
      }

      let responseText = "";
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
        responseText = data.candidates[0].content.parts[0].text;
      } else if (data.predictions && data.predictions[0]) {
        responseText = data.predictions[0];
      } else {
        console.error("Unexpected response format:", JSON.stringify(data));
        res.status(500).json({ error: "Unexpected AI response format" });
        return;
      }

      const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const nutrition = JSON.parse(cleaned);

      res.status(200).json(nutrition);
    } catch (error) {
      console.error("Error analyzing food:", error);
      res.status(500).json({ error: "Failed to analyze food image" });

