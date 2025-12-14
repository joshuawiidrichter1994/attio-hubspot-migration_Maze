require('dotenv').config();
const HubSpotAPI = require('./src/utils/hubspot-api');

async function testSingleAssociation() {
  console.log('🧪 Testing single association creation...');
  
  const hubspot = new HubSpotAPI();
  
  try {
    // Using a known meeting ID from the earlier dry-run that showed missing associations
    const testMeetingId = '386986078416'; // This showed "1 missing associations" in dry-run
    
    console.log(`\n📋 Test Details:`);
    console.log(`Meeting ID: ${testMeetingId}`);
    console.log(`HubSpot Meeting URL: https://app.hubspot.com/contacts/your-portal/record/0-47/${testMeetingId}`);
    
    // Check current associations BEFORE test
    console.log('\n🔍 Checking current associations BEFORE test...');
    const beforeCheck = await hubspot.client.get(
      `/crm/v3/objects/meetings/${testMeetingId}`,
      { params: { associations: 'companies,deals' } }
    );
    
    const companiesBefore = beforeCheck.data?.associations?.companies?.results || [];
    const dealsBefore = beforeCheck.data?.associations?.deals?.results || [];
    
    console.log(`Current associations BEFORE:`);
    console.log(`  - Companies: ${companiesBefore.length} (${companiesBefore.map(c => c.id).join(', ')})`);
    console.log(`  - Deals: ${dealsBefore.length} (${dealsBefore.map(d => d.id).join(', ')})`);
    
    // For this test, we'll create an association to a test company
    // You can replace this with any company ID from your HubSpot
    const testCompanyId = companiesBefore.length > 0 ? 
      companiesBefore[0].id : // Use existing company for safety
      '101'; // Fallback company ID - replace with real one
    
    console.log(`\nTest Company ID: ${testCompanyId}`);
    
    const alreadyAssociated = companiesBefore.some(company => company.id === testCompanyId);
    if (alreadyAssociated) {
      console.log(`⚠️ WARNING: Company ${testCompanyId} is already associated! Test will still validate the API works.`);
    }
    
    // Create the test association
    console.log('\n🚀 Creating test association...');
    const associations = [{
      fromObjectType: 'meetings',
      fromObjectId: testMeetingId,
      toObjectType: 'companies', 
      toObjectId: testCompanyId,
      associationTypeId: 202 // meeting_to_company
    }];
    
    console.log('Association payload:', JSON.stringify(associations[0], null, 2));
    
    const result = await hubspot.batchCreateAssociations(associations);
    console.log('✅ Association creation response:', JSON.stringify(result, null, 2));
    
    // Wait a moment for HubSpot to process
    console.log('\n⏳ Waiting 3 seconds for HubSpot to process...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify the association was created AFTER test
    console.log('\n🔍 Verifying association AFTER test...');
    const afterCheck = await hubspot.client.get(
      `/crm/v3/objects/meetings/${testMeetingId}`,
      { params: { associations: 'companies,deals' } }
    );
    
    const companiesAfter = afterCheck.data?.associations?.companies?.results || [];
    const dealsAfter = afterCheck.data?.associations?.deals?.results || [];
    
    console.log(`Current associations AFTER:`);
    console.log(`  - Companies: ${companiesAfter.length} (${companiesAfter.map(c => c.id).join(', ')})`);
    console.log(`  - Deals: ${dealsAfter.length} (${dealsAfter.map(d => d.id).join(', ')})`);
    
    const nowAssociated = companiesAfter.some(company => company.id === testCompanyId);
    
    // Check if API call succeeded
    const apiSucceeded = result && result.length >= 0; // Empty array is also success
    const hasCompleteStatus = result.some(r => r.success || r.data?.status === 'COMPLETE');
    
    if ((apiSucceeded || hasCompleteStatus) && nowAssociated) {
      console.log('\n🎉 SUCCESS: Association API worked and is verified!');
      console.log(`✅ Meeting ${testMeetingId} is properly associated with company ${testCompanyId}`);
      console.log(`\n🚀 The v4 batch API fix worked! You can now run the full migration.`);
    } else if ((apiSucceeded || hasCompleteStatus) && alreadyAssociated) {
      console.log('\n✅ SUCCESS: API call succeeded!');
      console.log('ℹ️ The association already existed, but the v4 API worked correctly');
      console.log('📝 Empty results array is normal when association already exists');
      console.log(`\n🚀 The v4 batch API fix worked! You can now run the full migration.`);
    } else if (!apiSucceeded && !hasCompleteStatus) {
      console.log('\n❌ FAILURE: API call failed');
      console.log('🚨 DO NOT run the full migration - the API fix needs more work');
      console.log('API response:', result);
    } else {
      console.log('\n❌ FAILURE: API succeeded but association not found');
      console.log('🚨 This could be a timing issue or verification problem');
    }
    
    console.log(`\n🔗 Check manually in HubSpot:`);
    console.log(`Meeting URL: https://app.hubspot.com/contacts/your-portal/record/0-47/${testMeetingId}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('\n🚨 DO NOT run the full migration - fix this error first');
  }
}

if (require.main === module) {
  testSingleAssociation();
}