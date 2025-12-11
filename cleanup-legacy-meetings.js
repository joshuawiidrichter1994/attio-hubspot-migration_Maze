const HubSpotAPI = require('./src/utils/hubspot-api');

async function cleanupLegacyMeetings() {
  const hubspot = new HubSpotAPI();
  let deletedCount = 0;
  let errorCount = 0;

  console.log('📥 Fetching all legacy engagement meetings...');
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await hubspot.getMeetings(100, offset);
      const meetings = response.results;
      hasMore = response.hasMore;
      offset = response.offset;

      for (const meeting of meetings) {
        const meetingId = meeting.engagement.id;
        const title = meeting.metadata?.body?.substring(0, 60) || 'No title';
        try {
          await hubspot.deleteMeeting(meetingId);
          deletedCount++;
          console.log(`✅ Deleted legacy meeting ${meetingId}: ${title}`);
        } catch (err) {
          errorCount++;
          console.error(`❌ Error deleting meeting ${meetingId}:`, err.message);
        }
      }
    } catch (err) {
      errorCount++;
      console.error('❌ Error fetching meetings:', err.message);
      break;
    }
  }

  console.log('========================================');
  console.log(`✅ Deleted ${deletedCount} legacy engagement meetings.`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log('========================================');
}

cleanupLegacyMeetings();
