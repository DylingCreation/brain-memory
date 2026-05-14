#!/bin/bash
# Bulk fix test files: replace createTestDb usage with createTestStorage pattern

cd /home/yangchen/.openclaw/codinghelper/brain-memory

# Files that use Recaller, graph functions, etc. with db directly
FILES=(
  "test/recaller.test.ts"
  "test/graph.test.ts"
  "test/pagerank.test.ts"
  "test/dedup.test.ts"
  "test/maintenance.test.ts"
  "test/vector-recall.test.ts"
  "test/hybrid-recall.test.ts"
  "test/admission-control.test.ts"
  "test/admission-control-enhanced.test.ts"
  "test/b4-retriever-integration.test.ts"
)

for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then continue; fi

  # 1. Update import line - add createTestStorage, cleanupTestDb
  sed -i 's/import { createTestDb/import { createTestStorage, cleanupTestDb, createTestDb/' "$f"

  # 2. Add storage variable declaration after the existing db declaration
  sed -i '/^let db:/a let storage: ReturnType<typeof createTestStorage>;' "$f"

  # 3. Replace beforeEach
  sed -i "s/beforeEach(() => { db = createTestDb(); });/beforeEach(() => { storage = createTestStorage(); db = storage.getDb(); });\n\nafterEach(() => { cleanupTestDb(storage); });/" "$f"

  # 4. Replace specific constructor calls
  sed -i 's/new Recaller(db,/new Recaller(storage,/g' "$f"
  sed -i 's/new VectorRecaller(db,/new VectorRecaller(storage,/g' "$f"
  sed -i 's/new HybridRecaller(db,/new HybridRecaller(storage,/g' "$f"
  sed -i 's/new AdmissionController(db,/new AdmissionController(storage,/g' "$f"
  sed -i 's/detectCommunities(db/detectCommunities(storage/g' "$f"
  sed -i 's/dedup(db/dedup(storage/g' "$f"
  sed -i 's/computeGlobalPageRank(db/computeGlobalPageRank(storage/g' "$f"
  sed -i 's/personalizedPageRank(db/personalizedPageRank(storage/g' "$f"
  sed -i 's/runMaintenance(db/runMaintenance(storage/g' "$f"
  sed -i 's/shouldRunFusion(db/shouldRunFusion(storage/g' "$f"
  sed -i 's/findFusionCandidates(db/findFusionCandidates(storage/g' "$f"
  sed -i 's/executeFusion(db/executeFusion(storage/g' "$f"
  sed -i 's/runFusion(db/runFusion(storage/g' "$f"
  sed -i 's/detectDuplicates(db/detectDuplicates(storage/g' "$f"
  sed -i 's/getCommunityPeers(db/getCommunityPeers(storage/g' "$f"
  sed -i 's/communityRepresentatives(db/communityRepresentatives(storage/g' "$f"
done

echo "Done fixing ${#FILES[@]} test files"
