/**
 * SMS messaging management for T99W175 modem.
 *
 * Provides Alpine.js component for managing SMS messages including:
 * - Reading SMS inbox with UCS-2 decoding support
 * - Sending SMS messages with multipart support
 * - Deleting individual or all messages
 * - Storage management (SIM/memory switching)
 * - Service center number handling
 *
 * @module sms
 * @requires Alpine.js
 * @requires atcommand-utils.js
 */

/**
 * Alpine.js component for SMS messaging functionality.
 *
 * Manages SMS inbox retrieval, message parsing, sending new messages,
 * and deletion operations. Handles UCS-2 encoding/decoding for international
 * character support and provides multipart message segmentation.
 *
 * @returns {Object} Alpine.js component data object
 */
function fetchSMS() {
return {
  // Loading state for SMS retrieval operations
  isLoading: false,
  // Sending state for SMS transmission
  isSending: false,
  // Raw AT command response for debugging
  atCommandResponse: "",
  // Array of parsed message objects
  messages: [],
  // Array of sender phone numbers
  senders: [],
  // Array of formatted date strings
  dates: [],
  // Array of selected message indices for batch operations
  selectedMessages: [],
  // Phone number input for sending SMS
  phoneNumber: '',
  // Message text input for sending SMS
  messageToSend: '',
  // Array of message indices from modem
  messageIndices: [],
  // Array of service center numbers
  serviceCenters: [],
  // Error display flag
  showError: false,
  // Error message text
  errorMessage: "",
  // Track which messages are expanded by index
  expandedMessages: {},

  // Storage status - used message slots
  storageUsed: 0,
  // Storage status - total available slots
  storageTotal: 0,
  // Storage memory type ('SM' for SIM, 'ME' for memory)
  storageMemoryType: 'SM',
  // Flag indicating storage change in progress
  changingStorage: false,

  /**
   * Calculates storage usage percentage.
   *
   * @returns {number} Storage usage as percentage (0-100)
   */
  storagePercentage() {
    if (this.storageTotal === 0) return 0;
    return Math.round((this.storageUsed / this.storageTotal) * 100);
  },

  /**
   * Determines progress bar color class based on storage usage.
   *
   * Returns 'bg-danger' for >=90%, 'bg-warning' for >=70%, else 'bg-success'.
   *
   * @returns {string} Bootstrap color class for progress bar
   */
  storageProgressClass() {
    const percentage = this.storagePercentage();
    if (percentage >= 90) return 'bg-danger';
    if (percentage >= 70) return 'bg-warning';
    return 'bg-success';
  },

  /**
   * Returns human-readable memory type name.
   *
   * @returns {string} 'SIM' or 'Memory'
   */
  getMemoryTypeName() {
    return this.storageMemoryType === 'SM' ? 'SIM' : 'Memory';
  },

  /**
   * Changes SMS storage memory type (SIM or device memory).
   *
   * Switches between 'SM' (SIM) and 'ME' (device) storage.
   * Verifies the change and refreshes the SMS list from new storage.
   *
   * @async
   * @param {string} memoryType - Memory type to switch to ('SM' or 'ME')
   * @returns {Promise<void>}
   */
  async changeStorageMemory(memoryType) {
    if (this.changingStorage || memoryType === this.storageMemoryType) {
      return;
    }

    this.changingStorage = true;
    try {
      // Set the memory type
      const setResult = await ATCommandService.execute(`AT+CPMS="${memoryType}","${memoryType}","${memoryType}"`, {
        retries: 2,
        timeout: 10000,
      });

      if (!setResult.ok) {
        this.showNotification(`Failed to change storage to ${memoryType}`, 'danger');
        return;
      }

      // Query the current storage status to confirm
      const queryResult = await ATCommandService.execute('AT+CPMS?', {
        retries: 2,
        timeout: 10000,
      });

      if (queryResult.ok && queryResult.data) {
        // Parse CPMS? response - try multiple formats
        // Format 1: +CPMS: "SM",2,50,2,50,2,50
        // Format 2: +CPMS: 2,50,2,50,2,50
        let cpmsMatch = queryResult.data.match(/^\s*\+CPMS:\s*"([^"]*)",(\d+),(\d+)/m);

        if (!cpmsMatch) {
          // Try without memory type
          cpmsMatch = queryResult.data.match(/^\s*\+CPMS:\s*(\d+),(\d+)/m);
        }

        if (cpmsMatch) {
          if (cpmsMatch.length === 4) {
            // Has memory type: "SM",used,total
            this.storageMemoryType = cpmsMatch[1];
            this.storageUsed = parseInt(cpmsMatch[2], 10);
            this.storageTotal = parseInt(cpmsMatch[3], 10);
          } else if (cpmsMatch.length === 3) {
            // No memory type: used,total
            this.storageUsed = parseInt(cpmsMatch[1], 10);
            this.storageTotal = parseInt(cpmsMatch[2], 10);
          }
        }
      }

      // Refresh SMS list with new storage (skip CPMS since we just queried it)
      await this.requestSMS(true);
      this.showNotification(`Storage changed to ${this.getMemoryTypeName()}`, 'success');
    } catch (error) {
      this.showNotification(`Error changing storage: ${error.message}`, 'danger');
    } finally {
      this.changingStorage = false;
    }
  },

  /**
   * Clears all SMS data arrays and UI state.
   *
   * Resets messages, senders, dates, selections, and unchecks select-all checkbox.
   */
  clearData() {
    this.messages = [];
    this.senders = [];
    this.dates = [];
    this.selectedMessages = [];
    this.messageIndices = [];
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
    }
  },

  /**
   * Handles SMS operation errors.
   *
   * Displays error message and captures optional response data.
   *
   * @param {string} message - Error message to display
   * @param {string} [data=""] - Optional raw response data
   */
  handleError(message, data = "") {
    this.errorMessage = message;
    this.showError = true;
    if (data) {
      this.atCommandResponse = data;
    }
    console.error("SMS error:", message);
  },

  /**
   * Retrieves SMS messages from the modem.
   *
   * Queries storage status and fetches all SMS messages using AT+CMGL.
   * Parses response to extract message metadata, sender, date, and content.
   * Supports skipping CPMS query if already performed.
   *
   * @async
   * @param {boolean} [skipCPMS=false] - Skip CPMS storage query if true
   * @returns {Promise<void>}
   */
  async requestSMS(skipCPMS = false) {
    // Prevent multiple simultaneous requests
    if (this.isLoading) {
      console.log('requestSMS already loading, skipping');
      return;
    }

    this.isLoading = true;
    const atcmd =
      'AT+CSMS=1;+CSDH=0;+CNMI=2,1,0,0,0;+CMGF=1;+CSCA?;+CSMP=17,167,0,8;+CMGL="ALL"';

    try {
      // Query storage info separately (unless already done)
      if (!skipCPMS) {
        const cpmsResult = await ATCommandService.execute('AT+CPMS?', {
          retries: 2,
          timeout: 10000,
        });

        if (cpmsResult.ok && cpmsResult.data) {
          // Parse CPMS? response - try multiple formats
          // Format 1: +CPMS: "SM",2,50,2,50,2,50
          // Format 2: +CPMS: 2,50,2,50,2,50
          let cpmsMatch = cpmsResult.data.match(/^\s*\+CPMS:\s*"([^"]*)",(\d+),(\d+)/m);

          if (!cpmsMatch) {
            // Try without memory type
            cpmsMatch = cpmsResult.data.match(/^\s*\+CPMS:\s*(\d+),(\d+)/m);
          }

          if (cpmsMatch) {
            if (cpmsMatch.length === 4) {
              // Has memory type: "SM",used,total
              this.storageMemoryType = cpmsMatch[1];
              this.storageUsed = parseInt(cpmsMatch[2], 10);
              this.storageTotal = parseInt(cpmsMatch[3], 10);
            } else if (cpmsMatch.length === 3) {
              // No memory type: used,total
              this.storageUsed = parseInt(cpmsMatch[1], 10);
              this.storageTotal = parseInt(cpmsMatch[2], 10);
            }
          }
        }
      }

      // Now fetch SMS messages (without CPMS since we already queried it)
      const result = await ATCommandService.execute(atcmd, {
        retries: 2,
        timeout: 20000,
      });

      if (!result.ok || !result.data) {
        const message = result.error
          ? result.error.message
          : "Unable to retrieve SMS from the modem.";
        this.handleError(message, result.data);
        return;
      }

      this.atCommandResponse = result.data
        .split('\n')
        .filter((line) => line.trim() !== "OK" && line.trim() !== "")
        .join('\n');

      this.clearData();
      this.parseSMSData(this.atCommandResponse);
      this.showError = false;
      this.errorMessage = "";
    } catch (error) {
      this.handleError(error.message || "Network error while retrieving SMS.");
    } finally {
      this.isLoading = false;
    }
  },

  /**
   * Parses raw AT+CMGL response to extract SMS messages.
   *
   * Extracts message index, sender (with UCS-2 decoding), timestamp,
   * and message body. Handles hex-encoded UCS-2 messages and service center numbers.
   * Supports messages with international characters.
   *
   * @param {string} data - Raw AT command response containing SMS data
   */
  parseSMSData(data) {
    const cmglRegex = /^\s*\+CMGL:\s*(\d+),"[^"]*","([^"]*)"[^"]*,"([^"]*)"/gm;
    const cscaRegex = /^\s*\+CSCA:\s*"([^"]*)"/gm;
    this.messageIndices = [];
    this.serviceCenters = [];
    this.dates = [];
    this.senders = [];
    this.messages = [];


    let match;
    while ((match = cmglRegex.exec(data)) !== null) {
      const index = parseInt(match[1]);
      const senderHex = match[2];
        // Maximum world wide phone number length is 17 (North Korea), UTF-16BE Hex string comes back at 48+ for US Number, min length is 3. 
        // When 3 digit SMS short code is used the result is a 12 length string (which we then need to check if the sender hex starts with 003 or 002B(+))
        // This check is probably completley unecessary but I have no data on how the modems behave with different firmware(whether support for CSCS="UCS2" is available).
      const sender = senderHex.length > 11 && (senderHex.startsWith('002B') || senderHex.startsWith('003'))
        ? this.decodeHexToText(senderHex)
        : senderHex;
      const dateStr = match[3].replace(/\+\d{2}$/, "");
      const date = this.parseCustomDate(dateStr);
      if (isNaN(date)) {
        console.error(`Invalid Date: ${dateStr}`);
        continue;
      }
      const startIndex = cmglRegex.lastIndex;
      const nextCmgl = data.indexOf("+CMGL:", startIndex);
      const nextCsca = data.indexOf("+CSCA:", startIndex);
      let endIndex = data.length;
      if (nextCmgl !== -1) {
        endIndex = Math.min(endIndex, nextCmgl);
      }
      if (nextCsca !== -1) {
        endIndex = Math.min(endIndex, nextCsca);
      }
      const messageRaw = data.substring(startIndex, endIndex).trim();
      const messageHex = this.extractHexPayload(messageRaw);
      const message = messageHex ? this.decodeHexToText(messageHex) : messageRaw;
      this.messageIndices.push([index]);
      this.senders.push(sender);
      this.dates.push(this.formatDate(date));
      this.messages.push({ text: message, sender: sender, date: date, indices: [index] });
    }
    while ((match = cscaRegex.exec(data)) !== null) {
      const serviceCenterHex = match[1];
      const serviceCenter = this.convertHexToText(serviceCenterHex);
      this.serviceCenters.push(serviceCenter);
    }
  },

  /**
   * Converts hexadecimal string to text using UTF-16BE encoding.
   *
   * Used for decoding UCS-2 encoded SMS content and sender numbers.
   *
   * @param {string} hex - Hexadecimal string to decode
   * @returns {string} Decoded text string
   */
  convertHexToText(hex) {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    return new TextDecoder('utf-16be').decode(bytes);
  },

  /**
   * Extracts hexadecimal payload from raw SMS body.
   *
   * Determines if the message body is primarily hex-encoded (UCS-2)
   * by analyzing the hex-to-total character ratio. Returns null if not
   * predominantly hex data.
   *
   * @param {string} raw - Raw message body text
   * @returns {string|null} Extracted hex string or null if not hex data
   */
  extractHexPayload(raw) {
    const compact = raw.replace(/\s+/g, '');
    if (!compact) {
      return null;
    }
    let hexOnly = compact.replace(/[^0-9a-fA-F]/g, '');
    const ratio = hexOnly.length / compact.length;
    if (ratio < 0.7 || hexOnly.length < 2) {
      return null;
    }
    if (hexOnly.length % 2 === 1) {
      hexOnly = hexOnly.slice(0, -1);
    }
    return hexOnly;
  },

  /**
   * Decodes hex payload into readable text using optimal encoding.
   *
   * Tries both UTF-16BE and UTF-8 decoding, scores the results for
   * readability, and returns the most plausible decoding. Uses UCS-2
   * zero-even ratio analysis to determine likely encoding.
   *
   * @param {string} hex - Hexadecimal string to decode
   * @returns {string} Decoded text string
   */
  decodeHexToText(hex) {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const utf16Text = new TextDecoder('utf-16be').decode(bytes);
    const utf8Text = new TextDecoder('utf-8').decode(bytes);
    const utf16Score = this.scoreDecodedText(utf16Text);
    const utf8Score = this.scoreDecodedText(utf8Text);
    const zeroEvenRatio = this.ucs2ZeroEvenRatio(bytes);
    if (zeroEvenRatio > 0.3) {
      return utf16Score >= utf8Score - 0.1 ? utf16Text : utf8Text;
    }
    return utf8Score >= utf16Score ? utf8Text : utf16Text;
  },

  /**
   * Scores decoded text for readability and validity.
   *
   * Analyzes character distribution to determine if text is valid.
   * Higher scores indicate more valid text (letters, numbers, punctuation).
   * Penalizes replacement characters and control characters.
   *
   * @param {string} text - Text to score
   * @returns {number} Score from negative to positive, normalized by length
   */
  scoreDecodedText(text) {
    if (!text) {
      return 0;
    }
    let score = 0;
    for (const char of text) {
      if (char === '\uFFFD') {
        score -= 5;
        continue;
      }
      if (/\p{L}|\p{N}|\p{P}|\p{Zs}/u.test(char)) {
        score += 1;
      } else if (/\p{C}/u.test(char)) {
        score -= 2;
      }
    }
    return score / text.length;
  },

  /**
   * Calculates the ratio of zero bytes at even positions.
   *
   * UCS-2/UTF-16BE encoded text has zeros at even byte positions for
   * ASCII characters. High ratio indicates UTF-16BE encoding.
   *
   * @param {Uint8Array} bytes - Byte array to analyze
   * @returns {number} Ratio of zero bytes at even positions (0-1)
   */
  ucs2ZeroEvenRatio(bytes) {
    if (!bytes || bytes.length < 2) {
      return 0;
    }
    let zeroEven = 0;
    const pairs = Math.floor(bytes.length / 2);
    for (let i = 0; i < pairs; i++) {
      if (bytes[i * 2] === 0) {
        zeroEven += 1;
      }
    }
    return zeroEven / pairs;
  },

  /**
   * Parses custom date format from modem SMS response.
   *
   * Parses date string in "YY/MM/DD,HH:MM:SS" format and creates
   * a Date object. Years 00-99 are assumed to be 2000-2099.
   *
   * @param {string} dateStr - Date string from modem
   * @returns {Date} Parsed Date object
   */
  parseCustomDate(dateStr) {
    const [datePart, timePart] = dateStr.split(',');
    // Format from modem is YY/MM/DD
    const [year, month, day] = datePart.split('/').map(part => parseInt(part, 10));
    const [hour, minute, second] = timePart.split(':').map(part => parseInt(part, 10));

    // Convert the date into a standard Date object (years 00-99 are assumed to be 2000-2099)
    return new Date(Date.UTC(2000 + year, month - 1, day, hour, minute, second));
  },

  /**
   * Formats Date object into custom display string.
   *
   * Formats date as "DD/MM/YYYY - HH:MM:SS" in UTC timezone.
   *
   * @param {Date} date - Date object to format
   * @returns {string} Formatted date string
   */
  formatDate(date) {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hour = date.getUTCHours().toString().padStart(2, '0');
    const minute = date.getUTCMinutes().toString().padStart(2, '0');
    const second = date.getUTCSeconds().toString().padStart(2, '0');
    return `${day}/${month}/${year} - ${hour}:${minute}:${second}`;
  },

  /**
   * Deletes selected SMS messages from modem.
   *
   * Deletes messages selected by user. If all messages are selected,
   * uses deleteAllSMS() for efficiency. Batches delete commands
   * using AT+CMGD with semicolon separators.
   *
   * @async
   * @returns {Promise<void>}
   */
  async deleteSelectedSMS() {
    if (this.selectedMessages.length === 0) {
      console.warn("No SMS selected.");
      return;
    }
    if (!this.messageIndices || this.messageIndices.length === 0) {
      console.error("SMS indexes are not initialized correctly or are empty.");
      return;
    }

    // Check if all messages are selected
    const isAllSelected = this.selectedMessages.length === this.messages.length;

    if (isAllSelected) {
      await this.deleteAllSMS();
      return;
    }

    const indicesToDelete = [];
    this.selectedMessages.forEach((index) => {
      indicesToDelete.push(...this.messages[index].indices);
    });
    if (indicesToDelete.length === 0) {
      console.warn("No valid SMS indexes.");
      return;
    }

    const atCommands = indicesToDelete
      .map((index, i) => (i === 0 ? `AT+CMGD=${index}` : `+CMGD=${index}`))
      .join(';');

    try {
      const result = await ATCommandService.execute(atCommands, {
        retries: 2,
        timeout: 15000,
      });

      if (!result.ok) {
        const message = result.error
          ? result.error.message
          : "Unable to delete the selected SMS.";
        this.handleError(message, result.data);
        return;
      }

      this.selectedMessages = [];
      await this.requestSMS();
    } catch (error) {
      this.handleError(error.message || "Network error while deleting SMS.");
    }
  },

  /**
   * Deletes all SMS messages from current storage.
   *
   * Uses AT+CMGD=,4 command to delete all messages efficiently.
   * Refreshes message list after deletion.
   *
   * @async
   * @returns {Promise<void>}
   */
  async deleteAllSMS() {
    try {
      const result = await ATCommandService.execute('AT+CMGD=,4', {
        retries: 2,
        timeout: 15000,
      });

      if (!result.ok) {
        const message = result.error
          ? result.error.message
          : "Unable to delete all SMS.";
        this.handleError(message, result.data);
        return;
      }

      await this.requestSMS();
    } catch (error) {
      this.handleError(error.message || "Network error while deleting SMS.");
    }
  },

  /**
   * Encodes text string to UCS-2 hexadecimal format.
   *
   * Converts each character to its 4-digit uppercase hex representation.
   * Used for encoding SMS messages and phone numbers for international support.
   *
   * @param {string} input - Text string to encode
   * @returns {string} UCS-2 hex encoded string
   */
  encodeUCS2(input) {
    let output = '';
    for (let i = 0; i < input.length; i++) {
      const hex = input.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
      output += hex;
    }
    return output;
  },

  /**
   * Normalizes phone number for SMS transmission.
   *
   * Removes spaces and converts '+' prefix to '00' international format.
   * Returns the number as-is without adding country code prefixes.
   *
   * @param {string} phoneNumber - Phone number to normalize
   * @returns {string} Normalized phone number
   */
  normalizePhoneNumber(phoneNumber) {
    // Remove all spaces from the number
    let normalized = phoneNumber.replace(/\s+/g, '');

    // If the number starts with '+', replace it with '00'
    if (normalized.startsWith('+')) {
      normalized = '00' + normalized.substring(1);
    }

    // Return the normalized number as-is (no automatic prefix addition)
    return normalized;
  },

  /**
   * Ensures SMS service center number is available.
   *
   * Retrieves service center number using AT+CSCA? if not already cached.
   * Required before sending SMS messages.
   *
   * @async
   * @returns {Promise<boolean>} True if service center is available
   */
  async ensureServiceCenter() {
    if (this.serviceCenters && this.serviceCenters.length > 0) {
      return true; // Service center already available
    }

    // Try to retrieve only the service center with a lighter command
    try {
      const result = await ATCommandService.execute('AT+CSCA?', {
        retries: 1,
        timeout: 5000,
      });

      if (result.ok && result.data) {
        const cscaRegex = /^\s*\+CSCA:\s*"([^"]*)"/gm;
        let match;
        while ((match = cscaRegex.exec(result.data)) !== null) {
          const serviceCenterHex = match[1];
          const serviceCenter = this.convertHexToText(serviceCenterHex);
          if (!this.serviceCenters) {
            this.serviceCenters = [];
          }
          this.serviceCenters.push(serviceCenter);
        }
        return this.serviceCenters.length > 0;
      }
    } catch (error) {
      console.error("Error retrieving service center:", error);
    }

    return false;
  },

  /**
   * Sends SMS message with UCS-2 encoding.
   *
   * Sends message via send_sms CGI endpoint with multipart support.
   * Segments messages longer than 70 UCS-2 characters. Normalizes phone
   * number and encodes both number and message to UCS-2 hex format.
   *
   * @async
   * @returns {Promise<void>}
   */
  async sendSMS() {
    // Prevent double submission
    if (this.isSending) {
      return;
    }

    // Validate input
    if (!this.phoneNumber || !this.messageToSend) {
      this.showNotification("Please enter both phone number and message.", "warning");
      return;
    }

    this.isSending = true;

    try {
      // Verify and retrieve the service center if necessary
      const hasServiceCenter = await this.ensureServiceCenter();
      
      if (!hasServiceCenter) {
        this.showNotification("Unable to retrieve Service Center. Please check modem connection.", "danger");
        return;
      }

      // Normalize the phone number
      const phoneNumberWithCountryCode = this.normalizePhoneNumber(this.phoneNumber);
      
      const encodedPhoneNumber = this.encodeUCS2(phoneNumberWithCountryCode);
      const messageSegments = this.splitMessage(this.messageToSend, 70);
      const uid = Math.floor(Math.random() * 256);
      const totalSegments = messageSegments.length;
      let allSegmentsSent = true;
      let errorCode = null;
      
      for (let i = 0; i < totalSegments; i++) {
        const segment = messageSegments[i];
        const encodedMessage = this.encodeUCS2(segment);
        const currentSegment = i + 1;
        const Command = `${uid},${currentSegment},${totalSegments}`;

        const payload = {
          number: encodedPhoneNumber,
          message: encodedMessage,
          command: Command
        };

        try {
          const response = await fetch('/cgi-bin/send_sms', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
          });

          const data = await response.json();
          console.log("Response from server:", data);

          if (!data.success) {
            errorCode = data.error_code || 'unknown';
            console.error("SMS send error:", data.message, data.output);
            allSegmentsSent = false;
            break;
          }
        } catch (error) {
          console.error("Fetch error:", error);
          allSegmentsSent = false;
          break;
        }
      }
      
      if (allSegmentsSent) {
        this.showNotification("SMS sent successfully!", "success");
        // Clear form after successful send
        this.phoneNumber = '';
        this.messageToSend = '';
      } else {
        this.showNotification(`SMS sending failed! Error: ${errorCode || 'unknown'}`, "danger");
      }
    } finally {
      this.isSending = false;
    }
  },

  /**
   * Splits message into segments of specified length.
   *
   * Used for multipart SMS messages. Each segment is limited to 70 UCS-2
   * characters (160 bytes for 7-bit GSM encoding, 140 for 8-bit, 70 for UCS-2).
   *
   * @param {string} message - Message text to split
   * @param {number} length - Maximum length per segment
   * @returns {string[]} Array of message segments
   */
  splitMessage(message, length) {
    const segments = [];
    for (let i = 0; i < message.length; i += length) {
      segments.push(message.substring(i, i + length));
    }
    return segments;
  },

  /**
   * Displays notification message to user.
   *
   * Shows temporary alert notification that auto-dismisses after 3 seconds.
   * Uses Bootstrap alert classes for styling.
   *
   * @param {string} message - Notification message to display
   * @param {string} [type="info"] - Bootstrap alert type (success, danger, warning, info)
   */
  showNotification(message, type = "info") {
    const notification = document.getElementById('notification');
    if (notification) {
      notification.innerText = message;
      notification.className = `alert alert-${type}`;
      notification.style.display = 'block';
      setTimeout(() => {
        notification.style.display = 'none';
      }, 3000);
    }
  },

  /**
   * Initializes SMS component on page load.
   *
   * Clears any existing data and fetches SMS messages from modem.
   */
  init() {
    this.clearData();
    this.requestSMS();
  },

  /**
   * Toggles selection state of all messages.
   *
   * Selects or deselects all messages based on checkbox state.
   * Called when "Select All" checkbox is toggled.
   *
   * @param {Event} event - Checkbox change event
   */
  toggleAll(event) {
    this.selectedMessages = event.target.checked
      ? this.messages.map((_, index) => index)
      : [];
  },

  /**
   * Toggles expanded state of a single message.
   *
   * Shows/hides full message content in the UI.
   *
   * @param {number} index - Message index in messages array
   */
  toggleMessage(index) {
    this.expandedMessages[index] = !this.expandedMessages[index];
  },

  /**
   * Checks if a message is currently expanded.
   *
   * @param {number} index - Message index in messages array
   * @returns {boolean} True if message is expanded
   */
  isMessageExpanded(index) {
    return this.expandedMessages[index] === true;
  }
};
}
