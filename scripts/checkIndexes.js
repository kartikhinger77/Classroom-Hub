const env = require('../config/env');
const { connectDatabase, mongoose } = require('../config/db');
const Post = require('../models/Post');

async function main() {
  await connectDatabase(env.MONGODB_URI);
  const listPlan = await Post.find({ type: 'note', deletedAt: null }).sort({ createdAt: -1, _id: -1 }).limit(10).explain('executionStats');
  const textPlan = await Post.find({ $text: { $search: 'classroom lesson' }, deletedAt: null }).limit(10).explain('executionStats');
  process.stdout.write(`${JSON.stringify({ list: { executionTimeMillis: listPlan.executionStats.executionTimeMillis, totalDocsExamined: listPlan.executionStats.totalDocsExamined, winningPlan: listPlan.queryPlanner.winningPlan }, search: { executionTimeMillis: textPlan.executionStats.executionTimeMillis, totalDocsExamined: textPlan.executionStats.totalDocsExamined, winningPlan: textPlan.queryPlanner.winningPlan } }, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`Index check failed: ${error.message}\n`); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
