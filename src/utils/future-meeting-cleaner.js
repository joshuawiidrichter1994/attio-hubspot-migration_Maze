const HubSpotAPI = require('./hubspot-api');
const DataManager = require('./data-manager');

class FutureMeetingCleaner {
  constructor() {
    this.hubspot = new HubSpotAPI();
    this.dataManager = new DataManager();
  }

  async identifyFutureMeetings() {
    console.log('🔍 IDENTIFYING SUSPICIOUS FUTURE MEETINGS...\n');

    try {
      const meetings = await this.hubspot.getAllMeetings();
      const suspiciousMeetings = [];
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      
      // For historical meetings, anything beyond today is suspicious
      const maxReasonableDate = new Date();
      maxReasonableDate.setHours(23, 59, 59, 999); // End of today

      meetings.forEach(meeting => {
        const startTime = meeting.properties?.hs_meeting_start_time;
        if (startTime) {
          try {
            const meetingDate = new Date(parseInt(startTime));
            
            // Any meeting scheduled after today is suspicious for historical data
            if (meetingDate > maxReasonableDate) {
              suspiciousMeetings.push({
                id: meeting.id,
                title: meeting.properties?.hs_meeting_title || 'No title',
                scheduledDate: meetingDate.toISOString(),
                year: meetingDate.getFullYear(),
                daysFromNow: Math.ceil((meetingDate - currentDate) / (1000 * 60 * 60 * 24)),
                attioId: meeting.properties?.attio_meeting_id,
                isSuspicious: meetingDate > maxReasonableDate,
                isDefinitelyCrap: meetingDate.getFullYear() > currentYear + 1
              });
            }
          } catch (error) {
            // Ignore date parsing errors
          }
        }
      });

      // Sort by year descending (most suspicious first)
      suspiciousMeetings.sort((a, b) => b.year - a.year);

      const report = {
        timestamp: new Date().toISOString(),
        total_meetings_checked: meetings.length,
        suspicious_meetings_found: suspiciousMeetings.length,
        years_represented: [...new Set(suspiciousMeetings.map(m => m.year))].sort((a, b) => b - a),
        meetings: suspiciousMeetings
      };

      await this.dataManager.saveData('future_meetings_report.json', report);

      console.log('📊 FUTURE MEETINGS ANALYSIS:');
      console.log(`Total meetings checked: ${report.total_meetings_checked}`);
      console.log(`Suspicious future meetings: ${report.suspicious_meetings_found}`);
      
      if (report.years_represented.length > 0) {
        console.log(`Years represented: ${report.years_represented.join(', ')}`);
        console.log('\n⚠️  TOP 10 MOST SUSPICIOUS:');
        suspiciousMeetings.slice(0, 10).forEach((meeting, index) => {
          console.log(`${index + 1}. ${meeting.id} - ${meeting.title} (Year: ${meeting.year})`);
        });
      } else {
        console.log('✅ No suspicious future meetings found!');
      }

      return report;
    } catch (error) {
      console.error('❌ Error identifying future meetings:', error.message);
      throw error;
    }
  }

  async generateCleanupScript(report) {
    if (!report || report.suspicious_meetings_found === 0) {
      console.log('✅ No cleanup needed - no suspicious meetings found');
      return null;
    }

    // Generate a script to delete the most obviously problematic meetings
    const definitelyCrap = report.meetings.filter(m => m.isDefinitelyCrap);
    
    const cleanupScript = {
      timestamp: new Date().toISOString(),
      warning: 'THIS SCRIPT WILL DELETE MEETINGS - REVIEW CAREFULLY BEFORE RUNNING',
      meetings_to_delete: definitelyCrap.length,
      deletion_commands: definitelyCrap.map(meeting => ({
        hubspot_id: meeting.id,
        attio_id: meeting.attioId,
        title: meeting.title,
        year: meeting.year,
        api_call: `DELETE /crm/v3/objects/meetings/${meeting.id}`
      }))
    };

    await this.dataManager.saveData('cleanup_script.json', cleanupScript);

    console.log(`\n🧹 CLEANUP SCRIPT GENERATED:`);
    console.log(`Meetings marked for deletion: ${cleanupScript.meetings_to_delete}`);
    console.log(`Review cleanup_script.json before proceeding`);

    return cleanupScript;
  }

  async runAnalysis() {
    try {
      console.log('🚀 RUNNING FUTURE MEETINGS ANALYSIS...\n');
      
      const report = await this.identifyFutureMeetings();
      const cleanupScript = await this.generateCleanupScript(report);

      console.log('\n✅ ANALYSIS COMPLETE');
      console.log('📁 Files generated:');
      console.log('   - future_meetings_report.json (detailed analysis)');
      if (cleanupScript) {
        console.log('   - cleanup_script.json (deletion commands)');
      }

      return { report, cleanupScript };
    } catch (error) {
      console.error('❌ Analysis failed:', error.message);
      throw error;
    }
  }
}

module.exports = FutureMeetingCleaner;

// Run if called directly
if (require.main === module) {
  const cleaner = new FutureMeetingCleaner();
  cleaner.runAnalysis()
    .then(() => {
      console.log('\nFuture meetings analysis completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nAnalysis failed:', error.message);
      process.exit(1);
    });
}