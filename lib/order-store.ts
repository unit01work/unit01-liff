// In-memory order store (persists during serverless function warm period)
// For production, use a database like Vercel KV or Supabase

const orders = new Map<string, { amount: number; createdAt: number }>();

export function saveOrder(orderId: string, amount: number) {
  orders.set(orderId, { amount, createdAt: Date.now() });

  // Clean up orders older than 24 hours
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, val] of orders) {
    if (val.createdAt < dayAgo) orders.delete(key);
  }
}

export function getOrderAmount(orderId: string): number | null {
  return orders.get(orderId)?.amount ?? null;
}
