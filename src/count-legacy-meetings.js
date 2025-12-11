// src/count-legacy-meetings.js
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const APPLY = process.argv.includes('--apply'); // if true => actually delete
const DRY_RUN = !APPLY;

if (!HUBSPOT_TOKEN) {
  console.error('❌ HUBSPOT_ACCESS_TOKEN environment variable is required');
  process.exit(1);
}

const HUBSPOT_BASE = 'https://api.hubapi.com';

function getHeaders() {
  return {
    Authorization: `Bearer ${HUBSPOT_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Scan ALL legacy engagements and return ONLY Attio-imported MEETING engagements.
 * Safety filters:
 *   - engagement.type === 'MEETING'
 *   - metadata.body contains 'Original ID:' OR 'Meeting imported from Attio'
 */
async function getAllLegacyAttioMeetings() {
  let offset = 0;
  let hasMore = true;
  let meetingCount = 0;
  let attioImportedCount = 0;
  let totalEngagements = 0;
  let pageNum = 1;

  const attioMeetings = [];

  console.log('🔍 Scanning all legacy engagements for MEETING type...');
  console.log('📍 Using endpoint: /engagements/v1/engagements/paged');
  console.log('================================================');

  while (hasMore) {
    try {
      const url = `${HUBSPOT_BASE}/engagements/v1/engagements/paged?limit=250&offset=${offset}`;
      const response = await axios.get(url, { headers: getHeaders() });
      const data = response.data;

      totalEngagements += data.results.length;

      // Filter for MEETING type engagements (client-side only)
      const meetingsOnPage = data.results.filter(
        (eng) => eng.engagement?.type === 'MEETING'
      );

      // From those meetings, only ones clearly imported from Attio
      const attioMeetingsOnPage = meetingsOnPage
        .filter(
          (eng) =>
            typeof eng.metadata?.body === 'string' &&
            (eng.metadata.body.includes('Original ID:') ||
              eng.metadata.body.includes('Meeting imported from Attio'))
        )
        .map((eng) => {
          const body = eng.metadata?.body || '';

          // Try to extract the Attio Original ID (UUID) if present
          const match = body.match(/Original ID:\s*([a-f0-9-]{36})/i);
          const attioId = match ? match[1] : null;

          return {
            engagementId: eng.engagement.id,
            attioId,
            bodySnippet: body.slice(0, 200),
          };
        });

      meetingCount += meetingsOnPage.length;
      attioImportedCount += attioMeetingsOnPage.length;
      attioMeetings.push(...attioMeetingsOnPage);

      hasMore = data.hasMore;
      offset = data.offset;

      console.log(
        `📄 Page ${pageNum}: +${meetingsOnPage.length} MEETINGs ` +
          `(${attioMeetingsOnPage.length} Attio), total MEETINGs: ${meetingCount}, ` +
          `Attio MEETINGs so far: ${attioImportedCount}`
      );

      if (totalEngagements % 2500 === 0) {
        console.log(`   📊 Processed ${totalEngagements} total engagements...`);
      }

      pageNum++;
    } catch (error) {
      console.error(`❌ Error on page ${pageNum}:`, error.message);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error('   Data:', error.response.data);
      }
      throw error;
    }
  }

  console.log('================================================');
  console.log(`📊 LEGACY ENGAGEMENT SCAN COMPLETE:`);
  console.log(`   📝 Total engagements scanned: ${totalEngagements}`);
  console.log(`   🗓️  Legacy MEETING engagements: ${meetingCount}`);
  console.log(`   🔗 Attio imported MEETING engagements: ${attioImportedCount}`);
  console.log(`   ⚠️ Legacy meetings are NOT visible in HubSpot UI`);
  console.log(`   ⚠️ Only CRM meetings (/crm/v3/objects/meetings) show in UI`);
  console.log('================================================');

  return { attioMeetings, totals: { totalEngagements, meetingCount, attioImportedCount } };
}

/**
 * Delete a single legacy engagement by ID (MEETING).
 */
async function deleteLegacyEngagement(engagementId) {
  const url = `${HUBSPOT_BASE}/engagements/v1/engagements/${engagementId}`;
  await axios.delete(url, { headers: getHeaders() });
}

/**
 * Optional: write a JSON snapshot of all candidates before deletion.
 */
function writeSnapshot(attioMeetings) {
  const outPath = path.join(__dirname, 'legacy-attio-meetings-snapshot.json');
  fs.writeFileSync(outPath, JSON.stringify(attioMeetings, null, 2), 'utf8');
  console.log(`🗂️  Snapshot written to ${outPath}`);
}

/**
 * Main runner:
 *  - Discover candidate Attio legacy meetings
 *  - In DRY RUN (default): log + snapshot only
 *  - With --apply flag: actually delete them
 */
async function run() {
  console.log(DRY_RUN ? '🧪 DRY RUN MODE (no deletions will be made)' : '⚠️ LIVE MODE (deletions will be performed)');
  console.log('================================================');

  const { attioMeetings, totals } = await getAllLegacyAttioMeetings();

  console.log(`🧾 Candidates for deletion (Attio legacy MEETINGs): ${attioMeetings.length}`);

  // Always write a snapshot before any destructive action
  writeSnapshot(attioMeetings);

  if (DRY_RUN) {
    console.log('🧪 DRY RUN COMPLETE:');
    console.log('   No deletions were performed.');
    console.log('   Review legacy-attio-meetings-snapshot.json if you want to double-check IDs/body text.');
    return;
  }

  console.log('⚠️ STARTING DELETION OF LEGACY ATTIO MEETINGS...');
  let deleted = 0;

  for (const m of attioMeetings) {
    try {
      await deleteLegacyEngagement(m.engagementId);
      deleted++;
      if (deleted % 100 === 0) {
        console.log(`   🗑️ Deleted ${deleted}/${attioMeetings.length}...`);
      }
    } catch (error) {
      console.error(`❌ Failed to delete engagement ${m.engagementId}:`, error.message);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error('   Data:', error.response.data);
      }
      // Continue with next one; don't abort entire run
    }
  }

  console.log('================================================');
  console.log('✅ DELETION COMPLETE:');
  console.log(`   🗑️ Total deleted legacy Attio MEETING engagements: ${deleted}`);
  console.log('================================================');
}

run().catch((err) => {
  console.error('❌ Fatal error in delete script:', err.message);
  process.exit(1);
});