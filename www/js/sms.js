function fetchSMS() {
return {
  isLoading: false,
  isSending: false,
  atCommandResponse: "",
  messages: [],
  senders: [],
  dates: [],
  selectedMessages: [],
  phoneNumber: '',
  messageToSend: '',
  messageIndices: [],
  serviceCenters: [],
  showError: false,
  errorMessage: "",

  // Clear existing data
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

  handleError(message, data = "") {
    this.errorMessage = message;
    this.showError = true;
    if (data) {
      this.atCommandResponse = data;
    }
    console.error("SMS error:", message);
  },

  // Request SMS messages
  async requestSMS() {
    this.isLoading = true;
    const atcmd =
      'AT+CSMS=1;+CSDH=0;+CNMI=2,1,0,0,0;+CMGF=1;+CSCA?;+CSMP=17,167,0,8;+CPMS="SM","SM","SM";+CSCS="UCS2";+CMGL="ALL"';

    try {
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

  // Parse SMS data
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

  // Convert hexadecimal to text (assuming UTF-16BE encoding)
  convertHexToText(hex) {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    return new TextDecoder('utf-16be').decode(bytes);
  },

  // Extract hex payload from SMS body when it is mostly hex data
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

  // Decode hex payload into readable text, picking the most plausible encoding
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

  // Custom date parsing function
  parseCustomDate(dateStr) {
    const [datePart, timePart] = dateStr.split(',');
    const [day, month, year] = datePart.split('/').map(part => parseInt(part, 10));
    const [hour, minute, second] = timePart.split(':').map(part => parseInt(part, 10));

    // Convert the date into a standard Date object
    return new Date(Date.UTC(2000 + year, month - 1, day, hour, minute, second));
  },

  // Custom date formatting function
  formatDate(date) {
    const year = date.getUTCFullYear() - 2000;
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hour = date.getUTCHours().toString().padStart(2, '0');
    const minute = date.getUTCMinutes().toString().padStart(2, '0');
    const second = date.getUTCSeconds().toString().padStart(2, '0');
    return `${day}/${month}/${year},${hour}:${minute}:${second}`;
  },

  // Delete selected SMS messages
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
  
  // Delete all SMS messages
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
  
  // Encode text to UCS2 format
  encodeUCS2(input) {
    let output = '';
    for (let i = 0; i < input.length; i++) {
      const hex = input.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
      output += hex;
    }
    return output;
  },

  // Normalize phone number by removing spaces and handling prefixes
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

  // Ensure service center is available, fetch it if not
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

  // Send SMS message
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
        const params = new URLSearchParams({
          number: encodedPhoneNumber,
          msg: encodedMessage,
          Command: Command
        });
        
        try {
          const response = await fetch(`/cgi-bin/send_sms?${params.toString()}`);
          const data = await response.text();
          console.log("Response from server:", data);

          if (data.includes('+CMS ERROR')) {
            errorCode = data.match(/\+CMS ERROR: (\d+)/)?.[1];
            console.error("SMS send error:", data);
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

  // Split message into segments of specified length
  splitMessage(message, length) {
    const segments = [];
    for (let i = 0; i < message.length; i += length) {
      segments.push(message.substring(i, i + length));
    }
    return segments;
  },

  // Show notification message
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

  // Initialize
  init() {
    this.clearData();
    this.requestSMS();
  },

  // Select all or deselect all
  toggleAll(event) {
    this.selectedMessages = event.target.checked
      ? this.messages.map((_, index) => index)
      : [];
  }
};
}
