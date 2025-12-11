const fs = require('fs-extra');
const path = require('path');
const HubSpotAPI = require('./hubspot-api');
const DataManager = require('./data-manager');

class TranscriptFormatter {
  constructor() {
    this.hubspot = new HubSpotAPI();
    this.dataManager = new DataManager();
  }

  /**
   * Parse malformed transcript and reformat it properly
   * @param {string} rawTranscript - The malformed transcript text
   * @returns {string} - Properly formatted transcript
   */
  formatTranscript(rawTranscript) {
    if (!rawTranscript || typeof rawTranscript !== 'string') {
      return rawTranscript;
    }

    const lines = rawTranscript.split('\n').filter(line => line.trim());
    const speakers = {};
    let currentSpeaker = null;
    let currentText = [];
    const formattedSegments = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines or "Migrated from Attio"
      if (!trimmed || trimmed === 'Migrated from Attio') {
        continue;
      }

      // Check if line contains a speaker pattern: "Speaker Name: word"
      const speakerMatch = trimmed.match(/^(.+?):\s*(.*)$/);
      
      if (speakerMatch) {
        const [, speakerName, word] = speakerMatch;
        const cleanSpeaker = speakerName.trim();
        const cleanWord = word.trim();

        // If we're switching speakers, save the previous speaker's text
        if (currentSpeaker && currentSpeaker !== cleanSpeaker) {
          if (currentText.length > 0) {
            formattedSegments.push({
              speaker: currentSpeaker,
              text: this.reconstructSentences(currentText)
            });
            currentText = [];
          }
        }

        // Update current speaker and add word
        currentSpeaker = cleanSpeaker;
        if (cleanWord) {
          currentText.push(cleanWord);
        }
      } else {
        // If no speaker pattern, treat as continuation of current speaker
        if (currentSpeaker && trimmed) {
          currentText.push(trimmed);
        }
      }
    }

    // Don't forget the last speaker's text
    if (currentSpeaker && currentText.length > 0) {
      formattedSegments.push({
        speaker: currentSpeaker,
        text: this.reconstructSentences(currentText)
      });
    }

    // Build final formatted transcript
    let formatted = '';
    if (rawTranscript.includes('Migrated from Attio')) {
      formatted += 'Migrated from Attio\n\n';
    }

    formattedSegments.forEach(segment => {
      formatted += `${segment.speaker}: ${segment.text}\n\n`;
    });

