import { GoogleGenAI, Type } from "@google/genai";

export interface StockPrice {
  symbol: string;
  price: number;
  change?: number;
  changePercent?: number;
  lastUpdated: string;
}

export async function fetchStockPrices(symbols: string[]): Promise<Record<string, StockPrice>> {
  if (symbols.length === 0) return {};

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  try {
    // Using gemini-3-flash-preview as recommended for basic tasks
    const modelName = "gemini-3-flash-preview";
    console.log("StockService v1.3 - Fetching prices for:", symbols);
    
    const prompt = `Search for the current market price of these NSE (India) stocks: ${symbols.join(", ")}. 
    Use Google Search to find the latest prices from reliable sources like Google Finance or NSE India.
    Return the data as a JSON array of objects. 
    Example: [{"symbol": "RELIANCE", "price": 2500.50, "change": 10.5, "changePercent": 0.42}]
    Ensure the response contains the JSON array and nothing else. If you must include text, put the JSON inside a markdown code block.`;

    console.log("StockService v1.4 - Fetching prices for:", symbols);
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    console.log("AI Response:", text);
    
    // Robust JSON extraction: look for [ ... ] even inside markdown blocks
    let data = [];
    try {
      const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0]);
      } else {
        // Try parsing the whole text if no match
        data = JSON.parse(text);
      }
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      // Fallback: try to find any JSON-like structure
      const fallbackMatch = text.match(/\[.*\]/s);
      if (fallbackMatch) {
        try {
          data = JSON.parse(fallbackMatch[0]);
        } catch (e2) {
          console.error("Fallback parsing failed:", e2);
        }
      }
    }
    const result: Record<string, StockPrice> = {};
    
    if (Array.isArray(data)) {
      data.forEach((info: any) => {
        if (info && info.symbol && typeof info.price === 'number') {
          const sym = info.symbol.toUpperCase();
          result[sym] = {
            symbol: sym,
            price: info.price,
            change: info.change || 0,
            changePercent: info.changePercent || 0,
            lastUpdated: new Date().toISOString()
          };
        }
      });
    }

    return result;
  } catch (error) {
    console.error("Error in fetchStockPrices:", error);
    return {};
  }
}
