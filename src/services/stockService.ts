import { GoogleGenAI } from "@google/genai";

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
    const prompt = `Fetch the current market price of the following NSE (National Stock Exchange of India) stocks: ${symbols.join(", ")}. 
    Return the data in a strict JSON format without any markdown formatting: 
    {
      "SYMBOL": { "price": number, "change": number, "changePercent": number }
    }
    Ensure the symbols are keys and values are numbers. Use the most recent data available.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "{}";
    // Robust JSON extraction
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : text;
    const data = JSON.parse(cleanJson);
    const result: Record<string, StockPrice> = {};
    
    Object.entries(data).forEach(([symbol, info]: [string, any]) => {
      result[symbol.toUpperCase()] = {
        symbol: symbol.toUpperCase(),
        price: info.price,
        change: info.change,
        changePercent: info.changePercent,
        lastUpdated: new Date().toISOString()
      };
    });

    return result;
  } catch (error) {
    console.error("Error fetching stock prices:", error);
    return {};
  }
}
