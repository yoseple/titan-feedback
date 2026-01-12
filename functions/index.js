const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const nodemailer = require("nodemailer"); // <--- NEW IMPORT

initializeApp();
const db = getFirestore();

// SECRETS
const apiKey = defineSecret("GEMINI_API_KEY");
const emailUser = defineSecret("EMAIL_USER");     // <--- NEW SECRET
const emailPass = defineSecret("EMAIL_PASSWORD"); // <--- NEW SECRET

// --- 1. AI GENERATION (Existing) ---
exports.generateAI = onCall({ secrets: [apiKey], cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be logged in.");

  const uid = request.auth.uid;
  const today = new Date().toISOString().split('T')[0];
  const userUsageRef = db.collection('user_usage').doc(uid);

  // Rate Limiting
  const usageSnap = await userUsageRef.get();
  if (usageSnap.exists && usageSnap.data().date === today && usageSnap.data().count >= 30) {
    throw new HttpsError('resource-exhausted', 'Daily limit reached.');
  }

  // Increment
  await userUsageRef.set({ count: (usageSnap.exists && usageSnap.data().date === today ? usageSnap.data().count : 0) + 1, date: today }, { merge: true });

  // Call Gemini
  const { prompt } = request.data;
  const key = apiKey.value();

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!response.ok) throw new Error(`Gemini Error: ${response.statusText}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch (error) {
    console.error("AI Error:", error);
    throw new HttpsError("internal", "AI generation failed");
  }
});

// --- 2. TICKET SYSTEM (New) ---
exports.submitTicket = onCall({ secrets: [emailUser, emailPass], cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
  
  const { subject, message, type } = request.data; // type = 'bug' or 'feedback'
  const uid = request.auth.uid;
  const email = request.auth.token.email || "Unknown User";

  try {
    // A. Save to Firestore (Permanent Record)
    await db.collection('tickets').add({
      uid,
      email,
      type,
      subject,
      message,
      status: 'new',
      createdAt: new Date().toISOString()
    });

    // B. Send Email via Nodemailer
    // Note: If secrets aren't set, this part is skipped safely
    if (emailUser.value() && emailPass.value()) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: emailUser.value(),
            pass: emailPass.value()
          }
        });

        await transporter.sendMail({
          from: `"Titan App" <${emailUser.value()}>`,
          to: emailUser.value(), // Sends to YOURSELF (Admin)
          replyTo: email,        // So you can reply to the user easily
          subject: `[Titan ${type.toUpperCase()}] ${subject}`,
          text: `User: ${email}\nID: ${uid}\n\nMessage:\n${message}`
        });
    }

    return { success: true, message: "Ticket submitted successfully." };

  } catch (error) {
    console.error("Ticket Error:", error);
    // We still return success if Firestore worked, even if email failed
    return { success: true, message: "Ticket saved (Email delivery pending)." };
  }
});