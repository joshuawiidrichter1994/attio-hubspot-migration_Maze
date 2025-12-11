const AttioAPI = require('./utils/attio-api');
const HubSpotAPI = require('./utils/hubspot-api');
const DataManager = require('./utils/data-manager');
const moment = require('moment');

class IncrementalMigration {
  constructor() {
    this.attio = new AttioAPI();
    this.hubspot = new HubSpotAPI();
    this.dataManager = new DataManager();
  }

  async getNewMeetingsFromAttio(sinceDate) {
    await this.dataManager.logProgress('INCREMENTAL', `Fetching Attio meetings created since ${sinceDate}`);
    
    try {
      // For incremental migration, max date should be TODAY
      // We don't want any meetings scheduled beyond today
      const maxDate = new Date();
      maxDate.setHours(23, 59, 59, 999); // End of today
      
      const allMeetings = await this.attio.getAllMeetings(maxDate.toISOString());
      
      // Filter meetings created since the specified date
      const newMeetings = allMeetings.filter(meeting => {
        try {
          const createdAt = meeting.created_at || meeting.values?.created_at;
          if (!createdAt) return false;
          
          const meetingDate = moment(createdAt);
          const isAfterSinceDate = meetingDate.isAfter(moment(sinceDate));
          
          // Additional check: ensure meeting isn't scheduled in the future
          const scheduledDate = this.extractMeetingScheduledDate(meeting);
          if (scheduledDate) {
            const scheduledMoment = moment(scheduledDate);
            const today = moment().endOf('day');
            
            if (scheduledMoment.isAfter(today)) {
              console.warn(`⚠️  Skipping meeting scheduled in future: ${meeting.id} (${scheduledMoment.format()})`);
              return false;
            }
            
            // Extra paranoid check for obviously bad dates
            if (scheduledMoment.year() > moment().year() + 1) {
              console.warn(`⚠️  Skipping meeting with invalid future date: ${meeting.id} (${scheduledMoment.format()})`);
              return false;
            }
          }
          
          return isAfterSinceDate;
        } catch (error) {
          console.warn(`Error parsing date for meeting ${meeting.id}:`, error.message);
          return false;
        }
      });

      await this.dataManager.logProgress('INCREMENTAL', `Found ${newMeetings.length} new meetings in Attio (filtered from ${allMeetings.length} total)`);
      return newMeetings;
    } catch (error) {
      await this.dataManager.logProgress('INCREMENTAL', `Error fetching new meetings: ${error.message}`);
      throw error;
    }
  }

  async getExistingHubSpotMeetings() {
    await this.dataManager.logProgress('INCREMENTAL', 'Fetching existing HubSpot meetings');
    
    try {
      const hubspotMeetings = await this.hubspot.getAllMeetings();
      
      // Create a set of existing Attio meeting IDs in HubSpot
      const existingAttioIds = new Set();
      hubspotMeetings.forEach(meeting => {
        const attioId = meeting.properties?.attio_meeting_id;
        if (attioId) {
          existingAttioIds.add(attioId);
        }
      });

      return { hubspotMeetings, existingAttioIds };
    } catch (error) {
      await this.dataManager.logProgress('INCREMENTAL', `Error fetching HubSpot meetings: ${error.message}`);
      throw error;
    }
  }

  async createMeetingInHubSpot(attioMeeting) {
    try {
      const meetingData = this.transformAttioMeetingToHubSpot(attioMeeting);
      
      const response = await this.hubspot.client.post('/crm/v3/objects/meetings', {
        properties: meetingData
      });

      await this.dataManager.logProgress('INCREMENTAL', `Created HubSpot meeting ${response.data.id} from Attio meeting ${attioMeeting.id}`);
      return response.data;
    } catch (error) {
      await this.dataManager.logProgress('INCREMENTAL', `Error creating meeting: ${error.message}`);
      throw error;
    }
  }

  transformAttioMeetingToHubSpot(attioMeeting) {
    const properties = {
      attio_meeting_id: attioMeeting.id?.record_id || attioMeeting.id,
    };

    // Extract meeting properties from Attio
    if (attioMeeting.values) {
      // Meeting title
      if (attioMeeting.values.title) {
        properties.hs_meeting_title = attioMeeting.values.title;
      }

      // Meeting description/body
      if (attioMeeting.values.description || attioMeeting.values.notes) {
        properties.hs_meeting_body = attioMeeting.values.description || attioMeeting.values.notes;
      }

      // Start time
      if (attioMeeting.values.start_time || attioMeeting.values.scheduled_at) {
        const startTime = attioMeeting.values.start_time || attioMeeting.values.scheduled_at;
        properties.hs_meeting_start_time = new Date(startTime).getTime();
      }

      // End time
      if (attioMeeting.values.end_time) {
        properties.hs_meeting_end_time = new Date(attioMeeting.values.end_time).getTime();
      }

      // Meeting type
      if (attioMeeting.values.meeting_type) {
        properties.hs_meeting_type = attioMeeting.values.meeting_type;
      }

      // Meeting outcome
      if (attioMeeting.values.outcome) {
        properties.hs_meeting_outcome = attioMeeting.values.outcome;
      }
    }

    return properties;
  }

