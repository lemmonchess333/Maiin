const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require("cors")({ origin: true });

admin.initializeApp();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `Analyze this food image and provide nutritional estimates. Return ONLY a valid JSON object with this exact format, no other text:
{
  "foodName": "name of the food/meal",
  "items": [
    {
      "name": "item name",
      "portionSize": "estimated portion",
      "calories": 0,
      "protein": 0,
      "carbs": 0,
      "fat": 0
    }
  ],
  "totalCalories": 0,
  "totalProtein": 0,
  "totalCarbs": 0,
  "totalFat": 0,
  "confidence": "high/medium/low"
}`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: imageBase64,
          },
        },
      ]);

      const responseText = result.response.text();
      const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const nutrition = JSON.parse(cleaned);

      res.status(200).json(nutrition);
    } catch (error) {
      console.error("Error analyzing food:", error);
      res.status(500).json({ error: "Failed to analyze food image" });
    }
  });
});
