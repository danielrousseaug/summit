export type Note = {
  id: number;
  title: string;
  content: string;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
};

export type NoteCreate = {
  title: string;
  content: string;
};
