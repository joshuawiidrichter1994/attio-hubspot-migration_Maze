const HubSpotAPI = require('./src/utils/hubspot-api.js');

class AssociationCleanup {
  constructor() {
    this.hubspot = new HubSpotAPI();
  }

  async cleanupIncorrectAssociations() {
    console.log('🧹 Cleaning up incorrect associations created by the script...');

    // These are the exact meeting/call IDs from the log output that were incorrectly associated
    const incorrectAssociations = [
      // Cohere Health (9 meetings)
      { type: 'meetings', id: '385736482008' },
      { type: 'meetings', id: '385945185527' },
      { type: 'meetings', id: '385945254085' },
      { type: 'meetings', id: '385950801141' },
      { type: 'meetings', id: '386237013178' },
      { type: 'meetings', id: '386241328344' },
      { type: 'meetings', id: '386422718708' },
      { type: 'meetings', id: '386431632596' },
      { type: 'meetings', id: '386109280467' },

      // Verizon (1 meeting)
      { type: 'meetings', id: '386217958648' },

      // JP Morgan (1 meeting)
      { type: 'meetings', id: '386659216579' },

      // ITC Infotech (2 meetings)
      { type: 'meetings', id: '386094829770' },
      { type: 'meetings', id: '386105684184' },

      // Moss (3 meetings)
      { type: 'meetings', id: '385964079351' },
      { type: 'meetings', id: '386677312730' },
      { type: 'meetings', id: '386702943459' },

      // Gymshark (2 meetings + 2 emails)
      { type: 'meetings', id: '385963896000' },
      { type: 'meetings', id: '386609136843' },
      { type: 'emails', id: '384899805389' },
      { type: 'emails', id: '391786971378' },

      // Minima (2 meetings)
      { type: 'meetings', id: '385964103908' },
      { type: 'meetings', id: '386417717478' },

      // Bain Capital test (11 meetings + 1 call) - the most recent ones
      { type: 'meetings', id: '385863677138' },
      { type: 'meetings', id: '386098751726' },
      { type: 'meetings', id: '386218096834' },
      { type: 'meetings', id: '386222177475' },
      { type: 'meetings', id: '386222549236' },
      { type: 'meetings', id: '386237113541' },
      { type: 'meetings', id: '386466775286' },
      { type: 'meetings', id: '386483110124' },
      { type: 'meetings', id: '386486751473' },
      { type: 'meetings', id: '386529690811' },
      { type: 'meetings', id: '386719240419' },
      { type: 'calls', id: '387139172593' }
    ];

    const dealIds = [
      '388208250069', // Cohere Health
      '388208250070', // Verizon - Full Solution
      '388208250071', // JP Morgan - Full Solution
      '388208250072', // ITC Infotech
      '388208250073', // Moss - Full Solution
      '388467508452', // Gymshark
      '388467508454', // Minima - Full Solution
      '390472669398'  // Bain Capital - Full Solution
    ];

    console.log(`Found ${incorrectAssociations.length} associations to remove from ${dealIds.length} deals`);

    let removedCount = 0;
    let errorCount = 0;

    // Remove associations from each deal
    for (const dealId of dealIds) {
      console.log(`\n🔧 Cleaning deal ${dealId}...`);
      
      try {
        // Get current associations for this deal
        const meetingAssocs = await this.hubspot.client.get(`/crm/v4/objects/deals/${dealId}/associations/meetings`);
        const callAssocs = await this.hubspot.client.get(`/crm/v4/objects/deals/${dealId}/associations/calls`);
        const emailAssocs = await this.hubspot.client.get(`/crm/v4/objects/deals/${dealId}/associations/emails`);

        const currentMeetings = meetingAssocs.data?.results || [];
        const currentCalls = callAssocs.data?.results || [];
        const currentEmails = emailAssocs.data?.results || [];

        console.log(`   Found ${currentMeetings.length} meeting, ${currentCalls.length} call, ${currentEmails.length} email associations`);

        // Remove each incorrect association
        for (const assoc of incorrectAssociations) {
          const isAssociated = 
            (assoc.type === 'meetings' && currentMeetings.some(m => m.id === assoc.id)) ||
            (assoc.type === 'calls' && currentCalls.some(c => c.id === assoc.id)) ||
            (assoc.type === 'emails' && currentEmails.some(e => e.id === assoc.id));

          if (isAssociated) {
            try {
              await this.hubspot.client.delete(`/crm/v4/objects/deals/${dealId}/associations/${assoc.type}/${assoc.id}`);
              console.log(`   ✅ Removed ${assoc.type} ${assoc.id}`);
              removedCount++;
            } catch (error) {
              console.log(`   ❌ Failed to remove ${assoc.type} ${assoc.id}: ${error.message}`);
              errorCount++;
            }
          }
        }

      } catch (error) {
        console.log(`   ❌ Error accessing deal ${dealId}: ${error.message}`);
        errorCount++;
      }

      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n📊 Cleanup Summary:`);
    console.log(`Associations removed: ${removedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('\n✅ Cleanup completed!');
  }
}

async function main() {
  const cleanup = new AssociationCleanup();
  try {
    await cleanup.cleanupIncorrectAssociations();
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = AssociationCleanup;