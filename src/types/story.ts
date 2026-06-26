export type StoryTranslation = {
  locale: string;
  title: string;
  shortWhatsappReply: string;
  urlPath: string;
};

export type StoryKnowledgeMatch = {
  id: string;
  slug: string;
  title: string;
  shortWhatsappReply: string;
  url: string;
};

export type RetrievedStory = {
  id: string;
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  url: string;
};