  async createContactAssociations(hubspotMeetingId, attioMeeting) {
    const associations = [];
    
    try {
      // Get contact associations from Attio meeting
      const contactIds = this.extractContactAssociations(attioMeeting);
      
      // Get HubSpot contacts to find matching ones
      const hubspotContacts = await this.hubspot.getAllContacts();
      
      for (const attioContactId of contactIds) {
        const hubspotContact = hubspotContacts.find(hc => 
          hc.properties?.attio_contact_id === attioContactId
        );

        if (hubspotContact) {
          try {
            await this.hubspot.createAssociation(
              'meetings',
              hubspotMeetingId,
              'contacts',
              hubspotContact.id,
              'meeting_to_contact'
            );
            associations.push({ type: 'contact', hubspotId: hubspotContact.id, attioId: attioContactId });
          } catch (error) {
            console.warn(`Failed to associate meeting ${hubspotMeetingId} with contact ${hubspotContact.id}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.warn(`Error creating contact associations for meeting ${hubspotMeetingId}:`, error.message);
    }

    return associations;
  }

  async createCompanyAssociations(hubspotMeetingId, attioMeeting) {
    const associations = [];
    
    try {
      // Get company associations from Attio meeting  
      const companyIds = this.extractCompanyAssociations(attioMeeting);
      
      // Get HubSpot companies to find matching ones
      const hubspotCompanies = await this.hubspot.getAllCompanies();
      
      for (const attioCompanyId of companyIds) {
        const hubspotCompany = hubspotCompanies.find(hc => 
          hc.properties?.attio_company_id === attioCompanyId
        );

        if (hubspotCompany) {
          try {
            await this.hubspot.createAssociation(
              'meetings',
              hubspotMeetingId,
              'companies',
              hubspotCompany.id,
              'meeting_to_company'
            );
            associations.push({ type: 'company', hubspotId: hubspotCompany.id, attioId: attioCompanyId });
          } catch (error) {
            console.warn(`Failed to associate meeting ${hubspotMeetingId} with company ${hubspotCompany.id}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.warn(`Error creating company associations for meeting ${hubspotMeetingId}:`, error.message);
    }

    return associations;
  }

  async createDealAssociations(hubspotMeetingId, attioMeeting) {
    const associations = [];
    
    try {
      // Get deal associations from Attio meeting
      const dealIds = this.extractDealAssociations(attioMeeting);
      
      // Get HubSpot deals to find matching ones
      const hubspotDeals = await this.hubspot.getAllDeals();
      
      for (const attioDealId of dealIds) {
        const hubspotDeal = hubspotDeals.find(hd => 
          hd.properties?.attio_deal_id === attioDealId
        );

        if (hubspotDeal) {
          try {
            await this.hubspot.createAssociation(
              'meetings',
              hubspotMeetingId,
              'deals',
              hubspotDeal.id,
              'meeting_to_deal'
            );
            associations.push({ type: 'deal', hubspotId: hubspotDeal.id, attioId: attioDealId });
          } catch (error) {
            console.warn(`Failed to associate meeting ${hubspotMeetingId} with deal ${hubspotDeal.id}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.warn(`Error creating deal associations for meeting ${hubspotMeetingId}:`, error.message);
    }

    return associations;
  }

  extractContactAssociations(attioMeeting) {
    const contactIds = [];
    
    try {
      if (attioMeeting.values) {
        Object.values(attioMeeting.values).forEach(value => {
          if (value && typeof value === 'object') {
            if (value.target_object === 'people' || value.type === 'person') {
              if (value.target_record_id) contactIds.push(value.target_record_id);
              if (value.record_id) contactIds.push(value.record_id);
            }
            
            if (Array.isArray(value)) {
              value.forEach(item => {
                if (item && (item.target_object === 'people' || item.type === 'person')) {
                  if (item.target_record_id) contactIds.push(item.target_record_id);
                  if (item.record_id) contactIds.push(item.record_id);
                }
              });
            }
          }
        });
      }

      if (attioMeeting.associations?.people) {
        attioMeeting.associations.people.forEach(person => {
          if (person.record_id) contactIds.push(person.record_id);
          if (person.id) contactIds.push(person.id);
        });
      }
    } catch (error) {
      console.warn(`Error extracting contact associations:`, error.message);
    }

    return [...new Set(contactIds)];
  }

  extractCompanyAssociations(attioMeeting) {
    const companyIds = [];
    
    try {
      if (attioMeeting.values) {
        Object.values(attioMeeting.values).forEach(value => {
          if (value && typeof value === 'object') {
            if (value.target_object === 'companies' || value.type === 'company') {
              if (value.target_record_id) companyIds.push(value.target_record_id);
              if (value.record_id) companyIds.push(value.record_id);
            }
            
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

      if (attioMeeting.associations?.companies) {
        attioMeeting.associations.companies.forEach(company => {
          if (company.record_id) companyIds.push(company.record_id);
          if (company.id) companyIds.push(company.id);
        });
      }
    } catch (error) {
      console.warn(`Error extracting company associations:`, error.message);
    }

    return [...new Set(companyIds)];
  }

  extractDealAssociations(attioMeeting) {
    const dealIds = [];
    
    try {
      if (attioMeeting.values) {
        Object.values(attioMeeting.values).forEach(value => {
          if (value && typeof value === 'object') {
            if (value.target_object === 'deals' || value.type === 'deal') {
              if (value.target_record_id) dealIds.push(value.target_record_id);
              if (value.record_id) dealIds.push(value.record_id);
            }
            
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

      if (attioMeeting.associations?.deals) {
        attioMeeting.associations.deals.forEach(deal => {
          if (deal.record_id) dealIds.push(deal.record_id);
          if (deal.id) dealIds.push(deal.id);
        });
      }
    } catch (error) {
      console.warn(`Error extracting deal associations:`, error.message);
    }

    return [...new Set(dealIds)];
  }

  extractMeetingScheduledDate(meeting) {
    if (meeting.values) {
      return meeting.values.start_time || 
             meeting.values.scheduled_at || 
             meeting.values.date || 
             meeting.values.meeting_date;
    }
    
    return meeting.start_time || 
           meeting.scheduled_at || 
           meeting.date;
  }

  async runIncrementalMigration(sinceDate) {
    console.log('='.repeat(80));
    console.log(`STARTING INCREMENTAL MIGRATION (Since: ${sinceDate})`);
    console.log('='.repeat(80));

    try {
      // Step 1: Get new meetings from Attio
      const newAttioMeetings = await this.getNewMeetingsFromAttio(sinceDate);
      await this.dataManager.saveData(`incremental_attio_meetings_${Date.now()}.json`, newAttioMeetings);

      if (newAttioMeetings.length === 0) {
        console.log('No new meetings found since the specified date.');
        return { migrated: 0, errors: 0 };
      }

      // Step 2: Get existing HubSpot meetings to avoid duplicates
      const { hubspotMeetings, existingAttioIds } = await this.getExistingHubSpotMeetings();

      // Step 3: Filter out meetings that already exist in HubSpot
      const meetingsToMigrate = newAttioMeetings.filter(meeting => {
        const meetingId = meeting.id?.record_id || meeting.id;
        return !existingAttioIds.has(meetingId);
      });

      await this.dataManager.logProgress('INCREMENTAL', `${meetingsToMigrate.length} new meetings need to be migrated`);

      if (meetingsToMigrate.length === 0) {
        console.log('All new meetings already exist in HubSpot.');
        return { migrated: 0, errors: 0 };
      }

      // Step 4: Migrate each new meeting
      const results = [];
      
      for (const attioMeeting of meetingsToMigrate) {
        try {
          await this.dataManager.logProgress('INCREMENTAL', `Migrating meeting: ${attioMeeting.id}`);
          
          // Create the meeting in HubSpot
          const hubspotMeeting = await this.createMeetingInHubSpot(attioMeeting);
          
          // Create associations
          const contactAssociations = await this.createContactAssociations(hubspotMeeting.id, attioMeeting);
          const companyAssociations = await this.createCompanyAssociations(hubspotMeeting.id, attioMeeting);
          const dealAssociations = await this.createDealAssociations(hubspotMeeting.id, attioMeeting);

          results.push({
            success: true,
            attioMeetingId: attioMeeting.id,
            hubspotMeetingId: hubspotMeeting.id,
            associations: {
              contacts: contactAssociations,
              companies: companyAssociations,
              deals: dealAssociations
            }
          });

          // Add delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 200));

        } catch (error) {
          console.error(`Failed to migrate meeting ${attioMeeting.id}:`, error.message);
          results.push({
            success: false,
            attioMeetingId: attioMeeting.id,
            error: error.message
          });
        }
      }

      // Step 5: Save results and generate report
      await this.dataManager.saveData(`incremental_migration_results_${Date.now()}.json`, results);
      await this.dataManager.generateReport('Incremental Meeting Migration', results);

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log('\n='.repeat(80));
      console.log('INCREMENTAL MIGRATION COMPLETED');
      console.log(`Successful: ${successful}`);
      console.log(`Failed: ${failed}`);
      console.log('='.repeat(80));

      return { migrated: successful, errors: failed };

    } catch (error) {
      await this.dataManager.logProgress('INCREMENTAL', `Critical error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = IncrementalMigration;

// Run if called directly
if (require.main === module) {
  const sinceDate = process.argv[2] || moment().subtract(7, 'days').format('YYYY-MM-DD');
  
  console.log(`Running incremental migration for meetings since: ${sinceDate}`);
  
  const migration = new IncrementalMigration();
  migration.runIncrementalMigration(sinceDate)
    .then((result) => {
      console.log('\nIncremental migration completed successfully!', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('\nIncremental migration failed:', error.message);
      process.exit(1);
    });
}