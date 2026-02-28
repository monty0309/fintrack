import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  History, 
  LayoutDashboard, 
  ArrowUpRight, 
  ArrowDownRight,
  RefreshCw,
  X,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Account, Holding, Transaction } from './types';
import { fetchStockPrices, StockPrice } from './services/stockService';
import { storage } from './services/storageService';

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [prices, setPrices] = useState<Record<string, StockPrice>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [view, setView] = useState<'dashboard' | 'history'>('dashboard');

  // Form state
  const [formData, setFormData] = useState({
    symbol: '',
    type: 'BUY' as 'BUY' | 'SELL',
    quantity: '',
    price: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    const data = storage.getAccounts();
    setAccounts(data);
    if (data.length > 0) {
      const savedAccountId = localStorage.getItem('activeAccountId');
      const savedAccount = data.find((a: Account) => a.id.toString() === savedAccountId);
      setActiveAccount(savedAccount || data[0]);
    }
  }, []);

  useEffect(() => {
    if (activeAccount) {
      localStorage.setItem('activeAccountId', activeAccount.id.toString());
      refreshData();
      
      // Auto refresh every 2 minutes
      const interval = setInterval(() => {
        refreshData();
      }, 120000);
      
      return () => clearInterval(interval);
    }
  }, [activeAccount]);

  const refreshData = async () => {
    if (!activeAccount) return;
    setIsRefreshing(true);
    try {
      const holdingsData = storage.getHoldings(activeAccount.id);
      const transactionsData = storage.getTransactions(activeAccount.id);
      
      setHoldings(holdingsData);
      setTransactions(transactionsData);

      // Fetch live prices
      const symbols = holdingsData.map(h => h.symbol);
      if (symbols.length > 0) {
        setFetchError(null);
        const priceData = await fetchStockPrices(symbols);
        if (Object.keys(priceData).length > 0) {
          setPrices(priceData);
          setLastUpdated(new Date());
        } else {
          setFetchError("Could not fetch live prices. Using purchase prices.");
        }
      }
    } catch (error) {
      console.error("Error refreshing data:", error);
      setFetchError("Network error. Please check your connection.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;

    try {
      storage.addTransaction({
        account_id: activeAccount.id,
        symbol: formData.symbol.toUpperCase(),
        type: formData.type,
        quantity: Number(formData.quantity),
        price: Number(formData.price),
        date: formData.date
      });

      setShowAddModal(false);
      setFormData({
        symbol: '',
        type: 'BUY',
        quantity: '',
        price: '',
        date: new Date().toISOString().split('T')[0]
      });
      refreshData();
    } catch (error) {
      console.error("Error adding transaction:", error);
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    try {
      storage.deleteTransaction(id);
      refreshData();
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName.trim()) return;

    try {
      const newAcc = storage.saveAccount(newAccountName);
      setAccounts([...accounts, newAcc]);
      setActiveAccount(newAcc);
      setNewAccountName('');
      setShowAccountModal(false);
    } catch (error) {
      console.error("Error creating account:", error);
    }
  };

  const handleRenameAccount = async (id: number) => {
    if (!renameValue.trim()) return;

    try {
      storage.renameAccount(id, renameValue);
      const updatedAccounts = accounts.map(a => a.id === id ? { ...a, name: renameValue } : a);
      setAccounts(updatedAccounts);
      if (activeAccount?.id === id) {
        setActiveAccount({ ...activeAccount, name: renameValue });
      }
      setEditingAccountId(null);
      setRenameValue('');
    } catch (error) {
      console.error("Error renaming account:", error);
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (accounts.length <= 1) {
      alert("You must have at least one account.");
      return;
    }
    if (!confirm('Are you sure? This will delete the account and all its transactions.')) return;

    try {
      storage.deleteAccount(id);
      const updatedAccounts = accounts.filter(a => a.id !== id);
      setAccounts(updatedAccounts);
      if (activeAccount?.id === id) {
        setActiveAccount(updatedAccounts[0]);
      }
    } catch (error) {
      console.error("Error deleting account:", error);
    }
  };

  const totalInvested = holdings.reduce((acc, h) => acc + (h.quantity * h.avgPrice), 0);
  const totalCurrentValue = holdings.reduce((acc, h) => {
    const price = prices[h.symbol]?.price || h.avgPrice;
    return acc + (h.quantity * price);
  }, 0);
  const totalUnrealizedPnL = totalCurrentValue - totalInvested;
  const totalRealizedPnL = holdings.reduce((acc, h) => acc + (h.realizedPnL || 0), 0);
  const totalPnL = (totalUnrealizedPnL || 0) + (totalRealizedPnL || 0);
  const isPnLPositive = totalPnL >= 0;

  const calculatePeriodProfit = (months: number) => {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setMonth(now.getMonth() - months);
    
    // We need to calculate realized profit from transactions within the period
    // This is tricky because realized profit depends on the cost basis at the time of sale.
    // However, we can approximate it using the transactions we have.
    // A better way is to calculate it chronologically.
    
    let totalProfit = 0;
    const tempHoldings: Record<string, { quantity: number, totalCost: number, avgPrice: number }> = {};
    
    // Sort transactions chronologically for accurate P&L calculation
    const sortedTxs = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    sortedTxs.forEach(tx => {
      if (!tempHoldings[tx.symbol]) {
        tempHoldings[tx.symbol] = { quantity: 0, totalCost: 0, avgPrice: 0 };
      }
      
      const h = tempHoldings[tx.symbol];
      if (tx.type === 'BUY') {
        h.quantity += tx.quantity;
        h.totalCost += tx.quantity * tx.price;
        h.avgPrice = h.quantity > 0 ? h.totalCost / h.quantity : 0;
      } else {
        const profit = tx.quantity * (tx.price - h.avgPrice);
        
        // If the transaction is within the cutoff period, add to total
        if (new Date(tx.date) >= cutoff) {
          totalProfit += profit;
        }
        
        const costOfSold = tx.quantity * h.avgPrice;
        h.quantity -= tx.quantity;
        h.totalCost -= costOfSold;
        if (h.quantity <= 0) {
          h.totalCost = 0;
          h.avgPrice = 0;
        }
      }
    });
    
    return totalProfit;
  };

  const profit1M = calculatePeriodProfit(1);
  const profit6M = calculatePeriodProfit(6);
  const profit1Y = calculatePeriodProfit(12);

  const handleSellClick = (symbol: string) => {
    setFormData({
      ...formData,
      symbol: symbol,
      type: 'SELL',
      quantity: '',
      price: prices[symbol]?.price.toString() || ''
    });
    setShowAddModal(true);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans pb-20">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-30 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
              <TrendingUp size={20} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">FinTrack</h1>
          </div>
          <button 
            onClick={refreshData}
            disabled={isRefreshing}
            className={`p-2 rounded-full hover:bg-black/5 transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Account Selector */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex bg-white p-1 rounded-xl border border-black/5 shadow-sm overflow-x-auto no-scrollbar">
            {accounts.map(acc => (
              <button
                key={acc.id}
                onClick={() => setActiveAccount(acc)}
                className={`flex-shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeAccount?.id === acc.id 
                    ? 'bg-black text-white shadow-md' 
                    : 'text-black/60 hover:text-black'
                }`}
              >
                {acc.name}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setShowAccountModal(true)}
            className="p-2 bg-white rounded-xl border border-black/5 shadow-sm hover:bg-black/5 transition-colors"
            title="Manage Accounts"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Portfolio Summary */}
        <section className="bg-black rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-white/60 text-sm font-medium uppercase tracking-wider mb-1">Total Investment</p>
            <h2 className="text-4xl font-bold mb-6">₹{totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h2>
            
            {lastUpdated && (
              <p className="absolute top-6 right-6 text-[10px] text-white/40 font-medium">
                v1.4 • Updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-md">
                <p className="text-white/60 text-xs font-medium uppercase mb-1">Current Value</p>
                <p className="text-lg font-semibold">₹{totalCurrentValue.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-md">
                <p className="text-white/60 text-xs font-medium uppercase mb-1">Total P&L</p>
                <div className={`flex items-center gap-1 text-lg font-semibold ${isPnLPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isPnLPositive ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                  ₹{Math.abs(totalPnL || 0).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>
          {/* Decorative element */}
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl" />
        </section>

        {/* Realized Profit Summary */}
        <section className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-black/40 mb-4">Realized Profit Summary</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-[10px] font-bold text-black/40 uppercase mb-1">1 Month</p>
              <p className={`text-sm font-bold ${profit1M >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ₹{Math.abs(profit1M).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="text-center border-x border-black/5">
              <p className="text-[10px] font-bold text-black/40 uppercase mb-1">6 Months</p>
              <p className={`text-sm font-bold ${profit6M >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ₹{Math.abs(profit6M).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-black/40 uppercase mb-1">1 Year</p>
              <p className={`text-sm font-bold ${profit1Y >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ₹{Math.abs(profit1Y).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </section>

        {/* Views Toggle */}
        <div className="flex gap-4 border-b border-black/5">
          <button 
            onClick={() => setView('dashboard')}
            className={`pb-2 text-sm font-semibold transition-all relative ${view === 'dashboard' ? 'text-black' : 'text-black/40'}`}
          >
            Holdings
            {view === 'dashboard' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />}
          </button>
          <button 
            onClick={() => setView('history')}
            className={`pb-2 text-sm font-semibold transition-all relative ${view === 'history' ? 'text-black' : 'text-black/40'}`}
          >
            History
            {view === 'history' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />}
          </button>
        </div>

        {/* Content */}
        {fetchError && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-center justify-between text-rose-600"
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <p className="text-[11px] font-bold uppercase tracking-tight">{fetchError}</p>
            </div>
            <button 
              onClick={refreshData}
              disabled={isRefreshing}
              className="text-[10px] font-bold bg-rose-100 px-3 py-1 rounded-full hover:bg-rose-200 transition-colors disabled:opacity-50"
            >
              {isRefreshing ? 'RETRYING...' : 'RETRY NOW'}
            </button>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {view === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {holdings.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-black/10">
                  <p className="text-black/40 text-sm">No stocks in this account yet.</p>
                </div>
              ) : (
                holdings.map(holding => {
                  const currentPrice = prices[holding.symbol]?.price || holding.avgPrice;
                  const unrealizedPnL = (currentPrice - holding.avgPrice) * holding.quantity;
                  const isPositive = unrealizedPnL >= 0;

                  return (
                    <div key={holding.symbol} className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-lg">{holding.symbol}</h3>
                          <p className="text-xs text-black/40 font-medium uppercase">{holding.quantity} Shares @ ₹{holding.avgPrice.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">₹{(holding.quantity * currentPrice).toLocaleString('en-IN')}</p>
                          <div className={`text-xs font-bold flex items-center justify-end gap-0.5 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {Math.abs(unrealizedPnL).toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-3 border-t border-black/5">
                        <div className="text-xs">
                          <span className="text-black/40">Market Price: </span>
                          <span className="font-semibold">₹{currentPrice.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {holding.realizedPnL !== 0 && (
                            <div className="text-xs">
                              <span className="text-black/40">Realized: </span>
                              <span className={`font-semibold ${holding.realizedPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                ₹{holding.realizedPnL.toLocaleString('en-IN')}
                              </span>
                            </div>
                          )}
                          <button 
                            onClick={() => handleSellClick(holding.symbol)}
                            className="bg-rose-500 text-white text-[10px] font-bold px-3 py-1 rounded-full hover:bg-rose-600 transition-colors"
                          >
                            SELL
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {transactions.map(tx => (
                <div key={tx.id} className="bg-white rounded-xl p-3 border border-black/5 flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'BUY' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                      {tx.type === 'BUY' ? <Plus size={20} /> : <ArrowUpRight size={20} className="rotate-90" />}
                    </div>
                    <div>
                      <p className="font-bold text-sm">{tx.symbol}</p>
                      <p className="text-[10px] text-black/40 font-medium uppercase">{tx.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-bold text-sm">₹{(tx.quantity * tx.price).toLocaleString('en-IN')}</p>
                      <p className="text-[10px] text-black/40 font-medium uppercase">{tx.quantity} @ ₹{tx.price}</p>
                    </div>
                    <button 
                      onClick={() => handleDeleteTransaction(tx.id)}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Account Management Modal */}
      <AnimatePresence>
        {showAccountModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAccountModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Manage Accounts</h3>
                <button onClick={() => setShowAccountModal(false)} className="p-2 hover:bg-black/5 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 mb-6">
                {accounts.map(acc => (
                  <div key={acc.id} className="flex items-center gap-3 p-3 bg-black/5 rounded-2xl group">
                    <div className="flex-1">
                      {editingAccountId === acc.id ? (
                        <div className="flex gap-2">
                          <input 
                            autoFocus
                            className="flex-1 bg-white border border-black/10 rounded-lg px-2 py-1 text-sm outline-none focus:border-black"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameAccount(acc.id)}
                          />
                          <button 
                            onClick={() => handleRenameAccount(acc.id)}
                            className="bg-black text-white px-3 py-1 rounded-lg text-xs font-bold"
                          >
                            SAVE
                          </button>
                        </div>
                      ) : (
                        <p className="font-semibold">{acc.name}</p>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          setEditingAccountId(acc.id);
                          setRenameValue(acc.name);
                        }}
                        className="p-2 hover:bg-black/10 rounded-lg text-black/60"
                      >
                        <RefreshCw size={14} />
                      </button>
                      <button 
                        onClick={() => handleDeleteAccount(acc.id)}
                        className="p-2 hover:bg-rose-100 rounded-lg text-rose-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleCreateAccount} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-black/40 ml-1">New Account Name</label>
                  <div className="flex gap-2">
                    <input 
                      required
                      placeholder="e.g. Savings, Trading"
                      className="flex-1 bg-black/5 border border-transparent rounded-2xl px-4 py-3 outline-none focus:border-black/10 transition-all"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                    />
                    <button 
                      type="submit"
                      className="bg-black text-white px-6 rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all"
                    >
                      ADD
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-12 sm:pb-6 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Add Transaction</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-black/5 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAddTransaction} className="space-y-4">
                <div className="flex bg-black/5 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'BUY' })}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${formData.type === 'BUY' ? 'bg-white text-black shadow-sm' : 'text-black/40'}`}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'SELL' })}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${formData.type === 'SELL' ? 'bg-white text-black shadow-sm' : 'text-black/40'}`}
                  >
                    SELL
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-black/40 uppercase ml-1">Stock Symbol (e.g. RELIANCE)</label>
                  <input
                    required
                    type="text"
                    placeholder="Symbol"
                    className="w-full bg-black/5 border-none rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-black transition-all"
                    value={formData.symbol}
                    onChange={e => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-black/40 uppercase ml-1">Quantity</label>
                    <input
                      required
                      type="number"
                      placeholder="0"
                      className="w-full bg-black/5 border-none rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-black transition-all"
                      value={formData.quantity}
                      onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-black/40 uppercase ml-1">Price</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full bg-black/5 border-none rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-black transition-all"
                      value={formData.price}
                      onChange={e => setFormData({ ...formData, price: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-black/40 uppercase ml-1">Date</label>
                  <input
                    required
                    type="date"
                    className="w-full bg-black/5 border-none rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-black transition-all"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-black text-white rounded-xl py-4 font-bold shadow-lg hover:bg-black/90 active:scale-[0.98] transition-all mt-4"
                >
                  Save Transaction
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Nav (Mobile feel) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-black/5 px-6 py-3 flex justify-around items-center z-50">
        <button 
          onClick={() => setView('dashboard')}
          className={`flex flex-col items-center gap-1 transition-colors ${view === 'dashboard' ? 'text-black' : 'text-black/30'}`}
        >
          <LayoutDashboard size={20} />
          <span className="text-[10px] font-bold uppercase">Holdings</span>
        </button>

        {/* Center Add Button */}
        <div className="relative -top-6">
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            animate={{ 
              boxShadow: ["0px 0px 0px rgba(16, 185, 129, 0)", "0px 0px 20px rgba(16, 185, 129, 0.4)", "0px 0px 0px rgba(16, 185, 129, 0)"]
            }}
            transition={{ 
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            onClick={() => setShowAddModal(true)}
            className="w-14 h-14 bg-emerald-500 text-white rounded-full shadow-2xl flex items-center justify-center border-4 border-[#F5F5F7]"
          >
            <Plus size={28} />
          </motion.button>
        </div>

        <button 
          onClick={() => setView('history')}
          className={`flex flex-col items-center gap-1 transition-colors ${view === 'history' ? 'text-black' : 'text-black/30'}`}
        >
          <History size={20} />
          <span className="text-[10px] font-bold uppercase">History</span>
        </button>
      </nav>
    </div>
  );
}
