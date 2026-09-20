export const voteKinds = ["human", "partial", "ai"] as const;
export type VoteKind = (typeof voteKinds)[number];
export type Label = "grey" | "green" | "yellow" | "red";

export type Counts = { human: number; partial: number; ai: number; total: number };
export type Summary = Counts & { label: Label };

export type PublicVote = {
  id: string;
  kind: VoteKind;
  comment: string | null;
  updatedAt: string;
  user: { login: string; displayName: string; profileUrl: string };
};

export type VotePage = { votes: PublicVote[]; nextCursor: string | null };
