/**
 * QUICK CHECK: Search for specific meetings in HubSpot by title keywords
 */

require('dotenv').config();
const HubSpotAPI = require('./src/utils/hubspot-api');

async function quickSearch() {
  try {
    console.log('🔍 QUICK SEARCH: Looking for recent meetings...\n');
    
    const hubspot = new HubSpotAPI();
    
    // Search for meetings with specific keywords from Dec 2025
    const searchTerms = [
      'Kane Cutler',
      'Centuri', 
      'Maze',
      'Will Patterson'
    ];
    
    console.log('📋 Searching for meetings with these keywords:');
    searchTerms.forEach(term => console.log(`   - "${term}"`));
    console.log();
    
    for (const searchTerm of searchTerms) {
      console.log(`🔍 Searching for: "${searchTerm}"`);
      
      try {
        const response = await hubspot.client.post('/crm/v3/objects/meetings/search', {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'hs_meeting_title',
                  operator: 'CONTAINS_TOKEN',
                  value: searchTerm
                }
              ]
            }
          ],
          properties: ['hs_meeting_title', 'hs_meeting_start_time', 'hs_createdate'],
          limit: 10
        });
        
        const meetings = response.data.results || [];
        console.log(`   📊 Found ${meetings.length} meetings:`);
        
        meetings.forEach((meeting, index) => {
          const title = meeting.properties.hs_meeting_title || 'No title';
          const startTime = meeting.properties.hs_meeting_start_time;
          const createDate = meeting.properties.hs_createdate;
          
          const startDate = startTime ? new Date(parseInt(startTime)).toISOString().split('T')[0] : 'No date';
          const createdDate = createDate ? new Date(createDate).toISOString().split('T')[0] : 'No date';
          
          console.log(`   ${index + 1}. "${title}"`);
          console.log(`      📅 Meeting: ${startDate} | Created: ${createdDate} | ID: ${meeting.id}`);
        });
        
        console.log();
        
      } catch (error) {
        console.log(`   ❌ Search failed: ${error.response?.status} - ${error.message}`);
        console.log();
      }
    }
    
    console.log('💡 QUICK VERIFICATION:');
    console.log('1. If you see meetings with correct titles → Migration worked, search should work');
    console.log('2. If you see "Attio Call" generic titles → Migration has title extraction bugs'); 
    console.log('3. If you see no meetings → Meetings not created or search not working');
    console.log('4. Check HubSpot directly with the meeting IDs shown above');
    
  } catch (error) {
    console.error('❌ Quick search failed:', error.message);
  }
}

quickSearch().catch(console.error);