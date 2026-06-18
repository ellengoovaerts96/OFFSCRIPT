export type ChatDirection = "incoming" | "outgoing";

export type InboxItem = {
  id: string;
  userPhone: string;
  incomingMessage: string;
  incomingAt: string;
  outgoingMessage?: string;
  outgoingAt?: string;
};
