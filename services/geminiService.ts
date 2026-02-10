import { GoogleGenerativeAI } from "@google/generative-ai";
import { Service, Barber, Language } from "../types";

// Initialize the client
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export const generateServiceIcon = async (serviceName: string, brandName: string = "Blade & Bourbon"): Promise<string | null> => {
  try {
    // Using gemini-2.5-flash-image which can generate actual PNG images
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

    const prompt = `
      You are a professional icon designer for a luxury barbershop called "${brandName}".
      Create a premium icon representing this service: "${serviceName}".
      
      ANALYSIS: Understand what this service is about:
      - If it involves haircuts, clippers, scissors → show those tools
      - If it involves beard, shaving, razors → show razor or beard shape
      - If it involves facial treatments, skincare, massage → show spa elements (lotus, hands, water drops, facial silhouette)
      - If it involves combos → combine relevant elements
      - For ANY other service → interpret the name intelligently and create an appropriate icon
      
      STYLE REQUIREMENTS (CRITICAL):
      - Color: Solid metallic gold (#D4AF37) ONLY
      - Background: Pure black (#000000)
      - Design: Bold, modern, minimalist silhouette
      - Aesthetic: Premium, expensive, "Gazarski" (cool/stylish)
      - Composition: Centered, clean edges, high contrast
      - NO text, NO thin outlines, NO other colors
      
      OUTPUT: 512x512px PNG image, professional quality.
    `;

    const result = await model.generateContent(prompt);

    // gemini-2.5-flash-image returns actual image data in inlineData
    const response = result.response;

    // Check for image in response parts
    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          return `data:${mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Icon generation failed", error);
    return null;
  }
};

export const generateServiceDescriptions = async (serviceName: string, brandName: string = "Blade & Bourbon"): Promise<{ en: string, bg: string } | null> => {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      You are an expert copywriter for a high-end luxury barbershop called "${brandName}".
      Write a short, sophisticated, and inviting description for a service named: "${serviceName}".
      
      Requirements:
      1. Tone: Elegant, masculine, professional, concise.
      2. Length: Maximum 1 sentence (approx 10-15 words).
      3. Return valid JSON only with keys "en" (English) and "bg" (Bulgarian).
      
      Example Output:
      {
        "en": "Precision haircut tailored to your unique face shape and style.",
        "bg": "Прецизно подстригване, съобразено с вашата уникална форма на лицето и стил."
      }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    console.error("Description generation failed", error);
    return null;
  }
};

export const generateBarberBio = async (notes: string, name: string, lang: Language, brandName: string = "Blade & Bourbon"): Promise<string | null> => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    const prompt = `
      You are an expert copywriter for "${brandName}", a luxury barbershop.
      Transform the following rough notes about a barber named "${name}" into a sophisticated, super-short, professional biography (max 2 sentences).
      
      Tone: Elegant, masculine, high-end.
      Example Style: "The visionary behind the chair. Nalby combines years of international experience with a passion for perfection."
      
      Rough Notes: "${notes}"
      
      Language: ${lang === 'bg' ? 'Bulgarian' : 'English'}
      
      Return ONLY the bio text string. Do not include quotes or labels.
    `;

    const result = await model.generateContent(prompt);
    return result.response.text()?.trim() || null;
  } catch (error) {
    console.error("Bio generation failed", error);
    return null;
  }
};

export const sendMessageToGemini = async (
  message: string,
  context: { services: Service[]; barbers: Barber[] },
  lang: Language,
  history: { role: 'user' | 'model'; text: string }[] = [],
  brandName: string = "Blade & Bourbon",
  assistantName: string = "Blade"
): Promise<string> => {
  try {
    const isBg = lang === 'bg';
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      systemInstruction: `You are "${assistantName}," the sophisticated AI concierge for "${brandName}," an elite barbershop.
    Tone: Classy, professional, slightly witty, and welcoming. Think "Kingsman" vibes.
    
    Your responsibilities:
    1. Help customers choose services based on their needs.
    2. Provide information about our barbers.
    3. If they want to book, encourage them to use the "Book Now" button on the screen.
    4. Answer general grooming and style questions.
    
    ${isBg ? 'IMPORTANT: The user is speaking Bulgarian. You MUST reply in BULGARIAN. Keep the classy tone but adapted to Bulgarian culture. Currency is Euro (€).' : 'Reply in English. Currency is Euro (€).'}
    
    Keep responses concise.`
    });

    // Choose appropriate fields based on language
    const servicesList = context.services
      .map((s) => `- ${isBg ? s.nameBg : s.name} (€${s.price}): ${isBg ? s.descriptionBg : s.description}`)
      .join("\n");

    const barbersList = context.barbers
      .map((b) => `- ${isBg ? b.nameBg : b.name} (Specialty: ${isBg ? b.specialtyBg : b.specialty})`)
      .join("\n");

    const contextMsg = `Current Service Menu:\n${servicesList}\n\nMaster Barbers:\n${barbersList}`;

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: contextMsg }] },
         { role: "model", parts: [{ text: isBg ? `Разбрах. Аз съм ${assistantName}, вашият консиерж. С какво мога да помогна?` : `Understood. I am ${assistantName}, your concierge. How may I be of service?` }] },
        ...history.map(h => ({
          role: h.role,
          parts: [{ text: h.text }]
        }))
      ],
    });

    const result = await chat.sendMessage(message);
    return result.response.text();

  } catch (error) {
    console.error("Gemini API Error:", error);
    return lang === 'bg'
      ? "Извинете, имам проблем с връзката."
      : "My apologies, I seem to be having trouble connecting.";
  }
};
