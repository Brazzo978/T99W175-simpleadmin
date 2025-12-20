function fetchDeviceInfo() {
  return {
    manufacturer: "-",
    modelName: "-",
    firmwareVersion: "-",
    imsi: "-",
    iccid: "-",
    imei: "-",
    newImei: null,
    lanIp: "-",
    wwanIpv4: "-",
    wwanIpv6: "-",
    phoneNumber: "Unknown",
    simpleAdminVersion: "-",
    atcmd: null,
    atCommandResponse: "",
    errorMessage: "",
    showError: false,
    showModal: false,
    isLoading: false,
    isRebooting: false,
    countdown: 3,

    handleError(message, data = "") {
      this.errorMessage = message;
      this.showError = true;
      if (data) {
        this.atCommandResponse = data;
      }
      console.error("AT command error:", message);
    },

    async sendATCommand() {
      if (!this.atcmd) {
        // Use ATI as default command
        console.log(
          "AT Command is empty, using ATI as default command: "
        );
      }

      this.isLoading = true;

      try {
        const result = await ATCommandService.execute(this.atcmd, {
          retries: 3,
          timeout: 12000,
        });

        if (!result.ok) {
          const message = result.error
            ? result.error.message
            : "Unknown error while executing the command.";
          this.handleError(message, result.data);
          return;
        }

        this.atCommandResponse = result.data;
        this.showError = false;
      } catch (error) {
        this.handleError(error.message || "Network error while executing the command.");
      } finally {
        this.isLoading = false;
      }
    },

    async fetchATCommand() {
      this.atcmd =
        'AT+CGMI;+CGMM;^VERSION?;+CIMI;+ICCID;+CGSN;+CNUM;+CGCONTRDP=1';
      this.isLoading = true;
      try {
        const result = await ATCommandService.execute(this.atcmd, {
          retries: 3,
          timeout: 15000,
        });

        if (!result.ok) {
          const message = result.error
            ? result.error.message
            : "Unable to retrieve modem information.";
          this.handleError(message, result.data);
          return;
        }

        this.atCommandResponse = result.data;
        this.showError = false;
        this.parseFetchedData();
      } catch (error) {
        this.handleError(error.message || "Network error while retrieving modem information.");
      } finally {
        this.isLoading = false;
      }
    },

    fetchlanIp() {
      fetch("/cgi-bin/get_lanip")
        .then((res) => res.json())
        .then((data) => {
          this.lanIp = data.lanip;
        });
    },

    parseFetchedData() {
if (!this.atCommandResponse) {
this.handleError("Empty AT response from the modem.");
this.isLoading = false;
return;
}

const lines = this.atCommandResponse
.split(/\r?\n/)
.map(l => l.trim())
.filter(l => l && l !== "OK");

console.log("AT Command Response:", lines);

let ctx = null;

let manufacturer = this.manufacturer || "-";
let modelName = this.modelName || "-";
let firmwareVersion = this.firmwareVersion || "-";
let imsi = this.imsi || "";
let iccid = this.iccid || "";
let imei = this.imei || "-";
let phoneNumber = this.phoneNumber || "Unknown";
let wwanIpv4 = this.wwanIpv4 || "-";
let wwanIpv6 = this.wwanIpv6 || "-";

try {
for (const line of lines) {
// Record which command produced the following lines
if (line.startsWith("AT+")) { ctx = line; continue; }

// Firmware (e.g. ^VERSION: T99W175.F0.6...)
if (line.startsWith("^VERSION:")) {
  const afterColon = line.split(":")[1]?.trim() || line;
  firmwareVersion = afterColon;
  // Fallback: derive the model from the prefix before the first "."
  if (modelName === "-" || !modelName) {
    const m = afterColon.match(/^([A-Za-z0-9_-]+)/);
    if (m) modelName = m[1];
  }
  continue;
}

// PDP (+CGCONTRDP: ...,"IPv4","IPv6",...)
if (line.startsWith("+CGCONTRDP:")) {
  const parts = line.split(",");
  wwanIpv4 = parts[3]?.replace(/"/g, "") || "-";
  wwanIpv6 = parts[4]?.replace(/"/g, "") || "-";
  continue;
}

// ICCID (supports "ICCID:" and "+ICCID:")
if (line.startsWith("ICCID:")) { iccid = line.replace("ICCID:", "").trim(); continue; }
if (line.startsWith("+ICCID:")) { iccid = line.split(":")[1]?.replace(/"/g, "").trim() || iccid; continue; }

// IMSI
if (ctx?.startsWith("AT+CIMI") && /^\d{15}$/.test(line)) {
  imsi = line;
  continue;
}
// Fallback IMSI: 15 digits, does not start with 89 (ICCID), and is not an IMEI
if ((!imsi || imsi === "-") && /^\d{15}$/.test(line) && !line.startsWith("89") && line !== imei) {
  imsi = line;
  continue;
}

// IMEI
if (ctx?.startsWith("AT+CGSN")) {
  // It can be digits only or the string "+CGSN: 86..."
  const m = line.match(/(\d{15,17})/);
  if (m) { imei = m[1].slice(0, 15); }
  continue;
}
// Fallback IMEI: if "+CGSN:" appears in the line
if (line.startsWith("+CGSN:")) {
  const m = line.match(/(\d{15,17})/);
  if (m) { imei = m[1].slice(0, 15); }
  continue;
}
// Final IMEI fallback: 15-17 digits that are not ICCID/IMSI (ICCID starts with 89)
if ((imei === "-" || !imei) && /^\d{15,17}$/.test(line) && !line.startsWith("89") && line !== imsi) {
  imei = line.slice(0, 15);
  continue;
}

// Phone number
if (line.startsWith("+CNUM:")) {
  const seg = line.split(",");
  const num = seg[1]?.replace(/"/g, "").trim();
  if (num) phoneNumber = num;
  continue;
}

// Manufacturer from AT+CGMI (next line)
if (ctx?.startsWith("AT+CGMI")) { manufacturer = line; ctx = null; continue; }

// Model name from AT+CGMM (next line)
if (ctx?.startsWith("AT+CGMM")) { modelName = line; ctx = null; continue; }

// Fallback manufacturer (known vendors)
if (manufacturer === "-" && /QUALCOMM|QUECTEL|HUAWEI|FIBOCOM|Sierra/i.test(line)) {
  manufacturer = line;
}
}

// Assign values to UI fields
this.manufacturer = manufacturer || "-";
this.modelName = modelName || "-";
this.firmwareVersion = firmwareVersion || "-";
this.imsi = imsi || " ";
this.iccid = iccid || " ";
this.imei = imei || "-";
this.phoneNumber = phoneNumber || "Unknown";
this.wwanIpv4 = wwanIpv4 || "-";
this.wwanIpv6 = wwanIpv6 || "-";
// Define the GUI version here
this.simpleAdminVersion = "T99-RC03-Final";
this.showError = false;
} catch (error) {
console.error("Parsing error:", error);
this.handleError("Unable to interpret the modem response.", this.atCommandResponse);
} finally {
this.isLoading = false;
}
},

    updateIMEI() {
let extended = "80A" + this.newImei;

    // 2. Swap each pair of characters
      let swapped = "";
      for (let i = 0; i < extended.length; i += 2) {
      let pair = extended.substr(i, 2);
      if (pair.length === 2) {
          swapped += pair[1] + pair[0];
      } else {
          swapped += pair[0];
              }
      }

    // 3. Insert commas every two characters and convert to lowercase
      let formatted = swapped.match(/.{1,2}/g).join(",").toLowerCase();
      //console.log(formatted)
      this.atcmd = `at^nv=550,"0"';^nv=550,9,"${formatted}"`;
      this.sendATCommand();
      this.rebootDevice();
    },

    rebootDevice() {
      this.atcmd = "AT+CFUN=1,1";
      this.sendATCommand();

      this.isLoading = true;
      this.showModal = false;
      this.isRebooting = true;
      this.countdown = 40;
      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.isLoading = false;
          this.showModal = false;
          this.isRebooting = false;
          this.init();
        }
      }, 1000);
    },

    openModal() {
      if (!this.newImei) {
        alert("No new IMEI provided.");
        return;
      }

      if (this.newImei.length !== 15) {
        alert("IMEI is invalid");
        return;
      }

      if (this.newImei === this.imei) {
        alert("IMEI is the same as the current IMEI");
        return;
      }

      this.showModal = true;
    },

    closeModal() {
      this.showModal = false;
    },

    init() {
      this.fetchATCommand();
this.fetchlanIp();
    },
  };
}
