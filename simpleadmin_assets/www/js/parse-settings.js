function parseCurrentSettings(rawdata) {
  const lines = rawdata.split("\n");
  console.log(lines);

  let sim = "-";
  const simLine = lines.find(
    (line) => line.includes("SIM1 ENABLE") || line.includes("SIM2 ENABLE")
  );
  if (simLine) {
    sim = simLine.split(" ")[0].replace(/\D/g, "");
  }

  const findFirstProfileLine = (entries, prefix) => {
    const normalizedPrefix = `+${prefix.toUpperCase()}`;
    const primaryLine = entries.find((line) =>
      line.trim().toUpperCase().startsWith(`${normalizedPrefix}: 1`)
    );

    if (primaryLine) {
      return primaryLine;
    }

    return entries.find((line) =>
      line.trim().toUpperCase().startsWith(`${normalizedPrefix}:`)
    );
  };

  let apn = "Failed fetching APN";
  const apnLine = findFirstProfileLine(lines, "CGCONTRDP");
  if (apnLine) {
    const parts = apnLine.split(",");
    if (parts.length >= 3) {
      apn = parts[2].replace(/\"/g, "").trim();
    }
  }

  let apnIP = "-";
  const apnIpLine = findFirstProfileLine(lines, "CGDCONT");
  if (apnIpLine) {
    const parts = apnIpLine.split(",");
    if (parts.length >= 2) {
      apnIP = parts[1].replace(/\"/g, "").trim();
    }
  }

  let cellLock4GStatus = "0";
  const cellLock4GLine = lines.find((line) =>
    line.includes("LTE,Enable Bands :")
  );
  if (cellLock4GLine) {
    cellLock4GStatus = cellLock4GLine.split(":")[1].replace(/\"/g, "");
  }

  let cellLock5GStatus = "0";
  const cellLock5GLine = lines.find((line) =>
    line.includes("NR5G_SA,Enable Bands :")
  );
  if (cellLock5GLine) {
    cellLock5GStatus = cellLock5GLine.split(":")[1].replace(/\"/g, "");
  }

  let prefNetwork = "-";
  let prefNetworksValue = null;
  const prefNetworkLine = lines.find((line) => line.includes("^SLMODE:"));
  if (prefNetworkLine) {
    prefNetworksValue = prefNetworkLine
      .split(":")[1]
      .split(",")[1]
      .replace(/\"/g, "")
      .trim();

    if (prefNetworksValue === "7") {
      prefNetwork = "AUTO";
    } else if (prefNetworksValue === "2") {
      prefNetwork = "LTE Only";
    } else if (prefNetworksValue === "6") {
      prefNetwork = "NR5G-NSA";
    } else if (prefNetworksValue === "4") {
      prefNetwork = "NR5G-SA";
    }
  }

  let bands = "Failed fetching bands";
  const pccLine = lines.find((line) => line.includes("PCC info:"));
  if (pccLine) {
    const pccBands = pccLine.split(":")[1].split("_")[1].replace(/\D/g, "");

    const sccBands = lines
      .filter((line) => line.includes("SCC"))
      .map((line) => line.split(":")[1].split("_")[1].replace(/\D/g, ""))
      .filter((value) => value.length > 0)
      .join(", ");

    bands = sccBands ? `${pccBands}, ${sccBands}` : pccBands;
  }

  let cellLockStatus = "Not Locked";
  if (cellLock4GStatus == 1 && cellLock5GStatus == 1) {
    cellLockStatus = "Locked to 4G and 5G";
  } else if (cellLock4GStatus == 1) {
    cellLockStatus = "Locked to 4G";
  } else if (cellLock5GStatus == 1) {
    cellLockStatus = "Locked to 5G";
  }

  return {
    sim,
    apn,
    apnIP,
    cellLockStatus,
    prefNetwork,
    bands,
  };
}
