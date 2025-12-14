require('dotenv').config();
const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor');

async function testExactMigrationPath() {
  console.log('🔍 Testing EXACT migration path that will be used...');
  
  const processor = new ComprehensiveMeetingProcessor();
  
  try {
    const testMeetingId = '386986078416';
    const testCompanyId = '312660248790';
    
    console.log(`\n📋 Testing the exact same code path as migration:`);
    console.log(`Meeting ID: ${testMeetingId}`);
    console.log(`Company ID: ${testCompanyId}`);
    
    // Check current state BEFORE
    console.log('\n🔍 BEFORE - Current associations...');
    const before = await processor.hubspot.client.get(
      `/crm/v3/objects/meetings/${testMeetingId}`,
      { params: { associations: 'companies' } }
    );
    const companiesBefore = before.data?.associations?.companies?.results || [];
    console.log(`Companies BEFORE: ${companiesBefore.length} (${companiesBefore.map(c => c.id).join(', ')})`);
    
    // Create associations using the EXACT same method as the migration
    console.log('\n🚀 Using EXACT migration method: processor.hubspot.batchCreateAssociations()...');
    
    const associations = [{
      fromObjectType: 'meetings',
      fromObjectId: testMeetingId,
      toObjectType: 'companies',
      toObjectId: testCompanyId,
      associationTypeId: processor.ASSOCIATION_TYPE_IDS.meeting_to_company // Using the exact constant
    }];
    
    console.log('Association object:', JSON.stringify(associations[0], null, 2));
    console.log(`Association type ID used: ${processor.ASSOCIATION_TYPE_IDS.meeting_to_company}`);
    
    // Call the EXACT same method that the migration calls
    const result = await processor.hubspot.batchCreateAssociations(associations);
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // Wait for processing
    console.log('\n⏳ Waiting 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check AFTER
    console.log('\n🔍 AFTER - Verifying associations...');
    const after = await processor.hubspot.client.get(
      `/crm/v3/objects/meetings/${testMeetingId}`,
      { params: { associations: 'companies' } }
    );
    const companiesAfter = after.data?.associations?.companies?.results || [];
    console.log(`Companies AFTER: ${companiesAfter.length} (${companiesAfter.map(c => c.id).join(', ')})`);
    
    // Final verdict
    const hasSuccessResult = result.some(r => r.success && r.status === 'COMPLETE');
    const associationExists = companiesAfter.some(c => c.id === testCompanyId);
    
    if (hasSuccessResult && associationExists) {
      console.log('\n🎉 CONFIRMED SUCCESS!');
      console.log('✅ The EXACT migration code path works!');
      console.log('✅ processor.hubspot.batchCreateAssociations() is working');
      console.log('✅ Association type IDs are correct');
      console.log('✅ V4 API is functioning properly');
      console.log('\n🚀 MIGRATION IS SAFE TO RUN!');
    } else {
      console.log('\n❌ FAILURE - Migration path is not working');
      console.log('🚨 DO NOT RUN MIGRATION');
      console.log(`Success result: ${hasSuccessResult}`);
      console.log(`Association exists: ${associationExists}`);
    }
    
  } catch (error) {
    console.error('\n❌ ERROR in migration path test:', error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('\n🚨 DO NOT RUN MIGRATION - Fix this error first');
  }
}

if (require.main === module) {
  testExactMigrationPath();
}