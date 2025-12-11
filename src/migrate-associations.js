const AttioAPI = require('./utils/attio-api');
const HubSpotAPI = require('./utils/hubspot-api');
const DataManager = require('./utils/data-manager');
const SafetyValidator = require('./utils/safety-validator');
const MeetingMatcher = require('./utils/meeting-matcher');
const CompanyDealMatcher = require('./utils/company-deal-matcher');

class MigrationAssociations {
  constructor() {
    this.attio = new AttioAPI();
    this.hubspot = new HubSpotAPI();
    this.dataManager = new DataManager();
    this.safety = new SafetyValidator();
    this.meetingMatcher = new MeetingMatcher();
    this.companyDealMatcher = new CompanyDealMatcher();
  }

  async migrateCompanyAssociations() {
    await this.dataManager.logProgress('COMPANY_ASSOCIATIONS', 'Starting company associations migration');

    try {
      // Step 1: Fetch all meetings from HubSpot
      await this.dataManager.logProgress('COMPANY_ASSOCIATIONS', 'Fetching meetings from HubSpot');
      const hubspotMeetings = await this.hubspot.getAllMeetings();
      if (!Array.isArray(hubspotMeetings)) {
        throw new Error('Failed to fetch HubSpot meetings - invalid response');
      }
      await this.dataManager.saveData('hubspot_meetings.json', hubspotMeetings);

      // Step 2: Fetch all meetings from Attio
      await this.dataManager.logProgress('COMPANY_ASSOCIATIONS', 'Fetching meetings from Attio');
      const attioMeetings = await this.attio.getAllMeetings();
      if (!Array.isArray(attioMeetings)) {
        throw new Error('Failed to fetch Attio meetings - invalid response');
      }
      await this.dataManager.saveData('attio_meetings.json', attioMeetings);

      // Step 3: Fetch all companies from HubSpot
      await this.dataManager.logProgress('COMPANY_ASSOCIATIONS', 'Fetching companies from HubSpot');
      const hubspotCompanies = await this.hubspot.getAllCompanies();
      if (!Array.isArray(hubspotCompanies)) {
        throw new Error('Failed to fetch HubSpot companies - invalid response');
      }
      await this.dataManager.saveData('hubspot_companies.json', hubspotCompanies);

      // Step 4: Match meetings between Attio and HubSpot
      await this.dataManager.logProgress('COMPANY_ASSOCIATIONS', 'Matching meetings between systems');
      const matchingResults = this.meetingMatcher.matchMeetings(attioMeetings, hubspotMeetings);
      
      if (!matchingResults || !Array.isArray(matchingResults.matches)) {
        throw new Error('Failed to match meetings - invalid matching results');
      }
      
      console.log(`📊 Meeting matching results:`);
      console.log(`   ✅ Matched: ${matchingResults.matches.length} pairs`);
      console.log(`   🔴 Unmatched Attio: ${matchingResults.unmatchedAttio.length}`);
      console.log(`   🔵 Unmatched HubSpot: ${matchingResults.unmatchedHubSpot.length}`);

      // Step 5: Create company name-based mapping
      await this.dataManager.logProgress('COMPANY_ASSOCIATIONS', 'Creating company name-based mapping');
      
      // Get all unique Attio company IDs from meetings
      const uniqueAttioCompanyIds = new Set();
      for (const match of matchingResults.matches) {
        const companyLinkedRecords = (match.attio.linked_records || []).filter(record => 
          record.object_slug === 'companies'
        );
        companyLinkedRecords.forEach(record => uniqueAttioCompanyIds.add(record.record_id));
      }
      
      console.log(`Found ${uniqueAttioCompanyIds.size} unique Attio companies in matched meetings`);
      
      // Match companies by name
      console.log(`💼 Matching ${uniqueAttioCompanyIds.size} Attio companies to ${hubspotCompanies.length} HubSpot companies`);
      const companyMatcher = new CompanyDealMatcher();
      const companyMatching = await companyMatcher.matchCompanies(Array.from(uniqueAttioCompanyIds), hubspotCompanies);
      
      if (!companyMatching || !Array.isArray(companyMatching.matches)) {
        throw new Error('Failed to match companies - invalid matching results');
      }
      
      console.log(`🏢 Company matching results:`);
      console.log(`   ✅ Matched: ${companyMatching.matches.length} companies`);
      console.log(`   🔴 Unmatched: ${companyMatching.unmatched.length} companies`);
      
      await this.dataManager.saveData('company_name_mapping.json', companyMatching);

      // Step 6: Process meeting-company associations
      await this.dataManager.logProgress('COMPANY_ASSOCIATIONS', 'Processing meeting-company associations');
      const associationsToCreate = [];

      for (const match of matchingResults.matches) {
        const attioMeeting = match.attio;
        const hubspotMeeting = match.hubspot;
        
        console.log(`🔗 Processing match: "${attioMeeting.title}" (confidence: ${match.confidence})`);

        // Get company associations from Attio meeting's linked records
        const companyLinkedRecords = (attioMeeting.linked_records || []).filter(record => 
          record.object_slug === 'companies'
        );

        for (const linkedRecord of companyLinkedRecords) {
          // Find corresponding HubSpot company using name matching
          const companyMatch = companyMatching.matches.find(match => 
            match.attioId === linkedRecord.record_id
          );

          if (companyMatch) {
            associationsToCreate.push({
              fromObjectType: 'meetings',
              fromObjectId: hubspotMeeting.id,
              toObjectType: 'companies',
              toObjectId: companyMatch.hubspotId,
              associationType: 'meeting_to_company',
              attioMeetingId: attioMeeting.id?.meeting_id || attioMeeting.id,
              attioCompanyId: linkedRecord.record_id,
              matchInfo: {
                attioName: companyMatch.attioName,
                hubspotName: companyMatch.hubspotName,
                similarity: companyMatch.similarity
              }
            });
          } else {
            console.warn(`No HubSpot company match found for Attio company ID ${linkedRecord.record_id}`);
          }
        }
      }

      await this.dataManager.saveData('meeting_company_associations_to_create.json', associationsToCreate);
      
      // Step 6: Create associations in HubSpot
      await this.dataManager.logProgress('COMPANY_ASSOCIATIONS', `Creating ${associationsToCreate.length} meeting-company associations in HubSpot`);
      
      const results = await this.hubspot.batchCreateAssociations(associationsToCreate, 5);
      await this.dataManager.saveData('meeting_company_association_results.json', results);

      // Step 7: Generate report
      await this.dataManager.generateReport('Meeting Company Associations Migration', results);

      return results;
    } catch (error) {
      await this.dataManager.logProgress('COMPANY_ASSOCIATIONS', `Error: ${error.message}`);
      throw error;
    }
  }

