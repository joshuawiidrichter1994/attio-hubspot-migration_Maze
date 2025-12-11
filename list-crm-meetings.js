const HubSpotAPI = require('./src/utils/hubspot-api');

async function listAllCRMMeetings() {
  const hubspot = new HubSpotAPI();
  console.log('📥 Fetching all CRM meetings from HubSpot...');
  try {
    const crmMeetings = await hubspot.getAllCRMMeetings();
    console.log(`✅ Found ${crmMeetings.length} CRM meetings.`);
    crmMeetings.slice(0, 10).forEach((meeting, idx) => {
      const title = meeting.properties?.hs_meeting_title || '(No title)';
      const start = meeting.properties?.hs_meeting_start_time || '(No start time)';
      const attioId = meeting.properties?.attio_meeting_id || '(No Attio ID)';
      console.log(`  ${idx + 1}. Title: ${title}\n     Start: ${start}\n     Attio ID: ${attioId}`);
    });
    if (crmMeetings.length > 10) {
      console.log(`...and ${crmMeetings.length - 10} more meetings.`);
    }
  } catch (err) {
    console.error('❌ Error fetching CRM meetings:', err.message);
  }
}

listAllCRMMeetings();
