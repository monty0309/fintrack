export interface Account {
  id: number;
  name: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  date: string;
}

export interface Holding {
  symbol: string;
  quantity: number;
  totalCost: number;
  avgPrice: number;
  realizedPnL: number;
  currentPrice?: number;
  unrealizedPnL?: number;
}
