const HubSpotAPI = require('./utils/hubspot-api');
const fs = require('fs');
const path = require('path');

class MeetingRestorer {
  constructor() {
    this.hubspot = new HubSpotAPI();
    this.fixedCount = 0;
    this.skippedCount = 0;
    this.errorCount = 0;
  }

  /**
   * Main restoration process
   */
  async restoreGoodMeetings() {
    console.log('🔄 Starting meeting restoration process...\n');
    
    try {
      // Get all meetings from HubSpot
      console.log('📥 Fetching all meetings from HubSpot...');
      const allMeetings = await this.getAllMeetings();
      console.log(`   Found ${allMeetings.length} total meetings\n`);

      // Identify meetings that were incorrectly modified
      const meetingsToRestore = this.identifyMeetingsToRestore(allMeetings);
      console.log(`🎯 Found ${meetingsToRestore.length} meetings that need restoration\n`);

      if (meetingsToRestore.length === 0) {
        console.log('✅ No meetings need restoration!');
        return;
      }

      // Restore meetings one by one
      await this.restoreMeetings(meetingsToRestore);

      // Summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 RESTORATION SUMMARY');
      console.log('='.repeat(60));
      console.log(`✅ Restored: ${this.fixedCount} meetings`);
      console.log(`⏭️ Skipped: ${this.skippedCount} meetings`);
      console.log(`❌ Errors: ${this.errorCount} meetings`);
      console.log('='.repeat(60));

    } catch (error) {
      console.error('❌ Critical error during restoration:', error.message);
      throw error;
    }
  }

  /**
   * Get all meetings from HubSpot
   */
  async getAllMeetings() {
    const meetings = [];
    let after = undefined;

    do {
      const params = {
        limit: 100,
        properties: ['hs_meeting_title', 'hs_meeting_body', 'hs_timestamp', 'hs_meeting_start_time'].join(','),
        ...(after && { after })
      };

      const response = await this.hubspot.client.get('/crm/v3/objects/meetings', { params });
      meetings.push(...response.data.results);
      after = response.data.paging?.next?.after;

      console.log(`   Fetched ${meetings.length} meetings so far...`);
    } while (after);

    return meetings;
  }

  /**
   * Identify meetings that were incorrectly modified by the script
   */
  identifyMeetingsToRestore(meetings) {
    const meetingsToRestore = [];

    for (const meeting of meetings) {
      const body = meeting.properties.hs_meeting_body || '';
      
      // Check if this meeting was incorrectly modified by the script
      const wasIncorrectlyModified = this.wasIncorrectlyModified(body);
      
      if (wasIncorrectlyModified) {
        // Try to extract the original content that should be restored
        const originalContent = this.extractOriginalContent(body);
        
        if (originalContent) {
          meetingsToRestore.push({
            ...meeting,
            originalContent
          });
          
          const title = meeting.properties.hs_meeting_title || `Meeting ${meeting.id}`;
          console.log(`   🔍 Needs restoration: ${title.substring(0, 50)}...`);
        }
      }
    }

    return meetingsToRestore;
  }

  /**
   * Check if a meeting was incorrectly modified by looking for the script's signature
   */
  wasIncorrectlyModified(body) {
    // The script added "Attendee description" at the start with specific formatting
    // BUT we want to keep meetings that already had this good format
    
    // Check if it has the bad script modifications:
    // 1. Starts with "Attendee description" (which the script forced)
    // 2. Has the exact format the script created
    // 3. But DOESN'T have real transcript content (indicating it was a good meeting that got overwritten)
    
    if (!body.startsWith('Attendee description')) {
      return false; // Not touched by script
    }
    
    // Check if it has the script's specific format structure
    const hasScriptFormat = body.includes('📹 Call Recording\n🎥 Video: Click to watch video\n\n🔗 Direct link:') &&
                           body.includes('🆔 Recording ID:') &&
                           body.includes('📝 Call Transcript');
    
    if (!hasScriptFormat) {
      return false; // Not touched by script
    }
    
    // Now check if this was a GOOD meeting that got overwritten
    // Good meetings would have had real transcripts with actual speaker dialogue
    // Bad meetings that needed fixing would have had placeholder content
    
    // If it has placeholder content, it was legitimately fixed and should NOT be restored
    if (body.includes('[This is a placeholder transcript') || 
        body.includes('placeholder-url-') ||
        body.includes('Processed: 2025-12-08') ||
        body.includes('[Actual transcription would appear here')) {
      return false; // This was a meeting that legitimately needed fixing
    }
    
    // If we get here, this appears to be a meeting the script modified
    // but we need to check if it had real content that got overwritten
    return true;
  }

