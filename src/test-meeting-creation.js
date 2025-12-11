const HubSpotAPI = require('./utils/hubspot-api');

/**
 * Test creating a simple meeting to understand HubSpot's requirements
 */
async function testMeetingCreation() {
  console.log('🧪 TESTING HUBSPOT MEETING CREATION...\n');
  
  const hubspot = new HubSpotAPI();
  
  // Test 1: Minimal meeting creation
  console.log('📝 Test 1: Creating minimal meeting...');
  try {
    const minimalMeeting = await hubspot.client.post('/crm/v3/objects/meetings', {
      properties: {
        hs_meeting_title: 'Test Meeting - ' + new Date().toISOString(),
        hs_meeting_start_time: Date.now(),
        hs_meeting_end_time: Date.now() + (60 * 60 * 1000),
        hs_meeting_outcome: 'COMPLETED'
      }
    });
    
    console.log('✅ Minimal meeting created successfully!');
    console.log(`   Meeting ID: ${minimalMeeting.data.id}`);
    console.log(`   Title: ${minimalMeeting.data.properties?.hs_meeting_title}`);
    
    // Clean up - delete the test meeting
    try {
      await hubspot.client.delete(`/crm/v3/objects/meetings/${minimalMeeting.data.id}`);
      console.log('🗑️  Test meeting deleted');
    } catch (deleteError) {
      console.log('⚠️  Could not delete test meeting:', deleteError.message);
    }
    
  } catch (error) {
    console.error('❌ Minimal meeting creation failed:');
    console.error(`   Status: ${error.response?.status}`);
    console.error(`   Message: ${error.response?.data?.message}`);
    console.error(`   Details: ${JSON.stringify(error.response?.data, null, 2)}`);
  }
  
  // Test 2: Check available meeting properties
  console.log('\n🔍 Test 2: Checking available meeting properties...');
  try {
    const propertiesResponse = await hubspot.client.get('/crm/v3/properties/meetings');
    const properties = propertiesResponse.data.results;
    
    console.log(`Found ${properties.length} available meeting properties:`);
    
    // Show key properties
    const keyProperties = properties.filter(prop => 
      prop.name.includes('meeting') || 
      prop.name.includes('attio') || 
      prop.name === 'hs_meeting_title' ||
      prop.name === 'hs_meeting_body' ||
      prop.name === 'hs_meeting_start_time' ||
      prop.name === 'hs_meeting_end_time' ||
      prop.name === 'hs_meeting_outcome' ||
      prop.name === 'hs_meeting_source' ||
      prop.name === 'hs_meeting_type'
    );
    
    console.log('\n📋 Key meeting properties:');
    keyProperties.forEach(prop => {
      console.log(`   - ${prop.name}: ${prop.label} (${prop.type}, required: ${prop.hasUniqueValue})`);
    });
    
    // Check for custom Attio properties
    const attioProperties = properties.filter(prop => 
      prop.name.includes('attio')
    );
    
    if (attioProperties.length > 0) {
      console.log('\n🔗 Found Attio-related properties:');
      attioProperties.forEach(prop => {
        console.log(`   - ${prop.name}: ${prop.label}`);
      });
    } else {
      console.log('\n⚠️  No Attio-related custom properties found');
    }
    
  } catch (error) {
    console.error('❌ Failed to fetch meeting properties:', error.message);
  }
  
  // Test 3: Try creating meeting with only validated properties
  console.log('\n📝 Test 3: Creating meeting with standard properties only...');
  try {
    const standardMeeting = await hubspot.client.post('/crm/v3/objects/meetings', {
      properties: {
        hs_meeting_title: 'Attio Call Recording - December 8, 2025',
        hs_meeting_body: 'Test meeting created from Attio video processing pipeline.',
        hs_meeting_start_time: Date.now(),
        hs_meeting_end_time: Date.now() + (60 * 60 * 1000),
        hs_meeting_outcome: 'COMPLETED'
      }
    });
    
    console.log('✅ Standard meeting created successfully!');
    console.log(`   Meeting ID: ${standardMeeting.data.id}`);
    
    // Clean up
    try {
      await hubspot.client.delete(`/crm/v3/objects/meetings/${standardMeeting.data.id}`);
      console.log('🗑️  Test meeting deleted');
    } catch (deleteError) {
      console.log('⚠️  Could not delete test meeting:', deleteError.message);
    }
    
  } catch (error) {
    console.error('❌ Standard meeting creation failed:');
    console.error(`   Status: ${error.response?.status}`);
    console.error(`   Message: ${error.response?.data?.message}`);
    console.error(`   Details: ${JSON.stringify(error.response?.data, null, 2)}`);
  }
}

// Run the test
if (require.main === module) {
  testMeetingCreation()
    .then(() => {
      console.log('\n✅ Meeting creation test completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Meeting creation test failed:', error.message);
      process.exit(1);
    });
}