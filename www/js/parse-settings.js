function describePrefNetworkValue(value) {
  const labels = {
    0: "Auto",
    1: "3G Only",
    2: "4G / LTE Only",
    3: "3G + 4G / LTE",
    4: "5G Only",
    5: "3G + 5G",
    6: "4G / LTE + 5G",
    7: "3G + 4G / LTE + 5G",
  };

  if (!Number.isInteger(value) || value < 0) {
    return "Unknown";
  }

  return labels[value] || "Unknown";
}

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
  let prefNetworkValue = null;
  const prefNetworkLine = lines.find((line) => line.includes("^SLMODE:"));
  if (prefNetworkLine) {
    const parsedValue = Number.parseInt(
      prefNetworkLine
      .split(":")[1]
      .split(",")[1]
      .replace(/\"/g, "")
      .trim(),
      10
    );

    if (!Number.isNaN(parsedValue)) {
      prefNetworkValue = parsedValue;
      prefNetwork = describePrefNetworkValue(parsedValue);
    }
  }

  let nr5gModeValue = null;
  const nr5gModeLine = lines.find((line) => line.includes("^NR5G_MODE:"));
  if (nr5gModeLine) {
    const parsedValue = Number.parseInt(
      nr5gModeLine.split(":")[1].replace(/\"/g, "").trim(),
      10
    );

    if (!Number.isNaN(parsedValue)) {
      nr5gModeValue = parsedValue;
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
    prefNetworkValue,
    bands,
    nr5gModeValue,
  };
}

function describeNr5gMode(value) {
  const labels = {
    0: "Auto",
    1: "NSA",
    2: "SA",
  };

  if (!Number.isInteger(value) || value < 0) {
    return "Unknown";
  }

  return labels[value] || "Unknown";
}
