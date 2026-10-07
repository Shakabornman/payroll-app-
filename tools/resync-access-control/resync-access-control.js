/**
 * One-off helper: re-trigger syncUserAccess for every access_control record.
 *
 * What it does
 *   - Reads every document in the Firestore collection access_control.
 *   - Prints each one (user id, employee number, access levels).
 *   - With --apply, sets ONLY the updatedAt field on each document to the
 *     current time. That counts as a change, so the syncUserAccess function
 *     runs for it and copies the access levels into Supabase.
 *   - It never changes accessLevels, employeeNumber or anything else.
 *
 * Default is a DRY RUN: nothing is written unless you pass --apply.
 *
 * Run it from the folder that already has firebase-admin installed
 * (/mnt/data/HAE/firebase-functions):
 *     node resync-access-control.js            (dry run, lists only)
 *     node resync-access-control.js --apply    (writes updatedAt)
 *
 * It needs Google "application default credentials" on your computer:
 *     gcloud auth application-default login
 * Do NOT create or download a service-account key file for this.
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'hae-vuma-92fca';
const apply = process.argv.includes('--apply');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();

  const snapshot = await db.collection('access_control').get();
  console.log(`Found ${snapshot.size} access_control documents.\n`);

  for (const doc of snapshot.docs) {
    const d = doc.data();
    const levels = Array.isArray(d.accessLevels) ? d.accessLevels.join(', ') : '(none)';
    console.log(`${doc.id}  employee ${d.employeeNumber ?? '?'}  levels: ${levels}`);

    if (apply) {
      await doc.ref.update({ updatedAt: new Date().toISOString() });
      console.log('   -> updatedAt set, sync triggered');
      await pause(1500); // one at a time, so the function is not flooded
    }
  }

  console.log(apply
    ? '\nDone. Wait about a minute, then check shared.user_access in Supabase.'
    : '\nDry run only. Nothing was written. Add --apply to trigger the sync.');
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
