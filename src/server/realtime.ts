import type { Response } from 'express';

type Client = {
  userId: string;
  res: Response;
};

const clients: Set<Client> = new Set();

export function addRealtimeClient(userId: string, res: Response): () => void {
  const client: Client = { userId, res };
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

export function emitToUsers(userIds: string[], event: string, payload: unknown) {
  const targets = new Set(userIds);
  const serialized = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    if (targets.has(client.userId)) {
      try {
        client.res.write(serialized);
      } catch {
        clients.delete(client);
      }
    }
  }
}
