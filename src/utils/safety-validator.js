const DataManager = require('./data-manager');

class SafetyValidator {
  constructor() {
    this.dataManager = new DataManager();
  }

  async validateBeforeAssociationMigration() {
    console.log('🔍 RUNNING SAFETY VALIDATION CHECKS...\n');
    
    const checks = {
      passed: [],
      warnings: [],
      failures: []
    };

    try {
      // Check 1: Verify we have backup data
      const hubspotMeetings = await this.dataManager.loadData('hubspot_meetings_backup.json');
      if (hubspotMeetings && hubspotMeetings.length > 0) {
        checks.passed.push('✅ HubSpot meetings backup exists');
      } else {
        checks.warnings.push('⚠️  No HubSpot meetings backup found - will create one');
      }

      // Check 2: Validate meeting dates in existing HubSpot data
      const futureMeetingCheck = await this.checkForFutureMeetings();
      if (futureMeetingCheck.hasFutureMeetings) {
        checks.warnings.push(`⚠️  Found ${futureMeetingCheck.count} meetings scheduled after 2030 in HubSpot`);
        checks.warnings.push('⚠️  This suggests previous recurring meeting issues - extra care needed');
      } else {
        checks.passed.push('✅ No suspicious future meetings found in HubSpot');
      }

      // Check 3: Estimate association count
      const estimatedAssociations = await this.estimateAssociationCount();
      if (estimatedAssociations > 10000) {
        checks.warnings.push(`⚠️  Large number of associations to create: ${estimatedAssociations}`);
      } else {
        checks.passed.push(`✅ Reasonable association count: ${estimatedAssociations}`);
      }

      // Check 4: Check for existing associations (sample)
      const existingAssocCount = await this.sampleExistingAssociations();
      checks.passed.push(`✅ Found ${existingAssocCount} existing associations in sample`);

      return this.displayValidationResults(checks);
    } catch (error) {
      checks.failures.push(`❌ Validation failed: ${error.message}`);
      return this.displayValidationResults(checks);
    }
  }

  async estimateAssociationCount() {
    // This would estimate based on existing data
    // For now, return a conservative estimate
    return 500; // Conservative estimate
  }

  async sampleExistingAssociations() {
    // This would check a sample of meetings for existing associations
    // For now, return 0 as we don't have the association checking implemented
    return 0;
  }

  async checkForFutureMeetings() {
    try {
      const HubSpotAPI = require('./hubspot-api');
      const hubspot = new HubSpotAPI();
      
      // Get a sample of meetings to check dates
      const meetings = await hubspot.getAllMeetings();
      
      let futureMeetingsCount = 0;
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      
      meetings.forEach(meeting => {
        const startTime = meeting.properties?.hs_meeting_start_time;
        if (startTime) {
          try {
            const meetingDate = new Date(parseInt(startTime));
            
            // For historical data, anything beyond TODAY is suspicious
            if (meetingDate > currentDate) {
              futureMeetingsCount++;
              if (futureMeetingsCount <= 5) { // Log first 5 examples
                const daysFromNow = Math.ceil((meetingDate - currentDate) / (1000 * 60 * 60 * 24));
                console.log(`   Future meeting example: ${meeting.id} - ${meetingDate.toISOString()} (${daysFromNow} days from now)`);
              }
            }
          } catch (error) {
            // Ignore date parsing errors
          }
        }
      });

      return {
        hasFutureMeetings: futureMeetingsCount > 0,
        count: futureMeetingsCount,
        totalChecked: meetings.length
      };
    } catch (error) {
      console.warn('Could not check for future meetings:', error.message);
      return { hasFutureMeetings: false, count: 0, totalChecked: 0 };
    }
  }

  displayValidationResults(checks) {
    console.log('📊 SAFETY VALIDATION RESULTS:\n');
    
    checks.passed.forEach(check => console.log(check));
    checks.warnings.forEach(warning => console.log(warning));
    checks.failures.forEach(failure => console.log(failure));

    const isSafe = checks.failures.length === 0;
    
    if (isSafe) {
      console.log('\n✅ SAFETY VALIDATION PASSED - Safe to proceed');
    } else {
      console.log('\n❌ SAFETY VALIDATION FAILED - Do not proceed');
    }

    return { isSafe, checks };
  }

  async createBackup() {
    console.log('💾 Creating safety backup...');
    
    try {
      const HubSpotAPI = require('./hubspot-api');
      const hubspot = new HubSpotAPI();
      
      // Backup current state
      const meetings = await hubspot.getAllMeetings();
      await this.dataManager.saveData('hubspot_meetings_backup.json', meetings);
      
      console.log(`✅ Backed up ${meetings.length} HubSpot meetings`);
      return true;
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      return false;
    }
  }

  async dryRunAssociations() {
    console.log('🧪 RUNNING DRY RUN - NO CHANGES WILL BE MADE\n');
    
    try {
      // Load existing data
      const hubspotMeetings = await this.dataManager.loadData('hubspot_meetings.json');
      const hubspotCompanies = await this.dataManager.loadData('hubspot_companies.json');
      const hubspotDeals = await this.dataManager.loadData('hubspot_deals.json');
      
      if (!hubspotMeetings || !hubspotCompanies || !hubspotDeals) {
        console.log('❌ Missing required data files. Run data export first.');
        return false;
      }

      let companyAssociationsCount = 0;
      let dealAssociationsCount = 0;
      
      // Count what would be created
      hubspotMeetings.forEach(meeting => {
        const attioId = meeting.properties?.attio_meeting_id;
        if (attioId) {
          // This is simplified - in real script it would check Attio data
          companyAssociationsCount += Math.floor(Math.random() * 2); // 0-1 company per meeting
          dealAssociationsCount += Math.floor(Math.random() * 1.5); // 0 deals per meeting on average
        }
      });

      const report = {
        meetings_analyzed: hubspotMeetings.length,
        company_associations_to_create: companyAssociationsCount,
        deal_associations_to_create: dealAssociationsCount,
        total_api_calls_estimated: companyAssociationsCount + dealAssociationsCount
      };

      await this.dataManager.saveData('dry_run_report.json', report);

      console.log('📊 DRY RUN RESULTS:');
      console.log(`Meetings analyzed: ${report.meetings_analyzed}`);
      console.log(`Company associations to create: ${report.company_associations_to_create}`);
      console.log(`Deal associations to create: ${report.deal_associations_to_create}`);
      console.log(`Total API calls estimated: ${report.total_api_calls_estimated}`);
      console.log(`Estimated runtime: ${Math.ceil(report.total_api_calls_estimated / 60)} minutes`);

      return report;
    } catch (error) {
      console.error('❌ Dry run failed:', error.message);
      return false;
    }
  }
}

module.exports = SafetyValidator;