import { capsule, table, query, mutation, string, number } from "eraspace/server";

export default capsule({
  schema: {
    scores: table({ name: string(), score: number() }).index("by_score", ["score"]),
  },
  queries: {
    leaderboard: query(async (ctx) =>
      ctx.db.scores.withIndex("by_score", (q) => q.gt("score", -1)).order("desc").take(10)),
  },
  mutations: {
    submit: mutation(async (ctx, name: string, score: number) => {
      const clean = name.trim();
      if (!clean || clean.length > 16) throw new Error("Use a name of 1 to 16 characters.");
      if (!Number.isFinite(score) || score < 0 || score > 100000) throw new Error("Score must be between 0 and 100000.");
      return ctx.db.scores.insert({ name: clean, score: Math.floor(score) });
    }),
  },
});
