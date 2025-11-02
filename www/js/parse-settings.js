function parseCurrentSettings(rawdata) {
  const data = rawdata;

  const lines = data.split("\n");
  console.log(lines);

  // Remove QUIMSLOT and only take 1 or 2
  this.sim = lines
    .find(
      (line) => line.includes("SIM1 ENABLE") || line.includes("SIM2 ENABLE")
    )
    .split(" ")[0]
    // remove spaces
    .replace(/\D/g, "");
  // .replace(/\"/g, "");

  try {
    this.apn = lines
      .find((line) => line.includes("+CGCONTRDP: 1"))
      .split(",")[2]
      .replace(/\"/g, "");
  } catch (error) {
    this.apn = "Failed fetching APN";
  }

  this.cellLock4GStatus = lines
    .find((line) => line.includes('LTE,Enable Bands :'))
    .split(":")[1]
    .replace(/\"/g, "");

  this.cellLock5GStatus = lines
    .find((line) => line.includes('NR5G_SA,Enable Bands :'))
    .split(":")[1]
    .replace(/\"/g, "");

  const prefNetworks = lines
    .find((line) => line.includes('^SLMODE:'))
    .split(":")[1]
    .split(",")[1]
    .replace(/\"/g, "").trim();
  if( prefNetworks === "7"){
	this.prefNetwork="AUTO"
	}else if (prefNetworks === "2"){
		this.prefNetwork="LTE Only"
	}else if (prefNetworks === "6"){
                this.prefNetwork="NR5G-NSA"
        }else if (prefNetworks === "4"){
                this.prefNetwork="NR5G-SA"
        }

/*
  this.nrModeControlStatus = lines
    .find((line) => line.includes('^SLMODE:'))
    .split(":")[1]
    .split(",")[1]
    .replace(/\"/g, "").trim();
*/
  this.apnIP = lines
    .find((line) => line.includes("+CGDCONT: 1"))
    .split(",")[1]
    .replace(/\"/g, "");

  try {
    const PCCbands = lines
      .find((line) => line.includes('PCC info:'))
      .split(":")[1]
      .split("_")[1]
      .replace(/\D/g, "");
      //.replace(/\"/g, "");
    
    // Loop over all QCAINFO: "SCC" lines and get the bands
    try {
      const SCCbands = lines
        .filter((line) => line.includes('SCC'))
        .map((line) => line.split(":")[1].split("_")[1].replace(/\D/g, ""))
        .join(", ");
      this.bands = `${PCCbands}, ${SCCbands}`;
    } catch (error) {
      this.bands = PCCbands;
    }
    
  } catch (error) {
    this.bands = "Failed fetching bands";
  }

  if (this.cellLock4GStatus == 1 && this.cellLock5GStatus == 1) {
    this.cellLockStatus = "Locked to 4G and 5G";
  } else if (this.cellLock4GStatus == 1) {
    this.cellLockStatus = "Locked to 4G";
  } else if (this.cellLock5GStatus == 1) {
    this.cellLockStatus = "Locked to 5G";
  } else {
    this.cellLockStatus = "Not Locked";
  }

  if (prefNetworks == "7") {
    this.nrModeControlStatus = "Enable All";
  } else if (prefNetworks == 6) {
    this.nrModeControlStatus = "SA Disabled";
  } else {
    this.nrModeControlStatus = "NSA Disabled";
  }
  return {
    sim: sim,
    apn: apn,
    apnIP: apnIP,
    cellLockStatus: cellLockStatus,
    prefNetwork: prefNetwork,
    nrModeControl: nrModeControlStatus,
    bands: bands,
  };
}