    return formatted.trim();
  }

  /**
   * Reconstruct proper sentences from array of words
   * @param {string[]} words - Array of individual words
   * @returns {string} - Properly formatted sentences
   */
  reconstructSentences(words) {
    if (!words.length) return '';

    // Simply join words with spaces - don't add artificial punctuation
    let text = words.join(' ');
    
    // Clean up spacing issues only
    text = text.replace(/\s+/g, ' '); // Normalize whitespace
    text = text.trim();
    
    // Preserve original punctuation if it exists, don't add artificial periods
    // Only capitalize first letter if it's clearly the start of a sentence
    if (text.length > 0 && /^[a-z]/.test(text)) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }

    return text;
  }

  /**
   * Fix transcripts for all meetings in HubSpot
   */
  async fixAllTranscripts() {
    console.log('🎯 STARTING TRANSCRIPT FORMATTING FIX...\n');
    
    try {
      // Get all HubSpot meetings
      console.log('📋 Fetching all HubSpot meetings...');
      const meetings = await this.hubspot.getAllMeetings();
      console.log(`Found ${meetings.length} meetings to check`);

      const results = {
        total: meetings.length,
        processed: 0,
        fixed: 0,
        skipped: 0,
        errors: 0,
        details: []
      };

      for (let i = 0; i < meetings.length; i++) {
        const meeting = meetings[i];
        console.log(`\n📝 Processing meeting ${i + 1}/${meetings.length}: ${meeting.id}`);

        try {
          const meetingBody = meeting.properties?.hs_meeting_body;
          
          if (!meetingBody) {
            console.log('   ⏭️  No transcript found - skipping');
            results.skipped++;
            results.details.push({
              meetingId: meeting.id,
              title: meeting.properties?.hs_meeting_title || 'No title',
              status: 'skipped',
              reason: 'No transcript content'
            });
            continue;
          }

          // Check if transcript needs fixing (contains the malformed pattern)
          const needsFormatting = this.needsFormatting(meetingBody);
          
          if (!needsFormatting) {
            console.log('   ✅ Transcript already properly formatted - skipping');
            results.skipped++;
            results.details.push({
              meetingId: meeting.id,
              title: meeting.properties?.hs_meeting_title || 'No title',
              status: 'skipped',
              reason: 'Already properly formatted'
            });
            continue;
          }

          console.log('   🔧 Formatting malformed transcript...');
          
          // Format the transcript
          const formattedTranscript = this.formatTranscript(meetingBody);
          
          // Update the meeting in HubSpot
          await this.hubspot.client.patch(`/crm/v3/objects/meetings/${meeting.id}`, {
            properties: {
              hs_meeting_body: formattedTranscript
            }
          });

          console.log('   ✅ Successfully updated transcript');
          results.fixed++;
          results.details.push({
            meetingId: meeting.id,
            title: meeting.properties?.hs_meeting_title || 'No title',
            status: 'fixed',
            originalLength: meetingBody.length,
            newLength: formattedTranscript.length
          });

          results.processed++;

          // Add delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 200));

        } catch (error) {
          console.error(`   ❌ Error processing meeting ${meeting.id}:`, error.message);
          results.errors++;
          results.details.push({
            meetingId: meeting.id,
            title: meeting.properties?.hs_meeting_title || 'No title',
            status: 'error',
            error: error.message
          });
        }
      }

      // Save results report
      await this.dataManager.saveData('transcript_formatting_results.json', results);

      console.log('\n' + '='.repeat(60));
      console.log('TRANSCRIPT FORMATTING COMPLETED');
      console.log('='.repeat(60));
      console.log(`Total meetings: ${results.total}`);
      console.log(`Fixed transcripts: ${results.fixed}`);
      console.log(`Skipped (already good): ${results.skipped}`);
      console.log(`Errors: ${results.errors}`);
      console.log('='.repeat(60));

      return results;

    } catch (error) {
      console.error('❌ Failed to fix transcripts:', error.message);
      throw error;
    }
  }

  /**
   * Check if transcript needs formatting (has the word-per-line issue)
   * @param {string} transcript - The transcript text
   * @returns {boolean} - True if needs formatting
   */
  needsFormatting(transcript) {
    if (!transcript) return false;

    // Count lines that match the malformed pattern: "Speaker: single_word"
    const lines = transcript.split('\n').filter(line => line.trim());
    let malformedLines = 0;
    let totalSpeakerLines = 0;

    for (const line of lines) {
      const speakerMatch = line.trim().match(/^(.+?):\s*(.*)$/);
      if (speakerMatch) {
        totalSpeakerLines++;
        const [, speaker, content] = speakerMatch;
        // If content is just one or two words, likely malformed
        const words = content.trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length <= 2) {
          malformedLines++;
        }
      }
    }

    // If more than 70% of speaker lines have 1-2 words, it's malformed
    if (totalSpeakerLines > 10 && malformedLines / totalSpeakerLines > 0.7) {
      return true;
    }

    return false;
  }

  /**
   * Test the formatter with a sample transcript
   */
  testFormatter() {
    const sampleMalformed = `Migrated from Attio

Harry Wetherald: yeah

Harry Wetherald: hello

Harry Wetherald: hello

Harry Wetherald: so

Harry Wetherald: i

Harry Wetherald: feel

Harry Wetherald: like

Harry Wetherald: i

Harry Wetherald: just

Harry Wetherald: came

Harry Wetherald: in

Harry Wetherald: the

Harry Wetherald: middle

Harry Wetherald: of

Harry Wetherald: like

Harry Wetherald: two

Harry Wetherald: parallel

Harry Wetherald: conversations

Will Patterson: guys

Will Patterson: how

Will Patterson: are

Will Patterson: you

Will Patterson: what's

Will Patterson: up`;

    console.log('🧪 TESTING TRANSCRIPT FORMATTER...\n');
    console.log('BEFORE:');
    console.log('-'.repeat(40));
    console.log(sampleMalformed);
    
    console.log('\nAFTER:');
    console.log('-'.repeat(40));
    const formatted = this.formatTranscript(sampleMalformed);
    console.log(formatted);
    
    return formatted;
  }
}

module.exports = TranscriptFormatter;

// Run if called directly
if (require.main === module) {
  const formatter = new TranscriptFormatter();
  
  // Check if user wants to run test
  if (process.argv.includes('--test')) {
    formatter.testFormatter();
  } else {
    formatter.fixAllTranscripts()
      .then((results) => {
        console.log('\n✅ Transcript formatting completed successfully!');
        console.log(`Fixed ${results.fixed} transcripts out of ${results.total} meetings`);
        process.exit(0);
      })
      .catch(error => {
        console.error('\n❌ Transcript formatting failed:', error.message);
        process.exit(1);
      });
  }
}