const HubSpotAPI = require('./utils/hubspot-api');
const fs = require('fs');
const path = require('path');

class DealEngagementAssociationBackfill {
    /**
     * Fetch a single deal by ID from HubSpot
     */
    async fetchDealById(dealId) {
      const url = `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,amount,attio_deal_id`;
      const response = await this.hubspot.client.get(url);
      return response.data;
    }
  constructor(dryRun = false) {
    this.hubspot = new HubSpotAPI();
    this.dryRun = dryRun;
    
    // Association type IDs for engagements to deals
    this.ENGAGEMENT_TO_DEAL_ASSOCIATIONS = {
      meeting_to_deal: 204,  // Correct according to working comprehensive-meeting-processor.js
      call_to_deal: 206,     // Fixed: was 224, now correct according to docs
      note_to_deal: 214,     // Correct according to HubSpot docs  
      email_to_deal: 210,    // Correct according to HubSpot docs
      task_to_deal: 216      // Correct according to HubSpot docs
    };
    
    // Statistics tracking
    this.stats = {
      dealsProcessed: 0,
      companiesFound: 0,
      contactsFound: 0,
      engagementsFound: {
        meetings: 0,
        calls: 0,
        notes: 0,
        emails: 0,
        tasks: 0
      },
      associationsCreated: {
        meetings: 0,
        calls: 0,
        notes: 0,
        emails: 0,
        tasks: 0
      },
      associationsAlreadyExisting: 0,
      errors: 0
    };
    
    this.logFile = `data/logs/deal-engagement-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
    
    // Also write to file
    fs.appendFileSync(this.logFile, logMessage + '\n');
  }

  /**
   * Main entry point - process all deals or deals from a specific cutoff date
   */
  async backfillDealEngagementAssociations(cutoffDate = null) {
    this.log(`🚀 Starting Deal Engagement Association Backfill (DRY RUN: ${this.dryRun})`);
    
    if (cutoffDate) {
      this.log(`📅 Processing deals created/updated after: ${cutoffDate}`);
    } else {
      this.log(`📅 Processing ALL deals`);
    }

    try {
      // Step 1: Get all deals (or filtered by cutoff date)
      const deals = await this.getDealsToProcess(cutoffDate);
      this.log(`📊 Found ${deals.length} deals to process`);

      // Step 2: Process each deal
      for (let i = 0; i < deals.length; i++) {
        const deal = deals[i];
        this.log(`\n📋 Processing deal ${i + 1}/${deals.length}: ${deal.properties?.dealname || 'Untitled'} (ID: ${deal.id})`);
        
        try {
          await this.processDeal(deal);
          this.stats.dealsProcessed++;
        } catch (error) {
          this.log(`❌ Error processing deal ${deal.id}: ${error.message}`, 'ERROR');
          this.stats.errors++;
        }

        // Rate limiting
        if (i % 10 === 0 && i > 0) {
          this.log(`⏱️  Processed ${i} deals, pausing briefly...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Step 3: Final statistics
      this.logFinalStatistics();

    } catch (error) {
      this.log(`❌ Fatal error in backfill process: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  /**
   * Get deals to process, optionally filtered by cutoff date
   */
  async getDealsToProcess(cutoffDate = null) {
    this.log(`📥 Fetching deals from HubSpot...`);
    
    // For now, get all deals. In the future, we could add date filtering
    const allDeals = await this.hubspot.getAllDeals();
    
    if (cutoffDate) {
      // Filter deals by creation/modification date
      const cutoffTimestamp = new Date(cutoffDate).getTime();
      return allDeals.filter(deal => {
        const createdAt = new Date(deal.createdAt).getTime();
        const updatedAt = new Date(deal.updatedAt).getTime();
        return Math.max(createdAt, updatedAt) >= cutoffTimestamp;
      });
    }
    
    return allDeals;
  }

  /**
   * Process a single deal - find associated companies/contacts and their engagements
   */
  async processDeal(deal) {
    const dealId = deal.id;
    
    // Step 1: Get deal's associated companies and contacts
    const { companies, contacts } = await this.getDealAssociations(dealId);
    
    this.log(`   📈 Deal ${dealId} has ${companies.length} companies, ${contacts.length} direct contacts`);
    this.stats.companiesFound += companies.length;

    // Step 2: For each associated company, get its contacts and union them in
    const companyContactIds = new Set();
    for (const company of companies) {
      try {
        const companyContacts = await this.getCompanyContacts(company.id);
        companyContacts.forEach(contact => companyContactIds.add(contact.id));
        this.log(`   🏢 Company ${company.id} has ${companyContacts.length} contacts`);
      } catch (error) {
        this.log(`⚠️  Error getting contacts for company ${company.id}: ${error.message}`, 'WARN');
      }
    }

    // Step 3: Combine all contacts (direct + via company)
    const allContactIds = new Set([
      ...contacts.map(c => c.id),
      ...companyContactIds
    ]);
    
    this.log(`   👥 Total unique contacts: ${allContactIds.size} (${contacts.length} direct + ${companyContactIds.size} via companies)`);
    this.stats.contactsFound += allContactIds.size;

    // Step 4: Get all engagements for these companies and contacts
    const allEngagements = await this.getEngagementsForObjects(
      companies.map(c => c.id),
      Array.from(allContactIds)
    );

    this.log(`   📞 Found ${allEngagements.length} total engagements to associate`);

    // Step 5: Create associations (or log what would be created in dry run)
    if (allEngagements.length > 0) {
      await this.associateEngagementsToDeal(dealId, allEngagements);
    } else {
      this.log(`   ℹ️  No engagements found for this deal`);
    }
  }

  /**
   * Get a deal's associated companies and contacts
   */
  async getDealAssociations(dealId) {
    const [companies, contacts] = await Promise.all([
      this.getAssociatedObjects(dealId, 'deals', 'companies'),
      this.getAssociatedObjects(dealId, 'deals', 'contacts')
    ]);

    return { companies, contacts };
  }

  /**
   * Get objects associated with a given object
   */
  async getAssociatedObjects(objectId, fromObjectType, toObjectType) {
    try {
      const response = await this.hubspot.client.get(
        `/crm/v4/objects/${fromObjectType}/${objectId}/associations/${toObjectType}`
      );
      
      const results = response.data?.results || [];
      
      // Debug logging for first deal to understand structure
      if (objectId === '388208250069' && this.dryRun) {
        this.log(`🔍 DEBUG: ${fromObjectType} ${objectId} -> ${toObjectType}`);
        this.log(`🔍 DEBUG: Response structure: ${JSON.stringify(response.data, null, 2)}`);
        this.log(`🔍 DEBUG: Results: ${JSON.stringify(results, null, 2)}`);
      }
      
      // Transform results to have 'id' property expected by calling code
      return results.map(result => ({
        id: result.toObjectId,
        ...result
      }));
    } catch (error) {
      if (error.response?.status === 404) {
        return []; // No associations found
      }
      // Add debug logging for errors too
      if (objectId === '388208250069' && this.dryRun) {
        this.log(`🔍 DEBUG ERROR: ${error.message}`);
        this.log(`🔍 DEBUG ERROR: ${error.response?.status} - ${error.response?.data || 'No response data'}`);
      }
      throw error;
    }
  }

  /**
   * Get contacts associated with a company
   */
  async getCompanyContacts(companyId) {
    return this.getAssociatedObjects(companyId, 'companies', 'contacts');
  }

  /**
   * Get all engagements (meetings, calls, notes, emails, tasks) for given companies and contacts
   */
  async getEngagementsForObjects(companyIds, contactIds) {
    const allEngagements = [];

    // Get engagements for companies
    for (const companyId of companyIds) {
      const companyEngagements = await this.getEngagementsForObject(companyId, 'companies');
      allEngagements.push(...companyEngagements);
    }

    // Get engagements for contacts  
    for (const contactId of contactIds) {
      const contactEngagements = await this.getEngagementsForObject(contactId, 'contacts');
      allEngagements.push(...contactEngagements);
    }

    // Deduplicate engagements by ID
    const uniqueEngagements = {};
    allEngagements.forEach(engagement => {
      uniqueEngagements[engagement.id] = engagement;
    });

    return Object.values(uniqueEngagements);
  }

  /**
   * Get engagements associated with a specific object (company or contact)
   */
  async getEngagementsForObject(objectId, objectType) {
    const engagements = [];
    const engagementTypes = ['meetings', 'calls', 'notes', 'emails', 'tasks'];

    for (const engagementType of engagementTypes) {
      try {
        const objectEngagements = await this.getAssociatedObjects(objectId, objectType, engagementType);
        
        // Add engagement type to each object for later processing
        objectEngagements.forEach(engagement => {
          engagement.engagementType = engagementType.slice(0, -1); // Remove 's' from plural
          this.stats.engagementsFound[engagementType]++;
        });
        
        engagements.push(...objectEngagements);
      } catch (error) {
        this.log(`⚠️  Error getting ${engagementType} for ${objectType} ${objectId}: ${error.message}`, 'WARN');
      }
    }

    return engagements;
  }

  /**
   * Associate engagements to a deal
   */
  async associateEngagementsToDeal(dealId, engagements) {
    if (this.dryRun) {
      this.log(`   🧪 DRY RUN: Would associate ${engagements.length} engagements to deal ${dealId}`);
      
      // Log by engagement type
      const byType = {};
      engagements.forEach(eng => {
        byType[eng.engagementType] = (byType[eng.engagementType] || 0) + 1;
      });
      
      Object.entries(byType).forEach(([type, count]) => {
        this.log(`   🧪    ${count} ${type}s`);
        this.stats.associationsCreated[type + 's'] += count; // Add 's' back for stats
      });
      
      return;
    }

    // Check for existing associations first to avoid duplicates
    const existingAssociations = await this.getExistingDealAssociations(dealId);
    const existingEngagementIds = new Set(existingAssociations.map(assoc => assoc.id));

    // Filter out already associated engagements
    const newEngagements = engagements.filter(eng => !existingEngagementIds.has(eng.id));
    
    if (newEngagements.length === 0) {
      this.log(`   ℹ️  All ${engagements.length} engagements already associated to deal ${dealId}`);
      this.stats.associationsAlreadyExisting += engagements.length;
      return;
    }

    this.log(`   🔗 Associating ${newEngagements.length} new engagements to deal ${dealId} (${engagements.length - newEngagements.length} already associated)`);
    this.stats.associationsAlreadyExisting += (engagements.length - newEngagements.length);

    // Group by engagement type for batch processing
    const engagementsByType = {};
    newEngagements.forEach(engagement => {
      const type = engagement.engagementType;
      if (!engagementsByType[type]) {
        engagementsByType[type] = [];
      }
      engagementsByType[type].push(engagement);
    });

    // Process each engagement type
    for (const [engagementType, typeEngagements] of Object.entries(engagementsByType)) {
      try {
        await this.batchAssociateEngagementsToDeal(dealId, typeEngagements, engagementType);
        this.stats.associationsCreated[engagementType + 's'] += typeEngagements.length;
      } catch (error) {
        this.log(`❌ Error associating ${engagementType}s to deal ${dealId}: ${error.message}`, 'ERROR');
        this.stats.errors++;
      }
    }
  }

  /**
   * Get existing engagement associations for a deal
   */
  async getExistingDealAssociations(dealId) {
    const allAssociations = [];
    const engagementTypes = ['meetings', 'calls', 'notes', 'emails', 'tasks'];

    for (const engagementType of engagementTypes) {
      try {
        const associations = await this.getAssociatedObjects(dealId, 'deals', engagementType);
        allAssociations.push(...associations);
      } catch (error) {
        this.log(`⚠️  Error getting existing ${engagementType} for deal ${dealId}: ${error.message}`, 'WARN');
      }
    }

    return allAssociations;
  }

  /**
   * Batch associate engagements of a specific type to a deal
   */
  async batchAssociateEngagementsToDeal(dealId, engagements, engagementType) {
    this.log(`   🔗 Creating ${engagements.length} ${engagementType} associations...`);
    this.log(`   🐛 DEBUG: Target deal ID: ${dealId}`);
    this.log(`   🐛 DEBUG: Association type: ${engagementType}_to_deal`);
    
    // Get the correct association type ID based on documentation
    const associationTypeId = this.ENGAGEMENT_TO_DEAL_ASSOCIATIONS[`${engagementType}_to_deal`];
    if (!associationTypeId) {
      this.log(`   ❌ Unknown engagement type: ${engagementType}`, 'ERROR');
      return;
    }
    
    // Build associations array using the correct HubSpot format
    const associations = engagements.map(engagement => ({
      fromObjectType: engagementType === 'meeting' ? 'meetings' : `${engagementType}s`,
      fromObjectId: parseInt(engagement.id),
      toObjectType: 'deals',
      toObjectId: parseInt(dealId),
      associationTypeId: associationTypeId
    }));
    
    this.log(`   🐛 DEBUG: Creating associations with type ID ${associationTypeId} for ${associations.length} ${engagementType}s`);
    
    try {
      const result = await this.hubspot.batchCreateAssociations(associations);
      this.log(`   ✅ Successfully created ${associations.length} ${engagementType} associations to deal ${dealId}`);
      this.log(`   🐛 DEBUG: Batch association result:`, result);
    } catch (error) {
      this.log(`   ❌ Failed to batch associate ${engagementType}s: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  /**
   * Log final statistics
   */
  logFinalStatistics() {
    this.log(`\n📊 FINAL STATISTICS`);
    this.log(`==================`);
    this.log(`Deals processed: ${this.stats.dealsProcessed}`);
    this.log(`Companies found: ${this.stats.companiesFound}`);
    this.log(`Contacts found: ${this.stats.contactsFound}`);
    this.log(`\nEngagements found:`);
    Object.entries(this.stats.engagementsFound).forEach(([type, count]) => {
      this.log(`  ${type}: ${count}`);
    });
    this.log(`\nAssociations ${this.dryRun ? 'that would be created' : 'created'}:`);
    Object.entries(this.stats.associationsCreated).forEach(([type, count]) => {
      this.log(`  ${type}: ${count}`);
    });
    this.log(`Associations already existing: ${this.stats.associationsAlreadyExisting}`);
    this.log(`Errors encountered: ${this.stats.errors}`);
    this.log(`\nLog file: ${this.logFile}`);
  }

  /**
   * Fetch a single deal by ID from HubSpot
   */
  async fetchDealById(dealId) {
    const url = `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,amount,attio_deal_id`;
    const response = await this.hubspot.client.get(url);
    return response.data;
  }

  /**
   * Process a single deal by ID
   */
  async processSingleDeal(dealId) {
    this.log(`🎯 Processing single deal: ${dealId}`);
    try {
      // Get the specific deal
      const deal = await this.fetchDealById(dealId);
      this.log(`📋 Processing deal: ${deal.properties?.dealname || 'Untitled'} (ID: ${deal.id})`);
      await this.processDeal(deal);
      this.stats.dealsProcessed++;
      this.logFinalStatistics();
    } catch (error) {
      this.log(`❌ Error processing deal ${dealId}: ${error.message}`, 'ERROR');
      this.stats.errors++;
      throw error;
    }
  }
}

/**
 * CLI execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const cutoffDate = args.find(arg => arg.startsWith('--cutoff-date='))?.split('=')[1];
  
  // Support both --deal-id=VALUE and --deal-id VALUE formats
  let dealId = args.find(arg => arg.startsWith('--deal-id='))?.split('=')[1];
  if (!dealId) {
    const dealIdIndex = args.findIndex(arg => arg === '--deal-id');
    if (dealIdIndex !== -1 && args[dealIdIndex + 1]) {
      dealId = args[dealIdIndex + 1];
    }
  }
  
  console.log('🚀 Deal Engagement Association Backfill Script');
  console.log('===============================================');
  
  if (dryRun) {
    console.log('🧪 DRY RUN MODE: No associations will be created');
  }
  
  if (dealId) {
    console.log(`🎯 Processing specific deal: ${dealId}`);
  } else if (cutoffDate) {
    console.log(`📅 Cutoff Date: ${cutoffDate}`);
  }

  const backfill = new DealEngagementAssociationBackfill(dryRun);
  
  try {
    if (dealId) {
      await backfill.processSingleDeal(dealId);
    } else {
      await backfill.backfillDealEngagementAssociations(cutoffDate);
    }
    console.log('\n✅ Backfill completed successfully!');
  } catch (error) {
    console.error(`\n❌ Backfill failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = DealEngagementAssociationBackfill;