  async migrateDealAssociations() {
    await this.dataManager.logProgress('DEAL_ASSOCIATIONS', 'Starting deal associations migration');

    try {
      // Step 1: Load meetings data (should be cached from previous step)
      let hubspotMeetings = await this.dataManager.loadData('hubspot_meetings.json');
      let attioMeetings = await this.dataManager.loadData('attio_meetings.json');

      if (!hubspotMeetings || !attioMeetings) {
        await this.dataManager.logProgress('DEAL_ASSOCIATIONS', 'Meeting data not found, fetching fresh data');
        hubspotMeetings = await this.hubspot.getAllMeetings();
        attioMeetings = await this.attio.getAllMeetings();
      }

      // Step 2: Fetch all deals from HubSpot
      await this.dataManager.logProgress('DEAL_ASSOCIATIONS', 'Fetching deals from HubSpot');
      const hubspotDeals = await this.hubspot.getAllDeals();
      await this.dataManager.saveData('hubspot_deals.json', hubspotDeals);

      // Step 3: Match meetings between Attio and HubSpot (reuse from company associations)
      await this.dataManager.logProgress('DEAL_ASSOCIATIONS', 'Matching meetings between systems');
      const matchingResults = this.meetingMatcher.matchMeetings(attioMeetings, hubspotMeetings);
      
      // Step 3.5: Create deal name-based mapping
      await this.dataManager.logProgress('DEAL_ASSOCIATIONS', 'Creating deal name-based mapping');
      
      // Get all unique Attio deal IDs from meetings
      const uniqueAttioDealIds = new Set();
      for (const match of matchingResults.matches) {
        const dealLinkedRecords = (match.attio.linked_records || []).filter(record => 
          record.object_slug === 'deals'
        );
        dealLinkedRecords.forEach(record => uniqueAttioDealIds.add(record.record_id));
      }
      
      console.log(`Found ${uniqueAttioDealIds.size} unique Attio deals in matched meetings`);
      
      // Match deals by name if any exist
      let dealMatching = { matches: [], unmatched: [] };
      if (uniqueAttioDealIds.size > 0) {
        dealMatching = await this.companyDealMatcher.matchDeals(
          Array.from(uniqueAttioDealIds), 
          hubspotDeals, 
          0.7 // Lower threshold for more matches
        );
      }
      
      await this.dataManager.saveData('deal_name_mapping.json', dealMatching);

      // Step 4: Process meeting-deal associations
      await this.dataManager.logProgress('DEAL_ASSOCIATIONS', 'Processing meeting-deal associations');
      const associationsToCreate = [];

      for (const match of matchingResults.matches) {
        const attioMeeting = match.attio;
        const hubspotMeeting = match.hubspot;

        // Get deal associations from Attio meeting's linked records
        const dealLinkedRecords = (attioMeeting.linked_records || []).filter(record => 
          record.object_slug === 'deals'
        );

        for (const linkedRecord of dealLinkedRecords) {
          // Find corresponding HubSpot deal using name matching
          const dealMatch = dealMatching.matches.find(match => 
            match.attioId === linkedRecord.record_id
          );

          if (dealMatch) {
            associationsToCreate.push({
              fromObjectType: 'meetings',
              fromObjectId: hubspotMeeting.id,
              toObjectType: 'deals',
              toObjectId: dealMatch.hubspotId,
              associationType: 'meeting_to_deal',
              attioMeetingId: attioMeeting.id?.meeting_id || attioMeeting.id,
              attioDealId: linkedRecord.record_id,
              matchInfo: {
                attioName: dealMatch.attioName,
                hubspotName: dealMatch.hubspotName,
                similarity: dealMatch.similarity
              }
            });
          } else {
            console.warn(`No HubSpot deal match found for Attio deal ID ${linkedRecord.record_id}`);
          }
        }
      }

      await this.dataManager.saveData('meeting_deal_associations_to_create.json', associationsToCreate);
      
      // Step 4: Create associations in HubSpot
      await this.dataManager.logProgress('DEAL_ASSOCIATIONS', `Creating ${associationsToCreate.length} meeting-deal associations in HubSpot`);
      
      const results = await this.hubspot.batchCreateAssociations(associationsToCreate, 5);
      await this.dataManager.saveData('meeting_deal_association_results.json', results);

      // Step 5: Generate report
      await this.dataManager.generateReport('Meeting Deal Associations Migration', results);

      return results;
    } catch (error) {
      await this.dataManager.logProgress('DEAL_ASSOCIATIONS', `Error: ${error.message}`);
      throw error;
    }
  }

