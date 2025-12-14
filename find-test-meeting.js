require('dotenv').config();
const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor');

async function findTestMeeting() {
  console.log('🔍 Finding a suitable test meeting with missing associations...');
  
  const processor = new ComprehensiveMeetingProcessor();
  
  try {
    // Get CRM meetings that should have associations
    console.log('📥 Fetching CRM meetings...');
    const meetingsResponse = await processor.hubspot.getCRMMeetings(20); // Get 20 meetings
    const meetings = meetingsResponse.results || [];
    console.log(`Found ${meetings.length} meetings to analyze`);
    
    if (meetings.length === 0) {
      console.log('❌ No meetings found');
      return null;
    }
    
    for (const meeting of meetings) { // Check all meetings
      try {
        console.log(`\n📋 Checking meeting ${meeting.id}...`);
        
        // Get the Attio meeting to see what associations should exist
        const attioMeetingId = meeting.properties?.hs_meeting_body;
        if (!attioMeetingId) {
          console.log(`  ⏭️ Skipping - no Attio ID found`);
          continue;
        }
        
        const attioMeeting = await processor.attio.getMeeting(attioMeetingId);
        if (!attioMeeting) {
          console.log(`  ⏭️ Skipping - Attio meeting not found`);
          continue;
        }
        
        // Check what associations should exist based on Attio
        const { contactIds, companyIds, dealIds } = await processor.getDesiredAssociationsForMeeting(attioMeeting);
        
        if (companyIds.size === 0 && dealIds.size === 0) {
          console.log(`  ⏭️ Skipping - no companies/deals expected`);
          continue;
        }
        
        // Get current HubSpot associations
        const currentMeeting = await processor.hubspot.client.get(
          `/crm/v3/objects/meetings/${meeting.id}`,
          { params: { associations: 'contacts,companies,deals' } }
        );
        const existing = currentMeeting.data?.associations || {};
        
        const existingCompanies = new Set(existing.companies?.results?.map(c => c.id) || []);
        const existingDeals = new Set(existing.deals?.results?.map(d => d.id) || []);
        
        // Find missing associations
        const missingCompanies = [...companyIds].filter(id => !existingCompanies.has(id));
        const missingDeals = [...dealIds].filter(id => !existingDeals.has(id));
        
        if (missingCompanies.length > 0 || missingDeals.length > 0) {
          console.log(`\n🎯 PERFECT TEST CANDIDATE FOUND!`);
          console.log(`Meeting ID: ${meeting.id}`);
          console.log(`Meeting Title: ${meeting.properties?.hs_meeting_title || 'No title'}`);
          console.log(`Attio ID: ${attioMeetingId}`);
          console.log(`\nExpected associations:`);
          console.log(`  - Contacts: ${contactIds.size}`);
          console.log(`  - Companies: ${companyIds.size} (${Array.from(companyIds).join(', ')})`);
          console.log(`  - Deals: ${dealIds.size} (${Array.from(dealIds).join(', ')})`);
          console.log(`\nCurrent associations:`);
          console.log(`  - Companies: ${existingCompanies.size} (${Array.from(existingCompanies).join(', ')})`);
          console.log(`  - Deals: ${existingDeals.size} (${Array.from(existingDeals).join(', ')})`);
          console.log(`\nMissing associations:`);
          console.log(`  - Companies: ${missingCompanies.length} (${missingCompanies.join(', ')})`);
          console.log(`  - Deals: ${missingDeals.length} (${missingDeals.join(', ')})`);
          
          // Return the test data
          return {
            meetingId: meeting.id,
            meetingTitle: meeting.properties?.hs_meeting_title || 'No title',
            testCompanyId: missingCompanies[0] || null,
            testDealId: missingDeals[0] || null,
            allExpectedCompanies: Array.from(companyIds),
            allExpectedDeals: Array.from(dealIds),
            missingCompanies,
            missingDeals
          };
        } else {
          console.log(`  ✅ All associations already correct`);
        }
        
      } catch (error) {
        console.log(`  ❌ Error checking meeting ${meeting.id}: ${error.message}`);
      }
    }
    
    console.log('\n❌ No suitable test meeting found');
    return null;
    
  } catch (error) {
    console.error('❌ Error finding test meeting:', error.message);
    return null;
  }
}

// Run the search
if (require.main === module) {
  findTestMeeting().then(testData => {
    if (testData) {
      console.log(`\n📝 USE THESE VALUES IN test-single-association.js:`);
      console.log(`const testMeetingId = '${testData.meetingId}';`);
      if (testData.testCompanyId) {
        console.log(`const testCompanyId = '${testData.testCompanyId}';`);
      }
      if (testData.testDealId) {
        console.log(`const testDealId = '${testData.testDealId}';`);
      }
      
      console.log(`\n🔍 You can verify this meeting in HubSpot:`);
      console.log(`Meeting URL: https://app.hubspot.com/contacts/your-portal/record/0-47/${testData.meetingId}`);
      console.log(`Meeting: "${testData.meetingTitle}"`);
      
    } else {
      console.log('\n📝 Consider running this on more meetings or checking your data');
    }
  });
}