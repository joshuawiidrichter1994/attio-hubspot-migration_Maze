/**
 * Count meetings with 1970 timestamp bug
 */

require('dotenv').config();
const HubSpotAPI = require('./src/utils/hubspot-api');

async function count1970Meetings() {
  try {
    console.log('🔍 COUNTING 1970 TIMESTAMP BUG...\n');
    
    const hubspot = new HubSpotAPI();
    
    // Search for meetings with 1970 dates (Unix timestamp 0 or close to it)
    const response = await hubspot.client.post('/crm/v3/objects/meetings/search', {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'hs_meeting_start_time',
              operator: 'LT',
              value: '86400000' // Less than 1 day after Unix epoch (Jan 1, 1970)
            }
          ]
        }
      ],
      properties: ['hs_meeting_title', 'hs_meeting_start_time', 'hs_createdate', 'attio_meeting_id'],
      limit: 100
    });
    
    const badMeetings = response.data.results || [];
    
    console.log(`🚨 FOUND ${badMeetings.length} MEETINGS WITH 1970 TIMESTAMPS:`);
    console.log();
    
    let recentlyCreated = 0;
    let withAttioId = 0;
    
    badMeetings.forEach((meeting, index) => {
      const title = meeting.properties.hs_meeting_title || 'No title';
      const createDate = meeting.properties.hs_createdate;
      const attioId = meeting.properties.attio_meeting_id;
      
      const created = createDate ? new Date(createDate).toISOString().split('T')[0] : 'No date';
      
      if (createDate && new Date(createDate) > new Date('2025-12-01')) {
        recentlyCreated++;
      }
      
      if (attioId) {
        withAttioId++;
      }
      
      if (index < 10) { // Show first 10
        console.log(`${index + 1}. "${title}"`);
        console.log(`   📅 Created: ${created} | Attio ID: ${attioId ? 'YES' : 'NO'} | HubSpot ID: ${meeting.id}`);
      }
    });
    
    if (badMeetings.length > 10) {
      console.log(`... and ${badMeetings.length - 10} more`);
    }
    
    console.log(`\n📊 ANALYSIS:`);
    console.log(`   🚨 Total meetings with 1970 bug: ${badMeetings.length}`);
    console.log(`   📅 Created since Dec 1, 2025: ${recentlyCreated} (likely from recent migration)`);
    console.log(`   🔗 Have Attio ID: ${withAttioId}`);
    console.log(`   ⚠️  This affects ${Math.round((badMeetings.length / 1000) * 100)}% of meetings (rough estimate)`);
    
    console.log(`\n💡 RECOMMENDATION:`);
    if (recentlyCreated > 0) {
      console.log(`   🔧 ${recentlyCreated} recently created meetings need timestamp fix`);
      console.log(`   🚀 Run a timestamp repair script to fix these before video matching`);
    }
    
  } catch (error) {
    console.error('❌ Count failed:', error.message);
  }
}

count1970Meetings().catch(console.error);