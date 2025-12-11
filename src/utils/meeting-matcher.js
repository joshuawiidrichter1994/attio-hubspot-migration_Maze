const moment = require('moment');

/**
 * Utility class for matching meetings between Attio and HubSpot
 * based on title and date similarity since no Attio ID mapping exists
 */
class MeetingMatcher {
  
  /**
   * Match Attio meetings with HubSpot meetings by title and date similarity
   * @param {Array} attioMeetings - Array of Attio meetings
   * @param {Array} hubspotMeetings - Array of HubSpot meetings
   * @returns {Array} Array of matched meeting pairs
   */
  matchMeetings(attioMeetings, hubspotMeetings) {
    const matches = [];
    const unmatchedAttio = [];
    const unmatchedHubSpot = [...hubspotMeetings];

    console.log(`🔍 Starting meeting matching: ${attioMeetings.length} Attio vs ${hubspotMeetings.length} HubSpot meetings`);

    for (const attioMeeting of attioMeetings) {
      const bestMatch = this.findBestMatch(attioMeeting, unmatchedHubSpot);
      
      if (bestMatch) {
        matches.push({
          attio: attioMeeting,
          hubspot: bestMatch.meeting,
          confidence: bestMatch.score,
          matchedBy: bestMatch.matchedBy
        });
        
        // Remove the matched HubSpot meeting from the pool
        const index = unmatchedHubSpot.findIndex(m => m.id === bestMatch.meeting.id);
        if (index !== -1) {
          unmatchedHubSpot.splice(index, 1);
        }
      } else {
        unmatchedAttio.push(attioMeeting);
      }
    }

    console.log(`✅ Matching results:`);
    console.log(`   📍 Matched pairs: ${matches.length}`);
    console.log(`   🔴 Unmatched Attio: ${unmatchedAttio.length}`);
    console.log(`   🔵 Unmatched HubSpot: ${unmatchedHubSpot.length}`);

    return {
      matches,
      unmatchedAttio,
      unmatchedHubSpot
    };
  }

  /**
   * Find the best matching HubSpot meeting for an Attio meeting
   * @param {Object} attioMeeting - Attio meeting object
   * @param {Array} hubspotMeetings - Array of available HubSpot meetings
   * @returns {Object|null} Best match with score and reason
   */
  findBestMatch(attioMeeting, hubspotMeetings) {
    let bestMatch = null;
    let bestScore = 0;
    const minScore = 0.6; // Lowered minimum confidence threshold

    for (const hubspotMeeting of hubspotMeetings) {
      const score = this.calculateSimilarityScore(attioMeeting, hubspotMeeting);
      
      if (score.total > bestScore && score.total >= minScore) {
        bestScore = score.total;
        bestMatch = {
          meeting: hubspotMeeting,
          score: score.total,
          matchedBy: score.breakdown
        };
      }
    }

    return bestMatch;
  }

  /**
   * Calculate similarity score between an Attio and HubSpot meeting
   * @param {Object} attioMeeting - Attio meeting object
   * @param {Object} hubspotMeeting - HubSpot meeting object
   * @returns {Object} Score breakdown and total
   */
  calculateSimilarityScore(attioMeeting, hubspotMeeting) {
    const breakdown = {};
    let total = 0;

    // Title similarity (weight: 0.6)
    const titleScore = this.calculateTitleSimilarity(
      attioMeeting.title || '',
      hubspotMeeting.properties?.hs_meeting_title || ''
    );
    breakdown.title = titleScore;
    total += titleScore * 0.6;

    // Date similarity (weight: 0.4)
    const dateScore = this.calculateDateSimilarity(attioMeeting, hubspotMeeting);
    breakdown.date = dateScore;
    total += dateScore * 0.4;

    return {
      breakdown,
      total: Math.round(total * 100) / 100 // Round to 2 decimal places
    };
  }

