// Retained read-only metadata type; annotation editing UI was removed.
export type DocumentAnnotation = {
  id: string;
  annotatorKind: string;
  documentPosition: number;
  name: string;
  label: string | null;
  score: number | null;
  explanation: string | null;
  createdAt: string;
  updatedAt: string;
  user: { username: string; profilePictureUrl: string | null } | null;
};
