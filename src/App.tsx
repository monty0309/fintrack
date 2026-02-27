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

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [prices, setPrices] = useState<Record<string, StockPrice>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
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
    fetch('/api/accounts')
      .then(res => res.json())
      .then(data => {
        setAccounts(data);
        if (data.length > 0) setActiveAccount(data[0]);
      });
  }, []);

  useEffect(() => {
    if (activeAccount) {
      refreshData();
    }
  }, [activeAccount]);

  const refreshData = async () => {
    if (!activeAccount) return;
    setIsRefreshing(true);
    try {
      const [holdingsRes, transactionsRes] = await Promise.all([
        fetch(`/api/holdings/${activeAccount.id}`),
        fetch(`/api/transactions/${activeAccount.id}`)
      ]);
      
      const holdingsData: Holding[] = await holdingsRes.json();
      const transactionsData: Transaction[] = await transactionsRes.json();
      
      setHoldings(holdingsData);
      setTransactions(transactionsData);

      // Fetch live prices
      const symbols = holdingsData.map(h => h.symbol);
      if (symbols.length > 0) {
        const priceData = await fetchStockPrices(symbols);
        setPrices(priceData);
      }
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: activeAccount.id,
          ...formData,
          quantity: Number(formData.quantity),
          price: Number(formData.price)
        })
      });

      if (res.ok) {
        setShowAddModal(false);
        setFormData({
          symbol: '',
          type: 'BUY',
          quantity: '',
          price: '',
          date: new Date().toISOString().split('T')[0]
        });
        refreshData();
      }
    } catch (error) {
      console.error("Error adding transaction:", error);
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        refreshData();
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  };

  const totalInvested = holdings.reduce((acc, h) => acc + (h.quantity * h.avgPrice), 0);
  const totalCurrentValue = holdings.reduce((acc, h) => {
    const price = prices[h.symbol]?.price || h.avgPrice;
    return acc + (h.quantity * price);
  }, 0);
  const totalUnrealizedPnL = totalCurrentValue - totalInvested;
  const totalRealizedPnL = holdings.reduce((acc, h) => acc + h.realizedPnL, 0);

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
        h.avgPrice = h.totalCost / h.quantity;
      } else {
        const profit = tx.quantity * (tx.price - h.avgPrice);
        
        // If the transaction is within the cutoff period, add to total
        if (new Date(tx.date) >= cutoff) {
          totalProfit += profit;
        }
        
        h.quantity -= tx.quantity;
        h.totalCost -= tx.quantity * h.avgPrice;
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
        <div className="flex bg-white p-1 rounded-xl border border-black/5 shadow-sm">
          {accounts.map(acc => (
            <button
              key={acc.id}
              onClick={() => setActiveAccount(acc)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                activeAccount?.id === acc.id 
                  ? 'bg-black text-white shadow-md' 
                  : 'text-black/60 hover:text-black'
              }`}
            >
              {acc.name}
            </button>
          ))}
        </div>

        {/* Portfolio Summary */}
        <section className="bg-black rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-white/60 text-sm font-medium uppercase tracking-wider mb-1">Total Investment</p>
            <h2 className="text-4xl font-bold mb-6">₹{totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-md">
                <p className="text-white/60 text-xs font-medium uppercase mb-1">Current Value</p>
                <p className="text-lg font-semibold">₹{totalCurrentValue.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-md">
                <p className="text-white/60 text-xs font-medium uppercase mb-1">Total P&L</p>
                <div className={`flex items-center gap-1 text-lg font-semibold ${totalUnrealizedPnL + totalRealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalUnrealizedPnL + totalRealizedPnL >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                  ₹{Math.abs(totalUnrealizedPnL + totalRealizedPnL).toLocaleString('en-IN')}
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

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
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
              className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
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
