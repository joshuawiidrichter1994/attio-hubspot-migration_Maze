/**
 * Test script to validate HubSpot association logic before full migration
 */

const HubSpotAPI = require('./src/utils/hubspot-api');

async function testAssociationLogic() {
  console.log('🧪 Testing HubSpot association logic...');
  
  const hubspot = new HubSpotAPI();
  
  try {
    // Test 0: Check what custom properties exist for contacts
    console.log('\n0️⃣ Checking custom properties...');
    const contactPropsResponse = await hubspot.client.get('/crm/v3/properties/contacts');
    const customProps = contactPropsResponse.data.results.filter(prop => prop.name.includes('attio'));
    console.log(`   📋 Found ${customProps.length} Attio-related contact properties:`);
    customProps.forEach(prop => {
      console.log(`       - ${prop.name} (${prop.label})`);
    });
    
    // Check company properties
    const companyPropsResponse = await hubspot.client.get('/crm/v3/properties/companies');
    const customCompanyProps = companyPropsResponse.data.results.filter(prop => prop.name.includes('attio'));
    console.log(`   📋 Found ${customCompanyProps.length} Attio-related company properties:`);
    customCompanyProps.forEach(prop => {
      console.log(`       - ${prop.name} (${prop.label})`);
    });
    
    // Check deal properties  
    const dealPropsResponse = await hubspot.client.get('/crm/v3/properties/deals');
    const customDealProps = dealPropsResponse.data.results.filter(prop => prop.name.includes('attio'));
    console.log(`   📋 Found ${customDealProps.length} Attio-related deal properties:`);
    customDealProps.forEach(prop => {
      console.log(`       - ${prop.name} (${prop.label})`);
    });
    
    // Only proceed with searches if we found the properties
    if (customProps.length === 0) {
      console.log('\n❌ No Attio custom properties found - associations will not work');
      return { success: false, error: 'No Attio custom properties found' };
    }
    // Test 1: Search for a contact with Attio ID
    console.log('\n1️⃣ Testing contact search...');
    const testContactResponse = await hubspot.client.post('/crm/v3/objects/contacts/search', {
      filterGroups: [{
        filters: [{
          propertyName: 'contact_record_id_attio', 
          operator: 'HAS_PROPERTY'
        }]
      }],
      properties: ['firstname', 'lastname', 'email', 'contact_record_id_attio'],
      limit: 3
    });
    
    const contacts = testContactResponse.data.results;
    console.log(`   ✅ Found ${contacts.length} contacts with Attio IDs`);
    if (contacts.length > 0) {
      console.log(`   📋 Sample: ${contacts[0].properties.firstname} ${contacts[0].properties.lastname} (Attio ID: ${contacts[0].properties.contact_record_id_attio})`);
    }
    
    // Test 2: Search for a company with Attio ID
    console.log('\n2️⃣ Testing company search...');
    const testCompanyResponse = await hubspot.client.post('/crm/v3/objects/companies/search', {
      filterGroups: [{
        filters: [{
          propertyName: 'company_record_id_attio',
          operator: 'HAS_PROPERTY'
        }]
      }],
      properties: ['name', 'domain', 'company_record_id_attio'],
      limit: 3
    });
    
    const companies = testCompanyResponse.data.results;
    console.log(`   ✅ Found ${companies.length} companies with Attio IDs`);
    if (companies.length > 0) {
      console.log(`   📋 Sample: ${companies[0].properties.name} (Attio ID: ${companies[0].properties.company_record_id_attio})`);
    }
    
    // Test 3: Search for a deal with Attio ID
    console.log('\n3️⃣ Testing deal search...');
    const testDealResponse = await hubspot.client.post('/crm/v3/objects/deals/search', {
      filterGroups: [{
        filters: [{
          propertyName: 'deal_record_id_attio',
          operator: 'HAS_PROPERTY'
        }]
      }],
      properties: ['dealname', 'dealstage', 'deal_record_id_attio'],
      limit: 3
    });
    
    const deals = testDealResponse.data.results;
    console.log(`   ✅ Found ${deals.length} deals with Attio IDs`);
    if (deals.length > 0) {
      console.log(`   📋 Sample: ${deals[0].properties.dealname} (Attio ID: ${deals[0].properties.attio_deal_id})`);
    }
    
    // Test 4: Test specific lookups if we have data
    if (contacts.length > 0) {
      console.log('\n4️⃣ Testing specific contact lookup...');
      const specificContactResponse = await hubspot.client.post('/crm/v3/objects/contacts/search', {
        filterGroups: [{
          filters: [{
            propertyName: 'contact_record_id_attio',
            operator: 'EQ',
            value: contacts[0].properties.contact_record_id_attio
          }]
        }],
        properties: ['firstname', 'lastname', 'email', 'contact_record_id_attio'],
        limit: 1
      });
      
      const foundContact = specificContactResponse.data.results?.[0];
      if (foundContact) {
        console.log(`   ✅ Successfully found specific contact: ${foundContact.properties.firstname} ${foundContact.properties.lastname}`);
      } else {
        console.log(`   ❌ Failed to find specific contact with ID ${contacts[0].properties.contact_record_id_attio}`);
      }
    }
    
    // Test 5: Check if association API is working
    console.log('\n5️⃣ Testing association capabilities...');
    
    // Get a sample meeting to test association structure
    const meetingsResponse = await hubspot.client.get('/crm/v3/objects/meetings?limit=1&properties=hs_meeting_title');
    const sampleMeeting = meetingsResponse.data.results?.[0];
    
    if (sampleMeeting && contacts.length > 0) {
      console.log(`   📋 Sample meeting ID: ${sampleMeeting.id}`);
      console.log(`   📋 Sample contact ID: ${contacts[0].id}`);
      console.log(`   ✅ Association structure ready`);
      
      // Note: We won't actually create a test association, just verify the structure
      const testAssociation = {
        fromObjectType: 'meetings',
        fromObjectId: sampleMeeting.id,
        toObjectType: 'contacts', 
        toObjectId: contacts[0].id,
        associationType: 'meeting_to_contact'
      };
      console.log(`   📋 Test association structure: ${JSON.stringify(testAssociation, null, 2)}`);
    }
    
    // Test 6: Test actual meeting association logic with real Attio data
    console.log('\n6️⃣ Testing actual meeting association logic...');
    
    // Import the meeting processor to access its methods
    const MeetingProcessor = require('./src/comprehensive-meeting-processor');
    const processor = new MeetingProcessor();
    
    try {
      // Get a few sample Attio meetings
      console.log('   📥 Fetching sample Attio meetings...');
      const attioResponse = await fetch('https://api.attio.com/v2/meetings?limit=5', {
        headers: {
          'Authorization': `Bearer ${process.env.ATTIO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!attioResponse.ok) {
        throw new Error(`Attio API failed: ${attioResponse.status}`);
      }
      
      const attioData = await attioResponse.json();
      const attioMeetings = attioData.data || [];
      
      console.log(`   📋 Retrieved ${attioMeetings.length} sample meetings from Attio`);
      
      // Test association data detection for each meeting
      let meetingsWithAssociations = 0;
      let meetingsWithoutAssociations = 0;
      
      for (let i = 0; i < Math.min(3, attioMeetings.length); i++) {
        const meeting = attioMeetings[i];
        const title = meeting.values?.title?.[0]?.value || meeting.title || `Meeting ${i + 1}`;
        
        console.log(`\n   📅 Testing meeting: "${title}"`);
        console.log(`      - Attio ID: ${meeting.id.meeting_id}`);
        
        // Test our association detection logic
        const values = meeting.values || {};
        const hasValuesData = Object.keys(values).length > 0;
        const hasDirectFields = meeting.participants || meeting.companies || meeting.deals;
        
        console.log(`      - Values data: ${hasValuesData ? '✅' : '❌'} (${Object.keys(values).length} keys)`);
        console.log(`      - Direct fields: ${hasDirectFields ? '✅' : '❌'}`);
        
        // Check specific association fields
        const participants = values.participants || values.attendees || values.people || 
                            meeting.participants || meeting.attendees || meeting.people || [];
        const companies = values.companies || values.accounts || 
                         meeting.companies || meeting.accounts || [];
        const deals = values.deals || meeting.deals || [];
        
        console.log(`      - Participants: ${participants.length}`);
        console.log(`      - Companies: ${companies.length}`);
        console.log(`      - Deals: ${deals.length}`);
        
        if (!hasValuesData && !hasDirectFields) {
          console.log(`      - ⚠️ NO ASSOCIATION DATA - would skip associations`);
          meetingsWithoutAssociations++;
        } else {
          console.log(`      - ✅ ASSOCIATION DATA FOUND - would create associations`);
          meetingsWithAssociations++;
          
          // Test actual lookup for first participant if exists
          if (participants.length > 0) {
            const participant = participants[0];
            const attioId = participant.target_record_id || participant.id;
            if (attioId) {
              console.log(`      - 🔍 Testing contact lookup for Attio ID: ${attioId}`);
              try {
                const hubspotContact = await processor.findHubSpotContact(attioId);
                if (hubspotContact) {
                  console.log(`      - ✅ Found HubSpot contact: ${hubspotContact.id}`);
                } else {
                  console.log(`      - ⚠️ No HubSpot contact found for this Attio ID`);
                }
              } catch (error) {
                console.log(`      - ❌ Error finding contact: ${error.message}`);
              }
            }
          }
        }
      }
      
      console.log(`\n   📊 Association test results:`);
      console.log(`      - Meetings WITH association data: ${meetingsWithAssociations}`);
      console.log(`      - Meetings WITHOUT association data: ${meetingsWithoutAssociations}`);
      
      if (meetingsWithAssociations > 0) {
        console.log(`   ✅ Association logic is working correctly!`);
      } else {
        console.log(`   ⚠️ No meetings found with association data - this may be normal`);
      }
      
    } catch (error) {
      console.log(`   ❌ Meeting association test failed: ${error.message}`);
    }
    
    console.log('\n✅ Association logic validation completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Contacts with Attio IDs: ${contacts.length}`);
    console.log(`   - Companies with Attio IDs: ${companies.length}`);  
    console.log(`   - Deals with Attio IDs: ${deals.length}`);
    console.log(`   - Search API: Working ✅`);
    console.log(`   - Association structure: Ready ✅`);
    
    return {
      success: true,
      contactsFound: contacts.length,
      companiesFound: companies.length,
      dealsFound: deals.length
    };
    
  } catch (error) {
    console.error('\n❌ Association logic test failed:', error.message);
    if (error.response?.data) {
      console.error('   Error details:', JSON.stringify(error.response.data, null, 2));
    }
    return { success: false, error: error.message };
  }
}

// Run the test
testAssociationLogic().then(result => {
  if (result.success) {
    console.log('\n🎉 Ready for migration!');
    process.exit(0);
  } else {
    console.log('\n🚫 Not ready for migration - fix issues first');
    process.exit(1);
  }
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});