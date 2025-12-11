/**
 * Investigate why meeting exists in API but not in HubSpot search
 */

require('dotenv').config();
const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor');

async function investigateSearchability() {
  try {
    console.log('🔍 INVESTIGATION: Why meeting exists in API but not in HubSpot search...\n');
    
    const processor = new ComprehensiveMeetingProcessor();
    
    // Target meeting that should exist but doesn't appear in search
    const targetMeetingId = '0a4e1f8c-d04b-459e-b0bb-72ce080f0882';
    const hubspotMeetingId = '383688759520'; // From previous test
    
    console.log(`🎯 Target: Kane Cutler and Will Patterson`);
    console.log(`🎯 Attio ID: ${targetMeetingId}`);  
    console.log(`🎯 HubSpot ID: ${hubspotMeetingId}`);
    console.log();
    
    // Get the specific meeting details from HubSpot
    console.log('📋 Step 1: Get detailed meeting properties from HubSpot...');
    try {
      const response = await processor.hubspot.client.get(`/crm/v3/objects/meetings/${hubspotMeetingId}`, {
        params: {
          properties: [
            'hs_meeting_title',
            'hs_meeting_body', 
            'hs_meeting_start_time',
            'hs_meeting_end_time',
            'hs_timestamp',
            'hs_createdate',
            'hs_lastmodifieddate',
            'hs_object_source',
            'hs_object_source_id',
            'attio_meeting_id'
          ].join(',')
        }
      });
      
      const meeting = response.data;
      console.log('📋 Meeting Properties:');
      console.log(`   📝 Title: "${meeting.properties.hs_meeting_title || 'NO TITLE'}"`);
      console.log(`   📝 Body: "${(meeting.properties.hs_meeting_body || 'NO BODY').substring(0, 100)}..."`);
      console.log(`   📅 Start Time: ${meeting.properties.hs_meeting_start_time || 'NO START TIME'}`);
      console.log(`   📅 End Time: ${meeting.properties.hs_meeting_end_time || 'NO END TIME'}`);
      console.log(`   📅 Timestamp: ${meeting.properties.hs_timestamp || 'NO TIMESTAMP'}`);
      console.log(`   📅 Created: ${meeting.properties.hs_createdate || 'NO CREATE DATE'}`);
      console.log(`   📅 Modified: ${meeting.properties.hs_lastmodifieddate || 'NO MODIFIED DATE'}`);
      console.log(`   🔧 Source: ${meeting.properties.hs_object_source || 'NO SOURCE'}`);
      console.log(`   🔧 Source ID: ${meeting.properties.hs_object_source_id || 'NO SOURCE ID'}`);
      console.log(`   🔗 Attio ID: ${meeting.properties.attio_meeting_id || 'NO ATTIO ID'}`);
      console.log();
      
      // Check for issues that might affect searchability
      const issues = [];
      if (!meeting.properties.hs_meeting_title) issues.push('Missing title');
      if (!meeting.properties.hs_meeting_start_time) issues.push('Missing start time');
      if (!meeting.properties.hs_timestamp) issues.push('Missing timestamp');
      if (!meeting.properties.attio_meeting_id) issues.push('Missing Attio ID');
      
      if (issues.length > 0) {
        console.log('⚠️  POTENTIAL ISSUES:');
        issues.forEach(issue => console.log(`   ❌ ${issue}`));
        console.log();
      }
      
    } catch (error) {
      console.log(`   ❌ Error fetching meeting details: ${error.response?.status} - ${error.message}`);
    }
    
    // Compare with a working pre-Nov 26 meeting
    console.log('🔍 Step 2: Compare with a working pre-Nov 26 meeting...');
    
    try {
      const allMeetings = await processor.getFreshHubSpotMeetings();
      
      // Find a meeting from before Nov 26 that should be searchable
      const preNov26Meetings = allMeetings.filter(meeting => {
        const createDate = meeting.properties?.hs_createdate;
        if (!createDate) return false;
        
        const date = new Date(createDate);
        return date < new Date('2025-11-26') && meeting.properties?.hs_meeting_title;
      });
      
      if (preNov26Meetings.length > 0) {
        const workingMeeting = preNov26Meetings[0];
        console.log('📋 WORKING meeting (pre-Nov 26) for comparison:');
        console.log(`   🎯 ID: ${workingMeeting.id}`);
        console.log(`   📝 Title: "${workingMeeting.properties.hs_meeting_title}"`);
        console.log(`   📅 Created: ${workingMeeting.properties.hs_createdate}`);
        console.log(`   📅 Start Time: ${workingMeeting.properties.hs_meeting_start_time || 'NO START TIME'}`);
        console.log(`   🔧 Source: ${workingMeeting.properties.hs_object_source || 'NO SOURCE'}`);
        console.log(`   🔗 Attio ID: ${workingMeeting.properties.attio_meeting_id || 'NO ATTIO ID'}`);
      } else {
        console.log('   ❌ No pre-Nov 26 meetings found for comparison');
      }
      
    } catch (error) {
      console.log(`   ❌ Error getting comparison meetings: ${error.message}`);
    }
    
    // Check if meeting has proper associations
    console.log('\\n🔍 Step 3: Check meeting associations...');
    try {
      const associationsResponse = await processor.hubspot.client.get(`/crm/v4/objects/meetings/${hubspotMeetingId}/associations`);
      const associations = associationsResponse.data.results || [];
      
      console.log(`📋 Meeting has ${associations.length} associations:`);
      associations.forEach(assoc => {
        console.log(`   🔗 ${assoc.toObjectType}: ${assoc.toObjectId} (${assoc.associationCategory})`);
      });
      
      if (associations.length === 0) {
        console.log('   ⚠️  NO ASSOCIATIONS - This might affect searchability!');
      }
      
    } catch (error) {
      console.log(`   ❌ Error checking associations: ${error.response?.status} - ${error.message}`);
    }
    
    console.log('\\n📊 DIAGNOSIS:');
    console.log('The meeting exists in HubSpot API but not in global search.');
    console.log('This could be due to:');
    console.log('   1. ❌ Missing or invalid title/content');
    console.log('   2. ❌ Missing associations (contacts/companies)');
    console.log('   3. ❌ Incorrect timestamps or indexing issues');
    console.log('   4. ❌ Object source/creation method differences');
    console.log('   5. ⏱️  Search index delay (meetings might appear later)');
    
  } catch (error) {
    console.error('❌ Investigation failed:', error.message);
  }
}

investigateSearchability().catch(console.error);