  /**
   * Calculate title similarity using normalized comparison
   * @param {string} title1 - First title
   * @param {string} title2 - Second title
   * @returns {number} Similarity score (0-1)
   */
  calculateTitleSimilarity(title1, title2) {
    if (!title1 || !title2) return 0;

    // Normalize titles (lowercase, remove special chars, trim)
    const normalize = (str) => str
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const normalizedTitle1 = normalize(title1);
    const normalizedTitle2 = normalize(title2);

    // Exact match
    if (normalizedTitle1 === normalizedTitle2) return 1;

    // Check if one is contained in the other
    if (normalizedTitle1.includes(normalizedTitle2) || normalizedTitle2.includes(normalizedTitle1)) {
      return 0.9;
    }

    // Calculate word overlap
    const words1 = normalizedTitle1.split(' ').filter(w => w.length > 2);
    const words2 = normalizedTitle2.split(' ').filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;

    const commonWords = words1.filter(word => words2.includes(word));
    const overlapScore = (commonWords.length * 2) / (words1.length + words2.length);

    return Math.min(overlapScore, 0.8); // Cap at 0.8 for partial matches
  }

  /**
   * Calculate date similarity between meetings
   * @param {Object} attioMeeting - Attio meeting object
   * @param {Object} hubspotMeeting - HubSpot meeting object
   * @returns {number} Similarity score (0-1)
   */
  calculateDateSimilarity(attioMeeting, hubspotMeeting) {
    try {
      const attioDate = this.extractAttioDate(attioMeeting);
      const hubspotDate = this.extractHubSpotDate(hubspotMeeting);

      if (!attioDate || !hubspotDate) return 0;

      const diffInHours = Math.abs(moment(attioDate).diff(moment(hubspotDate), 'hours'));

      // Same day = 1.0
      if (diffInHours <= 12) return 1.0;
      
      // Within 1 day = 0.8
      if (diffInHours <= 24) return 0.8;
      
      // Within 2 days = 0.6
      if (diffInHours <= 48) return 0.6;
      
      // Within 1 week = 0.3
      if (diffInHours <= 168) return 0.3;
      
      // More than 1 week = 0
      return 0;

    } catch (error) {
      console.warn('Date comparison error:', error.message);
      return 0;
    }
  }

  /**
   * Extract date from Attio meeting
   * @param {Object} attioMeeting - Attio meeting object
   * @returns {Date|null} Extracted date
   */
  extractAttioDate(attioMeeting) {
    try {
      // Try start date
      if (attioMeeting.start) {
        if (typeof attioMeeting.start === 'object' && attioMeeting.start.timestamp) {
          return new Date(attioMeeting.start.timestamp);
        }
        if (typeof attioMeeting.start === 'string') {
          return new Date(attioMeeting.start);
        }
        if (typeof attioMeeting.start === 'object' && attioMeeting.start.date) {
          return new Date(attioMeeting.start.date);
        }
      }

      // Fallback to created_at
      if (attioMeeting.created_at) {
        return new Date(attioMeeting.created_at);
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract date from HubSpot meeting
   * @param {Object} hubspotMeeting - HubSpot meeting object
   * @returns {Date|null} Extracted date
   */
  extractHubSpotDate(hubspotMeeting) {
    try {
      const props = hubspotMeeting.properties || {};
      
      // Try start time first
      if (props.hs_meeting_start_time) {
        // Check if it's already an ISO string
        if (typeof props.hs_meeting_start_time === 'string' && 
            (props.hs_meeting_start_time.includes('T') || props.hs_meeting_start_time.includes('-'))) {
          return new Date(props.hs_meeting_start_time);
        }
        // Otherwise treat as timestamp
        return new Date(parseInt(props.hs_meeting_start_time));
      }

      // Fallback to create date
      if (props.hs_createdate) {
        if (typeof props.hs_createdate === 'string' && 
            (props.hs_createdate.includes('T') || props.hs_createdate.includes('-'))) {
          return new Date(props.hs_createdate);
        }
        return new Date(parseInt(props.hs_createdate));
      }

      return null;
    } catch (error) {
      return null;
    }
  }
}

module.exports = MeetingMatcher;