  /**
   * Extract original content from a modified meeting
   * This tries to restore the proper format based on existing content
   */
  extractOriginalContent(body) {
    try {
      // Extract the video URL if present
      const videoUrlMatch = body.match(/🔗 Direct link:\s*(https:\/\/[^\s\n]+)/);
      const videoUrl = videoUrlMatch ? videoUrlMatch[1] : '';
      
      // Extract recording ID if present  
      const recordingIdMatch = body.match(/🆔 Recording ID:\s*([^\n]+)/);
      const recordingId = recordingIdMatch ? recordingIdMatch[1].trim() : '';
      
      // Extract transcript content
      const transcriptMatch = body.match(/📝 Call Transcript\s*([\s\S]+)$/);
      let transcriptContent = '';
      
      if (transcriptMatch) {
        transcriptContent = transcriptMatch[1].trim();
        
        // If it's real dialogue content (has speaker names), keep it
        if (transcriptContent.includes(':') && 
            (transcriptContent.includes('Will Patterson:') || 
             transcriptContent.includes('Tim Salvador:') ||
             transcriptContent.includes('Neel Sata:') ||
             transcriptContent.includes('Harry Wetherald:') ||
             transcriptContent.includes('Mike Cote:') ||
             /\w+\s+\w+:/.test(transcriptContent))) {
          
          // This looks like real transcript content - restore the proper format
          const properFormat = `Attendee description

📹 Call Recording
🎥 Video: Click to watch video

🔗 Direct link: ${videoUrl}

🆔 Recording ID: ${recordingId}

📝 Call Transcript
Migrated from Attio

${transcriptContent}`;

          return properFormat;
        }
      }
      
      return null; // No real content to restore
      
    } catch (error) {
      console.error('Error extracting original content:', error.message);
      return null;
    }
  }

  /**
   * Restore meetings to their proper format
   */
  async restoreMeetings(meetingsToRestore) {
    console.log(`🔧 Restoring ${meetingsToRestore.length} meetings...\n`);
    
    for (let i = 0; i < meetingsToRestore.length; i++) {
      const meeting = meetingsToRestore[i];
      const title = meeting.properties.hs_meeting_title || `Meeting ${meeting.id}`;
      
      try {
        console.log(`[${i + 1}/${meetingsToRestore.length}] Restoring: ${title.substring(0, 40)}...`);
        
        // Update the meeting with the restored content
        const updateData = {
          properties: {
            hs_meeting_body: meeting.originalContent
          }
        };
        
        await this.hubspot.client.patch(`/crm/v3/objects/meetings/${meeting.id}`, updateData);
        
        this.fixedCount++;
        console.log(`   ✅ Restored meeting ${meeting.id}`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        this.errorCount++;
        console.error(`   ❌ Error restoring meeting ${meeting.id}:`, error.message);
      }
    }
  }
}

// Main execution
async function main() {
  const restorer = new MeetingRestorer();
  
  try {
    await restorer.restoreGoodMeetings();
    console.log('\n🎉 Meeting restoration completed successfully!');
  } catch (error) {
    console.error('\n💥 Meeting restoration failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = MeetingRestorer;