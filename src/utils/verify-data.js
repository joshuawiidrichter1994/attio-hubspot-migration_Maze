const AttioAPI = require('./attio-api');
const HubSpotAPI = require('./hubspot-api');
const DataManager = require('./data-manager');

class DataVerification {
  constructor() {
    this.attio = new AttioAPI();
    this.hubspot = new HubSpotAPI();
    this.dataManager = new DataManager();
  }

  async verifyMeetingMigration() {
    console.log('='.repeat(60));
    console.log('VERIFYING MEETING MIGRATION');
    console.log('='.repeat(60));

    try {
      // Get all meetings from both systems
      const [attioMeetings, hubspotMeetings] = await Promise.all([
        this.attio.getAllMeetings(),
        this.hubspot.getAllMeetings()
      ]);

      // Create mapping of Attio IDs to HubSpot meetings
      const hubspotByAttioId = new Map();
      hubspotMeetings.forEach(meeting => {
        const attioId = meeting.properties?.attio_meeting_id;
        if (attioId) {
          hubspotByAttioId.set(attioId, meeting);
        }
      });

      const report = {
        total_attio_meetings: attioMeetings.length,
        total_hubspot_meetings: hubspotMeetings.length,
        meetings_with_attio_id: hubspotByAttioId.size,
        missing_meetings: [],
        orphaned_meetings: []
      };

      // Check for missing meetings
      attioMeetings.forEach(attioMeeting => {
        const meetingId = attioMeeting.id?.record_id || attioMeeting.id;
        if (!hubspotByAttioId.has(meetingId)) {
          report.missing_meetings.push({
            attio_id: meetingId,
            title: attioMeeting.values?.title || 'No title',
            created_at: attioMeeting.created_at
          });
        }
      });

      // Check for orphaned meetings (HubSpot meetings without Attio ID)
      hubspotMeetings.forEach(hubspotMeeting => {
        const attioId = hubspotMeeting.properties?.attio_meeting_id;
        if (!attioId) {
          report.orphaned_meetings.push({
            hubspot_id: hubspotMeeting.id,
            title: hubspotMeeting.properties?.hs_meeting_title || 'No title'
          });
        }
      });

      report.migration_completeness = ((report.meetings_with_attio_id / report.total_attio_meetings) * 100).toFixed(2);

      await this.dataManager.saveData('meeting_migration_verification.json', report);

      console.log('\n📊 MEETING MIGRATION VERIFICATION REPORT');
      console.log(`Total Attio meetings: ${report.total_attio_meetings}`);
      console.log(`Total HubSpot meetings: ${report.total_hubspot_meetings}`);
      console.log(`Meetings with Attio ID: ${report.meetings_with_attio_id}`);
      console.log(`Migration completeness: ${report.migration_completeness}%`);
      console.log(`Missing meetings: ${report.missing_meetings.length}`);
      console.log(`Orphaned meetings: ${report.orphaned_meetings.length}`);

      if (report.missing_meetings.length > 0) {
        console.log('\n❌ Missing meetings from HubSpot:');
        report.missing_meetings.slice(0, 10).forEach(meeting => {
          console.log(`  - ${meeting.attio_id}: ${meeting.title}`);
        });
        if (report.missing_meetings.length > 10) {
          console.log(`  ... and ${report.missing_meetings.length - 10} more`);
        }
      }

      return report;
    } catch (error) {
      console.error('Error verifying meeting migration:', error.message);
      throw error;
    }
  }

  async verifyAssociations() {
    console.log('='.repeat(60));
    console.log('VERIFYING ASSOCIATIONS');
    console.log('='.repeat(60));

    try {
      // This would require getting association data from HubSpot
      // For now, we'll create a placeholder report structure
      const hubspotMeetings = await this.hubspot.getAllMeetings();
      
      const report = {
        total_meetings: hubspotMeetings.length,
        meetings_checked: 0,
        associations_found: {
          contacts: 0,
          companies: 0,
          deals: 0
        },
        meetings_without_associations: []
      };

      // This would need to be expanded to actually check associations
      // The HubSpot API would need additional calls to get association data
      
      console.log('📊 ASSOCIATION VERIFICATION REPORT');
      console.log(`Total meetings: ${report.total_meetings}`);
      console.log('Note: Full association verification requires additional API calls');

      return report;
    } catch (error) {
      console.error('Error verifying associations:', error.message);
      throw error;
    }
  }

  async findDuplicates() {
    console.log('='.repeat(60));
    console.log('CHECKING FOR DUPLICATES');
    console.log('='.repeat(60));

    try {
      const hubspotMeetings = await this.hubspot.getAllMeetings();
      
      // Group by Attio ID
      const attioIdGroups = {};
      hubspotMeetings.forEach(meeting => {
        const attioId = meeting.properties?.attio_meeting_id;
        if (attioId) {
          if (!attioIdGroups[attioId]) {
            attioIdGroups[attioId] = [];
          }
          attioIdGroups[attioId].push(meeting);
        }
      });

      // Find duplicates
      const duplicates = Object.entries(attioIdGroups)
        .filter(([attioId, meetings]) => meetings.length > 1)
        .map(([attioId, meetings]) => ({
          attio_id: attioId,
          count: meetings.length,
          hubspot_meetings: meetings.map(m => ({
            id: m.id,
            title: m.properties?.hs_meeting_title || 'No title'
          }))
        }));

      const report = {
        total_meetings: hubspotMeetings.length,
        unique_attio_ids: Object.keys(attioIdGroups).length,
        duplicates_found: duplicates.length,
        duplicates: duplicates
      };

      await this.dataManager.saveData('duplicate_meetings_report.json', report);

      console.log('📊 DUPLICATE MEETINGS REPORT');
      console.log(`Total meetings: ${report.total_meetings}`);
      console.log(`Unique Attio IDs: ${report.unique_attio_ids}`);
      console.log(`Duplicates found: ${report.duplicates_found}`);

      if (duplicates.length > 0) {
        console.log('\n⚠️  Duplicate meetings found:');
        duplicates.forEach(dup => {
          console.log(`  - Attio ID ${dup.attio_id}: ${dup.count} HubSpot meetings`);
        });
      }

      return report;
    } catch (error) {
      console.error('Error checking for duplicates:', error.message);
      throw error;
    }
  }

  async generateFullReport() {
    console.log('🔍 GENERATING FULL VERIFICATION REPORT...\n');

    try {
      const [meetingReport, duplicateReport] = await Promise.all([
        this.verifyMeetingMigration(),
        this.findDuplicates()
      ]);

      const fullReport = {
        timestamp: new Date().toISOString(),
        meeting_migration: meetingReport,
        duplicates: duplicateReport
      };

      await this.dataManager.saveData('full_verification_report.json', fullReport);

      console.log('\n✅ Full verification report generated successfully!');
      return fullReport;
    } catch (error) {
      console.error('Error generating full report:', error.message);
      throw error;
    }
  }
}

module.exports = DataVerification;

// Run if called directly
if (require.main === module) {
  const verification = new DataVerification();
  verification.generateFullReport()
    .then(() => {
      console.log('\nVerification completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nVerification failed:', error.message);
      process.exit(1);
    });
}