import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const db = new Database("finance.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER,
    symbol TEXT,
    type TEXT, -- 'BUY' or 'SELL'
    quantity INTEGER,
    price REAL,
    date TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );
`);

// Safer migration logic
try {
  // 1. Ensure target accounts exist
  db.prepare("INSERT OR IGNORE INTO accounts (name) VALUES ('Vaibhav')").run();
  db.prepare("INSERT OR IGNORE INTO accounts (name) VALUES ('Neelam')").run();

  const vaibhav = db.prepare("SELECT id FROM accounts WHERE name = 'Vaibhav'").get() as { id: number };
  const neelam = db.prepare("SELECT id FROM accounts WHERE name = 'Neelam'").get() as { id: number };

  // 2. Merge Account 1 -> Vaibhav
  const acc1 = db.prepare("SELECT id FROM accounts WHERE name = 'Account 1'").get() as { id: number } | undefined;
  if (acc1) {
    db.prepare("UPDATE transactions SET account_id = ? WHERE account_id = ?").run(vaibhav.id, acc1.id);
    db.prepare("DELETE FROM accounts WHERE id = ?").run(acc1.id);
  }

  // 3. Merge Account 2 -> Neelam
  const acc2 = db.prepare("SELECT id FROM accounts WHERE name = 'Account 2'").get() as { id: number } | undefined;
  if (acc2) {
    db.prepare("UPDATE transactions SET account_id = ? WHERE account_id = ?").run(neelam.id, acc2.id);
    db.prepare("DELETE FROM accounts WHERE id = ?").run(acc2.id);
  }

  // 4. Remove any other accounts
  db.prepare("DELETE FROM accounts WHERE name NOT IN ('Vaibhav', 'Neelam')").run();
} catch (error) {
  console.error("Migration error:", error);
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  console.log(`Server starting in ${process.env.NODE_ENV || 'development'} mode`);

  // API Routes
  app.get("/api/accounts", (req, res) => {
    const accounts = db.prepare("SELECT * FROM accounts").all();
    res.json(accounts);
  });

  app.get("/manifest.json", (req, res) => {
    res.sendFile(path.join(process.cwd(), "manifest.json"));
  });

  app.get("/api/holdings/:accountId", (req, res) => {
    const { accountId } = req.params;
    // Calculate holdings by aggregating transactions
    const transactions = db.prepare("SELECT * FROM transactions WHERE account_id = ?").all(accountId);
    
    const holdings: Record<string, any> = {};
    const realizedPnL: Record<string, number> = {};

    transactions.forEach((tx: any) => {
      if (!holdings[tx.symbol]) {
        holdings[tx.symbol] = { symbol: tx.symbol, quantity: 0, totalCost: 0, avgPrice: 0 };
        realizedPnL[tx.symbol] = 0;
      }

      if (tx.type === 'BUY') {
        holdings[tx.symbol].quantity += tx.quantity;
        holdings[tx.symbol].totalCost += tx.quantity * tx.price;
        holdings[tx.symbol].avgPrice = holdings[tx.symbol].totalCost / holdings[tx.symbol].quantity;
      } else {
        // SELL
        const sellValue = tx.quantity * tx.price;
        const costOfSold = tx.quantity * holdings[tx.symbol].avgPrice;
        realizedPnL[tx.symbol] += (sellValue - costOfSold);
        
        holdings[tx.symbol].quantity -= tx.quantity;
        holdings[tx.symbol].totalCost -= costOfSold;
        // avgPrice stays the same after sell
      }
    });

    const result = Object.values(holdings)
      .filter((h: any) => h.quantity > 0 || realizedPnL[h.symbol] !== 0)
      .map((h: any) => ({
        ...h,
        realizedPnL: realizedPnL[h.symbol] || 0
      }));

    res.json(result);
  });

  app.get("/api/transactions/:accountId", (req, res) => {
    const { accountId } = req.params;
    const transactions = db.prepare("SELECT * FROM transactions WHERE account_id = ? ORDER BY date DESC").all(accountId);
    res.json(transactions);
  });

  app.post("/api/transactions", (req, res) => {
    const { accountId, symbol, type, quantity, price, date } = req.body;
    const stmt = db.prepare("INSERT INTO transactions (account_id, symbol, type, quantity, price, date) VALUES (?, ?, ?, ?, ?, ?)");
    stmt.run(accountId, symbol.toUpperCase(), type, quantity, price, date);
    res.json({ success: true });
  });

  app.delete("/api/transactions/:id", (req, res) => {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM transactions WHERE id = ?");
    stmt.run(id);
    res.json({ success: true });
  });

  // Vite middleware for development
  const isProd = process.env.NODE_ENV === "production" || process.env.VITE_PROD === "true";
  const distPath = path.join(process.cwd(), "dist");

  if (!isProd) {
    console.log("Using Vite middleware for development");
    try {
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          host: '0.0.0.0',
          port: 3000
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Vite middleware failed, falling back to static", e);
      app.use(express.static(distPath));
    }
  } else {
    console.log(`Serving static files from ${distPath}`);
    if (fs.existsSync(distPath)) {
      console.log("Dist directory exists");
      const files = fs.readdirSync(distPath);
      console.log("Files in dist:", files);
    } else {
      console.error("Dist directory DOES NOT exist!");
    }
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("index.html not found in dist folder. Please wait for build to complete.");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
