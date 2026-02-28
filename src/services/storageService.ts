import { Account, Holding, Transaction } from '../types';

const ACCOUNTS_KEY = 'fintrack_accounts';
const TRANSACTIONS_KEY = 'fintrack_transactions';

// Initial data if storage is empty
const INITIAL_ACCOUNTS: Account[] = [
  { id: 1, name: 'Vaibhav' },
  { id: 2, name: 'Neelam' }
];

export const storage = {
  getAccounts: (): Account[] => {
    const data = localStorage.getItem(ACCOUNTS_KEY);
    if (!data) {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(INITIAL_ACCOUNTS));
      return INITIAL_ACCOUNTS;
    }
    return JSON.parse(data);
  },

  saveAccount: (name: string): Account => {
    const accounts = storage.getAccounts();
    const newAcc = { id: Date.now(), name };
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, newAcc]));
    return newAcc;
  },

  renameAccount: (id: number, name: string) => {
    const accounts = storage.getAccounts();
    const updated = accounts.map(a => a.id === id ? { ...a, name } : a);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
  },

  deleteAccount: (id: number) => {
    const accounts = storage.getAccounts();
    const transactions = storage.getTransactions(id);
    
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.filter(a => a.id !== id)));
    
    // Also delete associated transactions
    const allTransactions = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]');
    const filteredTxs = allTransactions.filter((t: Transaction) => t.account_id !== id);
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(filteredTxs));
  },

  getTransactions: (accountId: number): Transaction[] => {
    const data = localStorage.getItem(TRANSACTIONS_KEY);
    if (!data) return [];
    const all: Transaction[] = JSON.parse(data);
    return all.filter(t => t.account_id === accountId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  addTransaction: (tx: Omit<Transaction, 'id'>): Transaction => {
    const all = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]');
    const newTx = { ...tx, id: Date.now() };
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([...all, newTx]));
    return newTx as Transaction;
  },

  deleteTransaction: (id: number) => {
    const all = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]');
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(all.filter((t: any) => t.id !== id)));
  },

  getHoldings: (accountId: number): Holding[] => {
    const transactions = storage.getTransactions(accountId);
    const holdings: Record<string, Holding> = {};
    const realizedPnL: Record<string, number> = {};

    // Sort chronologically for correct avg price calculation
    const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sorted.forEach(tx => {
      if (!holdings[tx.symbol]) {
        holdings[tx.symbol] = { symbol: tx.symbol, quantity: 0, totalCost: 0, avgPrice: 0, realizedPnL: 0 };
        realizedPnL[tx.symbol] = 0;
      }

      const h = holdings[tx.symbol];
      if (tx.type === 'BUY') {
        h.quantity += tx.quantity;
        h.totalCost += tx.quantity * tx.price;
        h.avgPrice = h.quantity > 0 ? h.totalCost / h.quantity : 0;
      } else {
        const sellValue = tx.quantity * tx.price;
        const costOfSold = tx.quantity * h.avgPrice;
        realizedPnL[tx.symbol] += (sellValue - costOfSold);
        
        h.quantity -= tx.quantity;
        h.totalCost -= costOfSold;
        if (h.quantity <= 0) {
          h.totalCost = 0;
          h.avgPrice = 0;
        }
      }
    });

    return Object.values(holdings)
      .filter(h => h.quantity > 0 || realizedPnL[h.symbol] !== 0)
      .map(h => ({
        ...h,
        realizedPnL: realizedPnL[h.symbol] || 0
      }));
  }
};
