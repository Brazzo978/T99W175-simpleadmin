/**
 * EARFCN/PCI Input Field Generator
 *
 * Dynamically generates EARFCN (E-UTRA Absolute Radio Frequency Channel Number)
 * and PCI (Physical Cell ID) input fields based on the number of cells specified.
 * Fields use Alpine.js x-model directives for two-way data binding.
 *
 * @module generate-freq-box
 * @requires Alpine.js
 */

/**
 * Generates HTML for multiple EARFCN/PCI input field pairs.
 *
 * @param {number} num - Number of cell pairs to generate (max 10)
 * @returns {string} HTML string containing input field groups
 *
 * Each pair includes:
 * - EARFCN input field (E-UTRA frequency channel number)
 * - PCI input field (physical cell identifier)
 * - Alpine.js conditional visibility (only shows in LTE mode)
 * - Two-way data binding via x-model
 *
 * The number of fields is capped at 10 for performance and usability.
 */
function generateFreqNumberInputs(num) {
  const safeNum = Number.isFinite(num) ? num : 0;
  let html = "";
  const maxFields = Math.min(Math.max(safeNum, 0), 10); // Limit to a maximum of 10 fields
  for (let i = 1; i <= maxFields; i++) {
    html += `
    <div class="input-group mb-3" x-show="cellNum >= ${i} && networkModeCell == 'LTE'">
      <input
        type="text"
        id="earfcn${i}"
        name="earfcn${i}"
        aria-label="EARFCN"
        placeholder="EARFCN"
        class="form-control"
        x-model="earfcn${i}"
      />
      <input
        type="text"
        id="pci${i}"
        name="pci${i}"
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

/**
 * Initialize frequency input fields on page load.
 *
 * Sets up dynamic generation of EARFCN/PCI input fields based on the
 * selected number of cells. Re-renders fields when the cell number changes.
 */
document.addEventListener("DOMContentLoaded", function () {
  const freqNumbersContainer = document.getElementById("freqNumbersContainer");
  const cellNumInput = document.querySelector("[aria-label='NumCells']");

  // Validate required elements exist
  if (!freqNumbersContainer || !cellNumInput) {
    console.warn(
      "Unable to initialize frequency fields: required elements are missing."
    );
    return;
  }

  /**
   * Re-renders input fields based on the number of cells.
   *
   * @param {string|number} value - The number of cells to generate fields for
   */
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
