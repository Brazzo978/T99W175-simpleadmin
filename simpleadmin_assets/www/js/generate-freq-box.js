function generateFreqNumberInputs(num) {
  const safeNum = Number.isFinite(num) ? num : 0;
  let html = "";
  const maxFields = Math.min(Math.max(safeNum, 0), 10); // Limit to a maximum of 10 fields
  for (let i = 1; i <= maxFields; i++) {
    html += `
    <div class="input-group mb-3" x-show="cellNum >= ${i} && networkModeCell == 'LTE'">
      <input
        type="text"
        aria-label="EARFCN"
        placeholder="EARFCN"
        class="form-control"
        x-model="earfcn${i}"
      />
      <input
        type="text"
        aria-label="PCI"
        placeholder="PCI"
        class="form-control"
        x-model="pci${i}"
      />
    </div>
  `;
  }
  return html;
}

document.addEventListener("DOMContentLoaded", function () {
  const freqNumbersContainer = document.getElementById("freqNumbersContainer");
  const cellNumInput = document.querySelector("[aria-label='NumCells']");

  if (!freqNumbersContainer || !cellNumInput) {
    console.warn(
      "Unable to initialize frequency fields: required elements are missing."
    );
    return;
  }

  const renderInputs = (value) => {
    const numericValue = Number.parseInt(value, 10);
    freqNumbersContainer.innerHTML = generateFreqNumberInputs(numericValue);
  };

  cellNumInput.addEventListener("input", function () {
    renderInputs(this.value);
  });

  // Render initial state based on any pre-filled value
  renderInputs(cellNumInput.value);
});
