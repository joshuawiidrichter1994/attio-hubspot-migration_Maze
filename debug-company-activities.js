const HubSpotAPI = require('./src/utils/hubspot-api');

async function debugCompanyActivities() {
  console.log('🔍 Debug Company Activities');
  console.log('============================');
  
  const hubspot = new HubSpotAPI();
  const companyId = 312030522564; // Bain Capital company
  
  console.log(`🏢 Checking activities for company ${companyId}...`);
  
  const engagementTypes = ['meetings', 'calls', 'notes', 'emails', 'tasks'];
  
  for (const engagementType of engagementTypes) {
    try {
      console.log(`\n📋 Checking ${engagementType}...`);
      
      // Check if company has any associations to this engagement type
      const associations = await hubspot.getAssociatedObjects(companyId, 'companies', engagementType);
      console.log(`   Found ${associations.length} ${engagementType}`);
      
      if (associations.length > 0) {
        console.log(`   📝 Details of first ${Math.min(3, associations.length)} ${engagementType}:`);
        for (let i = 0; i < Math.min(3, associations.length); i++) {
          const engagement = associations[i];
          console.log(`   ${i+1}. ID: ${engagement.id}, Created: ${engagement.createdAt || 'N/A'}`);
          console.log(`      Properties:`, Object.keys(engagement.properties || {}));
        }
      }
    } catch (error) {
      console.log(`   ❌ Error checking ${engagementType}: ${error.message}`);
    }
  }
  
  // Also check if these activities are already associated with the deal
  const dealId = 390472669398;
  console.log(`\n🎯 Checking if deal ${dealId} already has activities...`);
  
  for (const engagementType of engagementTypes) {
    try {
      const dealAssociations = await hubspot.getAssociatedObjects(dealId, 'deals', engagementType);
      console.log(`   Deal has ${dealAssociations.length} ${engagementType}`);
    } catch (error) {
      console.log(`   ❌ Error checking deal ${engagementType}: ${error.message}`);
    }
  }
}

debugCompanyActivities().catch(console.error);