// Simple test to verify activities exist for Bain Capital company
// This will help us understand if the issue is in our code or data availability

const { DealEngagementAssociationBackfill } = require('./src/deal-engagement-association-backfill');

async function testCompanyActivities() {
  console.log('🔍 Testing Company Activities Access');
  console.log('====================================');
  
  const backfill = new (class extends DealEngagementAssociationBackfill {
    constructor() {
      super(true); // dry run mode
    }
  })();
  
  const companyId = 312030522564; // Bain Capital
  console.log(`🏢 Testing company ${companyId}...`);
  
  // Test the exact method the backfill script uses
  try {
    const engagements = await backfill.getEngagementsForObject(companyId, 'companies');
    console.log(`📊 Total engagements found: ${engagements.length}`);
    
    if (engagements.length > 0) {
      console.log('📝 Found engagements:');
      engagements.forEach((eng, i) => {
        console.log(`   ${i+1}. Type: ${eng.engagementType}, ID: ${eng.id}, Created: ${eng.createdAt}`);
      });
    } else {
      console.log('❌ No engagements found through API');
    }
  } catch (error) {
    console.log(`❌ Error getting engagements: ${error.message}`);
  }
  
  // Test individual engagement types
  const engagementTypes = ['meetings', 'calls', 'notes', 'emails', 'tasks'];
  
  for (const engagementType of engagementTypes) {
    try {
      console.log(`\n🔍 Testing ${engagementType} specifically...`);
      const associations = await backfill.getAssociatedObjects(companyId, 'companies', engagementType);
      console.log(`   Found ${associations.length} ${engagementType}`);
      
      if (associations.length > 0) {
        console.log(`   📋 Sample ${engagementType}:`);
        associations.slice(0, 2).forEach((assoc, i) => {
          console.log(`   ${i+1}. ID: ${assoc.id}`);
          if (assoc.properties) {
            console.log(`      Properties: ${Object.keys(assoc.properties).join(', ')}`);
          }
        });
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

testCompanyActivities().catch(console.error);