  extractCompanyAssociations(attioMeeting) {
    const companyIds = [];
    
    try {
      // Check various possible structures for company associations in Attio
      if (attioMeeting.values) {
        // Look for company references in meeting values
        Object.values(attioMeeting.values).forEach(value => {
          if (value && typeof value === 'object') {
            if (value.target_object === 'companies' || value.type === 'company') {
              if (value.target_record_id) {
                companyIds.push(value.target_record_id);
              } else if (value.record_id) {
                companyIds.push(value.record_id);
              }
            }
            
            // Handle arrays of company references
            if (Array.isArray(value)) {
              value.forEach(item => {
                if (item && (item.target_object === 'companies' || item.type === 'company')) {
                  if (item.target_record_id) companyIds.push(item.target_record_id);
                  if (item.record_id) companyIds.push(item.record_id);
                }
              });
            }
          }
        });
      }

      // Also check direct associations if they exist
      if (attioMeeting.associations && attioMeeting.associations.companies) {
        attioMeeting.associations.companies.forEach(company => {
          if (company.record_id) companyIds.push(company.record_id);
          if (company.id) companyIds.push(company.id);
        });
      }
    } catch (error) {
      console.warn(`Error extracting company associations from meeting ${attioMeeting.id}:`, error.message);
    }

    return [...new Set(companyIds)]; // Remove duplicates
  }

