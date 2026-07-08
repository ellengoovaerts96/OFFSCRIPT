export type Contact = {
  id: string;
  name?: string;
  role?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  languages: string[];
  region?: string;
  notes?: string;
  trusted: boolean;
  lastVerifiedAt?: string;
};
