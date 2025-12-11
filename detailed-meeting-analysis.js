const HubSpotAPI = require('./src/utils/hubspot-api');

class DetailedMeetingAnalysis {
  constructor() {
    this.hubspotAPI = new HubSpotAPI();
  }

  async run() {
    console.log('🔍 DETAILED ANALYSIS: Finding meetings from Dec 2025 onwards...\n');
    
    try {
      // Target dates you mentioned
      const dec26_2025 = new Date('2025-12-26T00:00:00Z').getTime();
      const dec27_2025 = new Date('2025-12-27T00:00:00Z').getTime(); 
      const dec29_2025 = new Date('2025-12-29T00:00:00Z').getTime();
      const dec30_2025 = new Date('2025-12-30T00:00:00Z').getTime();
      const jan30_2026 = new Date('2026-01-30T00:00:00Z').getTime();
      
      console.log(`🎯 Looking for meetings on these dates:`);
      console.log(`   Dec 26 2025: ${dec26_2025}`);
      console.log(`   Dec 27 2025: ${dec27_2025}`);
      console.log(`   Dec 29 2025: ${dec29_2025}`);
      console.log(`   Dec 30 2025: ${dec30_2025}`);
      console.log(`   Jan 30 2026: ${jan30_2026}\n`);

      // Get all meetings from HubSpot engagements
      console.log('🔍 Fetching all HubSpot meeting engagements...');
      const allMeetings = await this.hubspotAPI.getAllMeetings();
      console.log(`📊 Found ${allMeetings.length} total meeting engagements\n`);

      // Analyze meeting properties structure and find late 2025/2026 meetings
      const suspiciousMeetings = [];
      const propertyFields = new Set();
      
      for (const meeting of allMeetings.slice(0, 5)) {
        if (meeting.properties) {
          Object.keys(meeting.properties).forEach(key => propertyFields.add(key));
        }
      }
      
      console.log('📋 Available property fields:', Array.from(propertyFields).join(', '));
      console.log();
      
      // Look for meetings that might be in the target date range
      for (const meeting of allMeetings) {
        if (!meeting.properties) continue;
        
        const props = meeting.properties;
        const title = props.hs_meeting_title || 'No title';
        const body = props.hs_meeting_body || '';
        
        // Check multiple timestamp fields
        const timestamps = {
          hs_timestamp: props.hs_timestamp,
          hs_meeting_start_time: props.hs_meeting_start_time,
          hs_meeting_end_time: props.hs_meeting_end_time,
          hs_createdate: props.hs_createdate,
          hs_lastmodifieddate: props.hs_lastmodifieddate
        };
        
        // Convert timestamp strings to numbers where possible
        for (const [key, value] of Object.entries(timestamps)) {
          if (value) {
            const numValue = parseInt(value);
            if (!isNaN(numValue)) {
              const date = new Date(numValue);
              
              // Check if any timestamp falls in late 2025 or 2026
              if (numValue >= dec26_2025 && numValue <= jan30_2026 + (365 * 24 * 60 * 60 * 1000)) {
                suspiciousMeetings.push({
                  id: meeting.id,
                  title: title,
                  timestampField: key,
                  timestampValue: numValue,
                  date: date.toISOString(),
                  dateString: date.toLocaleDateString(),
                  isAttioImport: body.includes('Meeting imported from Attio'),
                  allTimestamps: timestamps
                });
                break; // Found one match, don't need to check other fields
              }
            }
          }
        }
      }

      console.log(`🚨 Found ${suspiciousMeetings.length} meetings in late 2025/early 2026:`);
      
      if (suspiciousMeetings.length === 0) {
        console.log('   ✅ No meetings found in the target date range');
        
        // Show some recent meetings for context
        const recentMeetings = [];
        const now = Date.now();
        const dayAgo = now - (24 * 60 * 60 * 1000);
        
        for (const meeting of allMeetings.slice(0, 100)) {
          if (!meeting.properties) continue;
          const timestamp = parseInt(meeting.properties.hs_timestamp);
          if (timestamp && timestamp >= dayAgo) {
            recentMeetings.push({
              title: meeting.properties.hs_meeting_title || 'No title',
              date: new Date(timestamp).toISOString(),
              id: meeting.id
            });
          }
        }
        
        console.log(`\n📅 Recent meetings (last 24 hours) for reference:`);
        recentMeetings.slice(0, 5).forEach(m => {
          console.log(`   - ${m.title} (${m.date})`);
        });
        
      } else {
        suspiciousMeetings.forEach((meeting, index) => {
          const attioMarker = meeting.isAttioImport ? ' [ATTIO IMPORT]' : '';
          console.log(`   ${index + 1}. ${meeting.title}${attioMarker}`);
          console.log(`      Date: ${meeting.dateString} (${meeting.date})`);
          console.log(`      Field: ${meeting.timestampField} = ${meeting.timestampValue}`);
          console.log(`      ID: ${meeting.id}`);
          console.log();
        });
      }

    } catch (error) {
      console.error('❌ Critical error during detailed analysis:', error.message);
      throw error;
    }
  }
}

// Run the analysis
const analysis = new DetailedMeetingAnalysis();
analysis.run().catch(console.error);