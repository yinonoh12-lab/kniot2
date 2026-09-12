exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const product = String(body.product || "").trim();

    if (!product) {
      return { statusCode: 400, body: JSON.stringify({ error: "חסר שם מוצר" }) };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "לא הוגדר GEMINI_API_KEY ב-Netlify Environment Variables."
        })
      };
    }

    const parts = [{
      text: `אני עוזר קניות בישראל. המשתמש מחפש את המוצר הבא: "${product}".

חפש באינטרנט מידע עדכני ורלוונטי בישראל.
אם מדובר במוצר ספציפי, נסה לזהות את המותג/דגם המדויק.
החזר עד 5 אפשרויות טובות, ועדיף מאתרים ישראליים וחנויות מוכרות.
לכל אפשרות כתוב:
1. שם המוצר המדויק
2. חנות/אתר
3. מחיר אם מצאת
4. משפט קצר למה זו התאמה טובה
5. קישור ישיר למוצר אם קיים

אל תמציא מחירים, דגמים או קישורים. אם אינך בטוח, ציין זאת.
ענה בעברית, בצורה קצרה וברורה.`
    }];

    // Optional product photo: Gemini can use it to identify the exact item/model.
    if (body.imageData) {
      const base64 = String(body.imageData).replace(/^data:[^;]+;base64,/, "");
      parts.push({
        inline_data: {
          mime_type: body.imageMimeType || "image/jpeg",
          data: base64
        }
      });
      parts[0].text += `
יש גם תמונה של המוצר. השתמש בה כדי לזהות את המוצר/הדגם ולחפש התאמות מדויקות יותר.`;
    }

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ parts }],
        tools: [{ google_search: {} }]
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", result);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: result?.error?.message || "Gemini API error"
        })
      };
    }

    const text =
      result?.candidates?.[0]?.content?.parts
        ?.map(p => p.text || "")
        .join("\n")
        .trim() || "לא נמצאו תוצאות.";

    const chunks =
      result?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    const sources = chunks
      .map(c => c.web)
      .filter(Boolean)
      .map(w => ({ title: w.title, uri: w.uri }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, sources })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "שגיאה פנימית בחיפוש Gemini." })
    };
  }
};