  extractDealAssociations(attioMeeting) {
    const dealIds = [];
    
    try {
      // Check various possible structures for deal associations in Attio
      if (attioMeeting.values) {
        // Look for deal references in meeting values
        Object.values(attioMeeting.values).forEach(value => {
          if (value && typeof value === 'object') {
            if (value.target_object === 'deals' || value.type === 'deal') {
              if (value.target_record_id) {
                dealIds.push(value.target_record_id);
              } else if (value.record_id) {
                dealIds.push(value.record_id);
              }
            }
            
            // Handle arrays of deal references
            if (Array.isArray(value)) {
              value.forEach(item => {
                if (item && (item.target_object === 'deals' || item.type === 'deal')) {
                  if (item.target_record_id) dealIds.push(item.target_record_id);
                  if (item.record_id) dealIds.push(item.record_id);
                }
              });
            }
          }
        });
      }

      // Also check direct associations if they exist
      if (attioMeeting.associations && attioMeeting.associations.deals) {
        attioMeeting.associations.deals.forEach(deal => {
          if (deal.record_id) dealIds.push(deal.record_id);
          if (deal.id) dealIds.push(deal.id);
        });
      }
    } catch (error) {
      console.warn(`Error extracting deal associations from meeting ${attioMeeting.id}:`, error.message);
    }

    return [...new Set(dealIds)]; // Remove duplicates
  }

  async runFullAssociationMigration() {
    console.log('='.repeat(80));
    console.log('STARTING FULL ASSOCIATION MIGRATION');
    console.log('='.repeat(80));

    try {
      // Step 0: Safety validation
      console.log('\n0. RUNNING SAFETY CHECKS...\n');
      const validation = await this.safety.validateBeforeAssociationMigration();
      
      if (!validation.isSafe) {
        throw new Error('Safety validation failed. Migration aborted.');
      }

      // Create backup
      const backupSuccess = await this.safety.createBackup();
      if (!backupSuccess) {
        console.log('⚠️  Warning: Backup failed, but continuing...');
      }

      // Dry run
      console.log('\n🧪 RUNNING DRY RUN FIRST...\n');
      await this.safety.dryRunAssociations();
      console.log('\n✅ Dry run completed. Check dry_run_report.json for details.\n');
      
      // Run company associations
      console.log('\n1. MIGRATING COMPANY ASSOCIATIONS...\n');
      await this.migrateCompanyAssociations();

      // Run deal associations
      console.log('\n2. MIGRATING DEAL ASSOCIATIONS...\n');
      await this.migrateDealAssociations();

      console.log('\n='.repeat(80));
      console.log('FULL ASSOCIATION MIGRATION COMPLETED');
      console.log('='.repeat(80));

    } catch (error) {
      console.error('\nFULL MIGRATION FAILED:', error.message);
      throw error;
    }
  }
}

module.exports = MigrationAssociations;

// Run if called directly
if (require.main === module) {
  const migration = new MigrationAssociations();
  migration.runFullAssociationMigration()
    .then(() => {
      console.log('\nMigration completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nMigration failed:', error.message);
      process.exit(1);
    });
}