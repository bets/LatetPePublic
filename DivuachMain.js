// version 20250908 - 1600

//remove wordpress css
if (!isLocalhost()) {
    var styles = document.querySelectorAll('style');
    styles.forEach(function (style) {
        style.remove();
    });

    var links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach(function (link) {
        if (link.getAttribute('href') !== 'https://bets.github.io/LatetPePublic/DivuachMain.css') {
            link.remove();
        }
    });
}

function isLocalhost() {
    return window.location.hostname === 'localhost';
}

// CONSTANTS
// column string id in top row in sheet
const REQUIRED_IDS = [
    "nameCol", "mailCol", "monthWorkDays", "kmCol", "kmPayCol", "seniorityGroupCol",
    "activityCol", "seniority1Col", "seniority6Col", "seniority26Col", "seniority100Col",
    "constNameCol", "constValCol", "cancelPayNameCol", "cancelPayValCol"
];

// View-index helpers (map IDs to the projected view order)
const idx = (id) => REQUIRED_IDS.indexOf(id);
const nameCol = idx("nameCol");
const mailCol = idx("mailCol");
const monthWorkDays = idx("monthWorkDays");
const kmCol = idx("kmCol");
const kmPayCol = idx("kmPayCol");
const seniorityGroupCol = idx("seniorityGroupCol");
const activityCol = idx("activityCol");
const seniority1Col = idx("seniority1Col");
const seniority6Col = idx("seniority6Col");
const seniority26Col = idx("seniority26Col");
const seniority100Col = idx("seniority100Col");
const constNameCol = idx("constNameCol");
const constValCol = idx("constValCol");
const cancelPayNameCol = idx("cancelPayNameCol");
const cancelPayValCol = idx("cancelPayValCol");

function isOffice() { return !!officeAdd; }

// Build a GViz tq URL for a public sheet with headers=1 and skip the human header row via OFFSET
function buildGvizUrl({ sheetId, gid, range, tq = "select * offset 1" }) {
    const base = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`;
    const params = new URLSearchParams({ gid: String(gid), headers: "1", tq });
    if (range) params.set("range", range);
    return `${base}?${params.toString()}`;
}

// Create ID -> index map from DataTable column labels; detect duplicates
function buildIdIndexMap(data) {
    const idToIndex = Object.create(null);
    const duplicates = new Set();
    const seen = new Map();
    for (let i = 0; i < data.getNumberOfColumns(); i++) {
        const label = String(data.getColumnLabel(i) ?? "").trim();
        if (!label) continue;
        if (seen.has(label)) duplicates.add(label);
        seen.set(label, i);
        idToIndex[label] = i;
    }
    return { idToIndex, duplicates: Array.from(duplicates) };
}

// Warn on missing IDs; error on duplicate labels
function validateRequiredIds(requiredIds, idToIndex, duplicates) {
    const missing = requiredIds.filter((id) => !(id in idToIndex));
    if (duplicates.length) throw new Error(`Header ID validation failed: Duplicate labels: ${duplicates.join(", ")}`);
    if (missing.length) console.warn(`Header IDs missing (placeholders will be used): ${missing.join(", ")}`);
}

// Build DataView columns: real indices for found IDs; string placeholders for missing IDs
function buildProjectedColumns(requiredIds, idToIndex) {
    return requiredIds.map((id) => {
        if (id in idToIndex) return idToIndex[id];
        return { type: 'string', label: id, calc: () => '' };
    });
}

// Load DataTable via GViz, validate, and return a projected DataView in REQUIRED_IDS order
function loadGvizByIds({ sheetId, gid, requiredIds = REQUIRED_IDS, range } = {}) {
    return new Promise((resolve, reject) => {
        const url = buildGvizUrl({ sheetId, gid, range });
        const query = new google.visualization.Query(url);
        query.send((resp) => {
            if (resp.isError()) return reject(new Error(`GViz error: ${resp.getMessage()} (${resp.getDetailedMessage()})`));
            const data = resp.getDataTable();
            const { idToIndex, duplicates } = buildIdIndexMap(data);
            validateRequiredIds(requiredIds, idToIndex, duplicates);
            const cols = buildProjectedColumns(requiredIds, idToIndex);
            const view = new google.visualization.DataView(data);
            view.setColumns(cols);
            resolve({ view });
        });
    });
}

// Loader + init (no chart packages needed if you don’t draw charts)
var data;
google.charts.load('current', { packages: [] }).then(init);
function init() {
    loadGvizByIds({ sheetId: sourceSheetId, gid: 0 })
        .then(({ view }) => {
            data = view;       // DataView is API-compatible with DataTable: getValue, getNumberOfRows, etc.
            createElements();  // continue app init
        })
        .catch(console.error);
}


// HANDEL DATA FROM SHEETS

/**Create all elements */
function createElements() {
    //CREATE
    makeSelect(getCol(nameCol, mailCol), "payCalcName", true); //and email
    makeSelect(getCol(activityCol), "activityType");
    makeSelect(getCol(seniorityGroupCol), "seniority");
    makeSelect([1, 2, 3, 4, 5, 6, 7], "activityAmount");
    makeSelect(getCol(cancelPayNameCol, cancelPayValCol), "cancelPay");

    //save first row as template
    rowClone = qs("#payCalc tbody tr").cloneNode(true);
    rowClone.querySelectorAll('input').forEach(input => { input.value = ''; });
    setNewRowNum();
    restoreFromStorage();
    addEventListenersOnce();
    addEventListeners();

    if (isOffice()) {
        setOfficeWorkDays();
    } else {
        qs("#prices img").src = getConstValue('תמונת תעריפון');
    }
}

/**Get a column or 2 from sheet db
Return as array of {lable,val}
If only 1 column so val will be index number
*/
function getCol(col, valCol) {
    var rows = [];
    var key;
    for (let i = 0; i < data.getNumberOfRows(); i++) {
        key = getValue(i, col);
        let cell = isNaN(key) ? key?.trim() : key.toString();
        if (cell.length == 0) break;
        rows.push({
            key: key,
            val: valCol ? getValue(i, valCol) : i + 1
        });
    }
    return rows;
}

/** get value from sheet db (starts at 0 from after frozen row) */
function getValue(row, col) {
    return data.getValue(row, col) ?? "";
}

/**
 * Get const value from sheet db by key
 * @param {string} key name of const
 * @returns value in next column
 */
function getConstValue(key) {
    return getCol(constNameCol, constValCol).find((x) => x.key.includes(key)).val;
}

/** Get the data-val from the option of the chosen key */
function getValFromList(rowNum, tdClass) {
    return getListInputDataVal(`[data-rownum='${rowNum}'] .${tdClass} input`);
}
/** Get the data-val from the option of the chosen key */
function getListInputDataVal(selector) {
    let inputElement = qs(selector);
    let option = inputElement.list ? Array.from(inputElement.list.querySelectorAll("option"))
        .find((x) => x.innerText == inputElement.value) : null;
    return option ? option.dataset.val : null;
}

/** Get the data-tag of an option from a list 
 * @param listOption {string} Name of the select option without the tag (tag in {culy brackets})
 * @param listName {string} The class name togther with 'List' is the list Id -> `#${ClassName}List`
 * @returns {string} array of tag names
 */
function getTagsFromListOption(listOption, listName) {
    let option = Array.from(qsa(`#${listName}List option`)).find(
        (x) => x.innerText == listOption
    );
    //slice removes '{}', also min length size
    return (option?.dataset.tag?.length > 2) ? option.dataset.tag.slice(1, -1).split(',').map(t => t.trim()) : null;
}

/** Check if tag name is in an option of a list.
 * Using getTagsFromListOption() function.
 * @param {string} listOption Name of the select option without the tag (tag in {culy brackets})
 * @param {string} listName The class name togther with 'List' is the list Id -> `#${ClassName}List`
 * @param {string} tagName
 * @returns {boolean} 
 */
function isTagInListOption(listOption, listName, tagName) {
    let tags = getTagsFromListOption(listOption, listName);
    return tags?.includes(tagName) ?? false;
}

/** Check if text is in tag name in an option of a list.
 * Using getTagsFromListOption() function.
 * @param {string} listOption Name of the select option without the tag (tag in {culy brackets})
 * @param {string} listName The class name togther with 'List' is the list Id -> `#${ClassName}List`
 * @param {string} tagText The text to check for in the tag (must start with it)
 * @returns {string} Tag text is returned
 */
function getTagWithTextFromListOption(listOption, listName, tagText) {
    let tags = getTagsFromListOption(listOption, listName);
    return tags?.find(t => t.indexOf(tagText) == 0) ?? null;
}

//#region CREATE ELEMENTS
var rowClone;
/**
 * Addes a row and returns the number of the new row added.
 * This will be the last row in table enless there is an auto row added (see addAutoRow())
 * @param {any} e event that triggers the function (if originated form an event)
 * @returns the number of the new row added
 */
function addRow(e) {
    if (e && e.type == "keypress" && e.key != "Enter") return;
    let clone = rowClone.cloneNode(true);
    clone.classList.add("newRow");
    qs("#payCalc tbody").append(clone);

    let rowNum = setNewRowNum();
    addEventListeners();

    //only when add new row and not for autoAddedRow
    if (e && e.type == "keypress" && e.key == "Enter")
        [...qsa("#payCalc tr:not(.autoAddedRow) [type='date']")].pop().focus();

    return rowNum;
}

/**
 * Remove a table row
 * @param {any} e element or event
 * @param {any} ask when true (defualt), user confirm is needed
 * @returns
 */
function removeRow(e, ask = true) {
    if (ask) if (!confirm("בטוח למחוק את השורה?")) return;
    if (e instanceof Event)
        qp("data-rownum", getRowNum(e)).remove();
    else
        e.remove();
    setNewRowNum();
    addEventListeners();
    if (isOffice()) {
        qi("totalFual").innerText = sumCells(".distance:not(.skipSum) [type=text]");
        qi("totalDiedTime").innerText = sumCells("td:not(.skipSum) .distancePay");
    } else {
        qi("totalTravelPay").innerText = sumCells(".travelPay");
    }
    handelPostActivitySumAdditions();
    showErrorMsg();
    if (ask) saveToStorage();
}

/** Set row numbers and make sure auto rows are last*/
function setNewRowNum() {
    //make sure all autoAddedRow are last (but have autoRows the same order (vat/BossCommitment last))
    qsa('tbody .autoAddedRow').forEach((row) => {
        row.parentNode.removeChild(row);
        qs('.tableContainer tbody').appendChild(row);
    });

    let i = 0;
    let newRowNum = 0;
    qsa("#payCalc tbody tr").forEach(function (el) {
        if (el.classList.contains("newRow")) {
            newRowNum = i;
            el.classList.remove("newRow");
        }
        el.dataset.rownum = i++;
    });
    return newRowNum;
}

/** Create a list of options to populate an input */
function makeSelect(options, target, isId) {
    if (options.length == 0) return;
    let selector = isId ? "#" : "#payCalc tbody tr .";
    let input = document.createElement("input");
    input.type = "search";

    if (!qs(selector + target).classList.contains("okEmpty"))
        input.setAttribute("placeholder", "נא לבחור"); // ▼
    input.setAttribute("list", target + "List");
    var datalist = document.createElement("datalist");
    datalist.id = target + "List";
    for (let i in options) {
        let option = document.createElement("option");

        let txt = options[i].key ?? options[i];
        if (isNaN(txt)) {
            let matches = txt.match(/\{.*?\}/);
            if (matches != null) {//matches.length > 0) {
                txt = txt.replace(matches[0], "").trim();
                option.dataset.tag = matches[0];//add a tag for special addones, for now only one tag in this format "{tag name}"
            }
        }
        option.textContent = txt;
        option.dataset.val = options[i].val ?? options[i];
        datalist.appendChild(option);
    }
    qs(selector + target).appendChild(input);
    qi("lists").appendChild(datalist);
}
//#endregion

//#region Local Storage
function saveToStorageDelay() {
    setTimeout(saveToStorage, 1000);
}
function saveToStorage() {
    qsa("#payCalc input").forEach((el) => {
        if (el.type == "checkbox") {
            if (el.checked) el.setAttribute("checked", "");
            else el.removeAttribute("checked");
        } else el.setAttribute("value", el.value);
    });
    let table = qs("#payCalc .tableContainer Table");
    var serializer = new XMLSerializer();
    var tableStr = serializer.serializeToString(table);
    localStorage.setItem("payCalcTable" + officeAdd, tableStr);
    localStorage.setItem("payCalcName" + officeAdd, qs("#payCalcName input").value);
    localStorage.setItem("payCalcSaveTime" + officeAdd, new Date());
    qi("saveInfo").hidden = false;
    displayStorageTime();
}
function clearStorage(ask = true) {
    if (ask) if (!confirm("למחוק הכל ולהתחיל מחדש?")) return;
    localStorage.removeItem("payCalcTable" + officeAdd);
    localStorage.removeItem("payCalcName" + officeAdd);
    localStorage.removeItem("payCalcSaveTime" + officeAdd);
    qs("#payCalcName input").value = "";
    qsa("#payCalc tbody tr").forEach((e) => removeRow(e, false));
    addRow();
    qi("saveInfo").hidden = true;
}
function restoreFromStorage() {
    let saved = localStorage.getItem("payCalcTable" + officeAdd);
    if (saved == null) return;
    qs("#payCalc .tableContainer").innerHTML = saved;
    qs("#payCalcName input").value = localStorage.getItem("payCalcName" + officeAdd);
    qi("saveInfo").hidden = false;
    displayStorageTime();
}
function displayStorageTime() {
    let time = new Date(localStorage.getItem("payCalcSaveTime" + officeAdd));
    qi("saveTime").innerHTML =
        new Date().getDate() == time.getDate()
            ? time.toLocaleTimeString([], { hour12: false })
            : time.toLocaleDateString('he-IL');
}
//#endregion

//#region CALCULATIONS
/** Calculate payment for activity
 Activity has 3 prices based on seniority
 Above times the amount of the activity given that day
*/
function payPerActivity(e) {
    let rowNum = getRowNum(e);
    let activityTypeRow = getValFromList(rowNum, "activityType");
    let seniorityColOffset = getValFromList(rowNum, "seniority"); //index (row) is offset from activity column
    if (seniorityColOffset == "5") seniorityColOffset = "1";// ללא ותק
    let activityAmount = getValFromList(rowNum, "activityAmount");
    let activityTypeKey = qs(`[data-rownum='${rowNum}'] .activityType input`)
        .value;

    if ((!activityTypeRow || !seniorityColOffset || !activityAmount))
        return;
    let singalCost = getValue(
        parseInt(activityTypeRow) - 1,//row
        parseInt(seniorityColOffset) + activityCol//col - how many after the activity column
    );
    let payRowActivity = parseInt(activityAmount) * singalCost;

    let cancelPay = qs(`[data-rownum='${rowNum}'] .cancelPay input`);
    if (cancelPay) { //not in office
        let reduceTo = "" == cancelPay.value ? 0 : getValFromList(rowNum, "cancelPay");
        if (reduceTo) {
            payRowActivity = payRowActivity * reduceTo;
            qs(`[data-rownum='${rowNum}'] .distance input`).value = "";
            qs(`[data-rownum='${rowNum}'] .distance input`).readOnly = true;
            payPerKm(e);
        } else
            qs(`[data-rownum='${rowNum}'] .distance input`).readOnly = false;
    } else {//only office
        if (qs(`[data-rownum='${rowNum}'] .duringOffice`) && qs(`[data-rownum='${rowNum}'] .duringOffice`).checked) { //first check is temp util add .duringOffice to page
            payRowActivity = 0;
        }
    }

    qs(`[data-rownum='${rowNum}'] .activityPay input`).value = payRowActivity;

    handelPostActivitySumAdditions();
}

function setAsCustomRow(rowNum) {
    qs(`[data-rownum='${rowNum}'] .activityPay input`).readOnly = false;
    qs(`[data-rownum='${rowNum}'] .activityPay input`).tabIndex = 0;
    qs(`[data-rownum='${rowNum}'] .activityPay input`).value = "";
    let seniorityInput = qs(`[data-rownum='${rowNum}'] .seniority input`);
    seniorityInput.setAttribute("placeholder", "שם הפעילות");
    seniorityInput.removeAttribute("list");
    seniorityInput.classList.remove("invalidList");
    seniorityInput.value = "";
    qs(`[data-rownum='${rowNum}'] .activityAmount input`).value = 1;
    qs(`[data-rownum='${rowNum}'] .activityAmount input`).readOnly = true;
    qs(`[data-rownum='${rowNum}'] .activityAmount input`).tabIndex = -1;
    qs(`[data-rownum='${rowNum}'] .activityAmount input`).classList.remove("invalidList"); //if was invald before change
}

function setAsRegularRow(rowNum) {
    qs(`[data-rownum='${rowNum}'] .activityPay input`).readOnly = true;
    qs(`[data-rownum='${rowNum}'] .activityPay input`).tabIndex = -1;
    qs(`[data-rownum='${rowNum}'] .activityPay input`).value = 0;
    let seniorityInput = qs(`[data-rownum='${rowNum}'] .seniority input`);
    seniorityInput.setAttribute("placeholder", "נא לבחור");
    seniorityInput.setAttribute("list", "seniorityList");
    seniorityInput.value = "";
    seniorityInput.readOnly = false;
    seniorityInput.tabIndex = 0;
    qs(`[data-rownum='${rowNum}'] .activityAmount input`).value = "";
    qs(`[data-rownum='${rowNum}'] .activityAmount input`).readOnly = false;
    qs(`[data-rownum='${rowNum}'] .activityAmount input`).tabIndex = 0;
    qs(`[data-rownum='${rowNum}'] .activityPay input`).classList.remove("invalidPattern"); //if was invald before change
}


function handelPostActivitySumAdditions() {
    //remove auto Added Rows
    qsa(".autoAddedRow").forEach((el) => el.remove());
    //resum totals
    qi("totalActivityPay").innerText = sumCells(".activityPay input");
    if (!isOffice())
        qi("totalPay").innerText = sumCells(".midSum");

    /* Singal activity supplement */
    const sups = singalSups();
    if (sups > 0)
        autoRowAddition("singalSup", `תוספת פעילות בודדת`, sups * getConstValue("תוספת בודדת"), sups);

    /* 3 fridays with תוספת בודדת in a month bonus */
    const bonusTag = "בונוס שישי שלישי";
    let bonusMonths = getMonthsWith3Fridays();
    //for each month add auto row
    bonusMonths.forEach((month) => autoRowAddition("fridayBonus", bonusTag + ` (${hebMonths[month]})`, getConstValue(bonusTag)));

    //These additions must be last cus calculation is on top of other additions
    let name = qs("#payCalcName input").value;
    if (name) {
        if (isOffice()) {
            /* Subtract bosses pre commitment if tag is with name */
            let debtTag = 'הסכם הנהלה';
            if (isTagInListOption(name, 'payCalcName', debtTag)) {
                let debtValMax = getConstValue(debtTag);
                let activitySum = qi("totalActivityPay").innerText;
                let debtVal = 0; // use when sum is 0 or negative
                if (activitySum > 0)
                    debtVal = activitySum > debtValMax * -1 ? debtValMax : activitySum * -1;
                autoRowAddition("debtRow", debtTag, debtVal);
            }
        } else { // not office
            /* Add VAT if tag is with name */
            let vatSupTag = "";
            if (isTagInListOption(name, 'payCalcName', 'תוספת מע"מ'))
                vatSupTag = 'תוספת מע"מ';
            else if (isTagInListOption(name, 'payCalcName', 'תוספת מע"מ חלקית'))
                vatSupTag = 'תוספת מע"מ חלקית';

            if (vatSupTag) {
                let vatSup = getConstValue(vatSupTag);
                let totVAT = Math.round(vatSup * (sumCells(".activityPay input") + sumCells(".travelPay")));

                autoRowAddition("vatRow", vatSupTag, totVAT);
            }
        }
    }
}

/** Get all months that have at least 3 fridays with תוספת בודדת */
function getMonthsWith3Fridays() {
    //get all the relevant dates
    let eligibleDates = [...qsa("tbody tr:not(.autoAddedRow)")].filter((row) => // not auto added
        new Date(row.querySelector("input[type='date']").value).getDay() == 5 // is friday
        && isTagInListOption(row.querySelector(".activityType input").value, "activityType", "תוספת בודדת") //has תוספת בודדת
        && (isOffice() || !row.querySelector(`.cancelPay input`).value)// was not a canceled event (for not office)
    ).map(row => row.querySelector("input[type='date']").value); // just dates
    // group fridays by month  
    let fridaysByMonth = eligibleDates.reduce((acc, el) => {
        let month = new Date(el).getMonth();
        if (!acc[month]) acc[month] = [];
        // if acc[month] does not already have this friday so add it
        if (!acc[month].includes(el)) acc[month].push(el);
        return acc;
    }, {});

    //list months with at least 3 fridays
    const monthsReturn = Object.entries(fridaysByMonth)
        .filter(([month, fridayList]) => fridayList.length >= 3)
        .map(([month]) => month);
    return monthsReturn;
}

/** Check table for how many singal supplements {תוספת בודדת} are needed */
function singalSups() {
    let spacetimes = {};
    [...qsa("#payCalc tbody tr:not(.autoAddedRow)")] // all rows that are not auto added
        .filter((row) => row.querySelector(`.activityPay input`).value // if activityPay has a value 
            && (isOffice() || !row.querySelector(`.cancelPay input`).value)) // and is office or cancelPay with no value (canceld event no need for bonus, office has no option for cancelPay)
        .forEach((row) => {
            let activityInput = row.querySelector(".activityType input");
            // remove leading and trailing spaces and make spacetime string
            let spacetime = [...row.querySelectorAll(`.spacetime input`)].map((x) => x.value?.trim()).join();
            let activityAmount = row.querySelector(`.activityAmount input`).value;
            //check if this spacetime is already in spacetimes and add activityAmount
            if (spacetimes[spacetime])
                spacetimes[spacetime].amount += parseInt(activityAmount);
            else {
                spacetimes[spacetime] = {};
                spacetimes[spacetime].amount = parseInt(activityAmount);
                // Mark if activity has {תוספת בודדת } tag
                spacetimes[spacetime].hasTag = isTagInListOption(activityInput.value, "activityType", "תוספת בודדת");
            }
        });
    // return how many spacetimes have the value 1 and the tag
    let singalSupSpacetimes = Object.keys(spacetimes).filter((spacetime) => spacetimes[spacetime].hasTag && spacetimes[spacetime].amount == 1);
    return singalSupSpacetimes.length;
}

/**
 * Auto additions to bottom of table
 * Office - Subtract bosses pre commitment if tag {הסכם הנהלה} is with user name.
 * Not office - Add VAT if tag {תוספת מע"מ חלקית} or {תוספת מע"מ} is with user name.
 * All - Add bonus when user has 3 friday activities. Const = בונוס שישי שלישי.
 * All - Add bonus when singal activitie {תוספת בודדת}.
 * @param {string} rowId
 * @param {string} rowDescription 
 * @param {int} addedSumVal 
 */
function autoRowAddition(rowId, rowDescription, addedSumVal, activityAmount = 1) {
    let rowNum = addRow();
    qs(`[data-rownum='${rowNum}']`).id = rowId;
    qs(`[data-rownum='${rowNum}']`).classList.add('autoAddedRow');
    qs(`[data-rownum='${rowNum}'] .spacetime input[type=date]`).valueAsDate = new Date();
    qsa(`[data-rownum='${rowNum}'] .spacetime input[type=text]`).forEach(input => input.value = '-');
    qs(`[data-rownum='${rowNum}'] .activityType input`).value = 'אחר';
    qs(`[data-rownum='${rowNum}'] .activityAmount input`).value = activityAmount;
    qs(`[data-rownum='${rowNum}'] .seniority input`).value = rowDescription;
    qs(`[data-rownum='${rowNum}'] .seniority input`).setAttribute("title", rowDescription);
    qs(`[data-rownum='${rowNum}'] .seniority input`).classList.add('cursorDefault');
    qs(`[data-rownum='${rowNum}'] .seniority`).classList.add('lInput');
    qs(`[data-rownum='${rowNum}'] .distance input`).value = '';
    qs(`[data-rownum='${rowNum}'] .distance input`).setAttribute("placeholder", "-");
    qs(`[data-rownum='${rowNum}'] .activityPay input`).value = addedSumVal;
    qsa(`[data-rownum='${rowNum}'] input`).forEach(input => { input.readOnly = true; input.tabIndex = -1; });
    qs(`[data-rownum='${rowNum}'] .seniority input`).removeAttribute("list");
    qs(`[data-rownum='${rowNum}'] .seniority input`).classList.remove("invalidList");
    qs(`[data-rownum='${rowNum}'] .removeRow`).innerText = '';

    qi("totalActivityPay").innerText = sumCells(".activityPay input");
    if (!isOffice()) {
        qi("totalPay").innerText = sumCells(".midSum");
    }

    //make sure this row is last in table and renumber them
    let newRow = qi(rowId);
    newRow.parentNode.removeChild(newRow);
    qs('.tableContainer tbody').appendChild(newRow);
    setNewRowNum();
}

/**
 * If fuel checked add/remove .skipSum to parent td
 * @param {any} rowNum
 * @returns {boolean} Use fuel is checked
 */
function handelFuel(rowNum) {
    let useFuel = qs(`[data-rownum='${rowNum}'] .fuel`).checked;
    let fuelTD = qs(`[data-rownum='${rowNum}'] .fuel`).closest('td');
    if (useFuel) fuelTD.classList.remove("skipSum");
    else fuelTD.classList.add("skipSum");
    return useFuel;
}

/**
 * Set expected work days by name
 * Subtract sick, vacation... days used
 */
function setOfficeWorkDays() {
    let name = qs("#payCalcName input").value;
    if (name == "") return;

    let workDays = parseFloat(getCol(nameCol, monthWorkDays).find((x) => x.key.includes(name)).val);
    workDays -= parseFloat(qi("vacationDays").value);
    workDays -= parseFloat(qi("sickDays").value);
    workDays -= parseFloat(qi("armyDays").value);
    workDays -= parseFloat(qi("missDays").value);

    qi("workDays").value = workDays;
}

/**
 * When activity type is tagged with הערה and it was shown already stop showing it
 */
var stopShowKeyNote = [];

/**
 * When activity type is tagged and/or something needs to change before calculation
 */
function handelActivityTypeTagPre(e) {
    let activityTypeKey = e.target.value;
    let rowNum = getRowNum(e);

    if (activityTypeKey == "אחר") {
        setAsCustomRow(rowNum);
    } else setAsRegularRow(rowNum);//reset nodes if changed back to defualt

    if (isTagInListOption(activityTypeKey, "activityType", "מוגבל ל1")) {
        qs(`[data-rownum='${rowNum}'] .activityAmount input`).value = 1;
        qs(`[data-rownum='${rowNum}'] .activityAmount input`).readOnly = true;
        qs(`[data-rownum='${rowNum}'] .activityAmount input`).tabIndex = -1;
    }
    if (isTagInListOption(activityTypeKey, "activityType", "ללא ותק")) {
        qs(`[data-rownum='${rowNum}'] .seniority input`).value = "ללא ותק";
        qs(`[data-rownum='${rowNum}'] .seniority input`).readOnly = true;
        qs(`[data-rownum='${rowNum}'] .seniority input`).tabIndex = -1;
    }
    let tagText = getTagWithTextFromListOption(activityTypeKey, "activityType", "הערה:");
    if (tagText && !stopShowKeyNote.includes(activityTypeKey)) {
        let dialog = qi("activityExplain");
        dialog.querySelector("h3").innerText = activityTypeKey;
        dialog.querySelector("p").innerText = tagText.replace("הערה:", "").trim();
        dialog.showModal();

        stopShowKeyNote.push(activityTypeKey);
    }
    //not sure if this is needed
    //else if (qs(`[data-rownum='${rowNum}'] .seniority input`).value == "ללא ותק") {
    //    qs(`[data-rownum='${rowNum}'] .seniority input`).value = "";
    //    qs(`[data-rownum='${rowNum}'] .seniority input`).readOnly = false;
    //}
    showErrorMsg();
}

function getRowNum(e) {
    let el = e.target ?? e;
    return el.closest("tr").dataset.rownum;
}

function sumCells(selector) {
    return Array.from(qsa(selector)).reduce(
        (sum, el) => {
            var elNum = parseInt(el.value ? el.value : el.innerText);
            if (isNaN(elNum))
                elNum = 0;
            return sum + elNum;
        },
        0
    );
}
//#endregion

//#region EVENTS
function addEventListenersOnce() {
    action("#send", "click", send);
    action("#saveI", "mouseenter,mouseleave", popSaveExplain);
    action("#clearStorageBtn", "click", clearStorage);
    action(".openDialog", "click", (ev) => qi(ev.target.dataset.dialogid).showModal());
    action(".close", "click", () => qs('dialog[open]').close());
    action("#payCalcName input", 'change', handelPostActivitySumAdditions);

    if (isOffice()) {
        action("#payCalcName input", 'change', setOfficeWorkDays);
        action(".teamData [type='number']", 'change', setOfficeWorkDays);
    } else {
        action("#receipt", "change", isReceiptAttached);
        action("#receipt", "change", unhideReceiptNotice);
    }
}

function addEventListeners() {
    action(".tableContainer input", 'change', saveToStorageDelay);
    action("#addRow", "click, keypress", addRow);
    action(".removeRow", "click", removeRow);
    action(".activityType input", "change", handelActivityTypeTagPre);
    action(".activity input", "change", payPerActivity);

    action(".distance [type=text]", "keyup", payPerKm);
    action(".distance [type=text]", "keyup", handelPostActivitySumAdditions);
    action("tbody [type=checkbox]", "change", payPerKm);
    action("tbody [type=checkbox]", "change", handelPostActivitySumAdditions);

    action("#payCalc .activityPay,.spacetime input", "change", handelPostActivitySumAdditions);

    action("[list]", "change", isFromList);
    action("#payCalc [type='date']", "change", checkDate);
    action("[pattern]", "change", isPatternMatch);
    action("#payCalc .notEmpty input", "change", isTextNotEmpty);
}

function popSaveExplain(event) {
    if (event.type === 'mouseenter') {
        qi("saveExplain").show();
    } else {
        qi("saveExplain").close();
    }
}

function unhideReceiptNotice() {
    qi("receiptNotice").classList.remove("hide");
}
function showPrices() {
    let dialog = qi("prices");
    dialog.showModal();
}
//#endregion

//#region VALIDATIONS
function isFromList(e) {
    isFromListCheck(e.target);
}
//returns false if invalid
function isFromListCheck(el) {
    if (!el.list) return true;
    let option = Array.from(el.list.querySelectorAll("option")).find(
        (x) => x.innerText == el.value
    );
    if (option != null || (el.value == "" && el.parentElement.classList.contains("okEmpty")))
        el.classList.remove("invalidList");
    else el.classList.add("invalidList");
    showErrorMsg();
    return !el.classList.contains("invalidList");
}
function isListNotEmpty() {
    qsa("#payCalc [list]").forEach((el) => {
        if (el.value && isFromListCheck(el)) {
            el.classList.remove("invalidList");
        } else if (!(el.value == "" && el.parentElement.classList.contains("okEmpty")))
            el.classList.add("invalidList");
    });
}
function checkDate() {
    qsa("#payCalc [type='date']").forEach((el) => {
        if (el.value != "") {
            el.classList.remove("invalidDate");
        } else {
            el.classList.add("invalidDate");
        }
    });
    showErrorMsg();
}

function isAlreadySent() {
    if (qi("send").innerText == "נשלח")
        return !confirm("המידע כבר נשלח ונקלט במשרד.\n בכל זאת לשלוח שוב?");
    return false;
}
function isPatternMatch() {
    qsa("#payCalc [pattern]").forEach((el) => {
        if (el.checkValidity()) {
            el.classList.remove("invalidPattern");
        } else {
            el.classList.add("invalidPattern");
        }
    });
    showErrorMsg();
}
function isTextNotEmpty(event) {
    let els = event ? [event.target] : qsa("#payCalc .notEmpty input");
    els.forEach((el) => {
        if (el.value) {
            el.classList.remove("invalidEmpty");
        } else {
            el.classList.add("invalidEmpty");
        }
    });
    showErrorMsg();
}

//#endregion

function sanitizeEmail(email) {
    return email
        .trim()
        // Remove all directional formatting and zero-width characters
        .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
        // Remove other invisible formatting characters
        .replace(/[\p{Cf}]/gu, '')
        // Normalize problematic whitespace
        .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function addStyle(clone, selector, styleName, style) {
    clone.querySelectorAll(selector).forEach((e) => {
        e.style[styleName] = style;
    });
}

async function postData(formData, webhook) {
    let submitByDay = getValue(1, constValCol);
    let today = new Date();
    let monthTab =
        today.getDate() > submitByDay
            ? today.getMonth() + 1
            : today.getMonth();
    if (monthTab == 0) monthTab = 12;
    let targetSheetRange = `${monthTab}!A1:N900`;
    formData.append("range", targetSheetRange);

    let year = today.getFullYear();
    //When new year (Jan) but still reporting Dec of last year
    if (today.getMonth() == 0 && today.getDate() <= submitByDay)
        year = year - 1;
    let reportDate = `${monthTab}/${year}`;
    //reportDate = `1/2026`; // JUST FOR DEBUG!!
    formData.append("reportDate", reportDate);

    let emailTo = getListInputDataVal("#payCalcName input");
    emailTo = sanitizeEmail(emailTo);
    formData.set("emailTo", emailTo);//set replaces an old formData.append( or appends if it does not exits yet

    const response = await fetch(webhook, {
        method: "POST",
        cache: "no-store",
        body: formData
    });
    qi("loading").classList.add("hide");
    if (response.ok) {
        qi("send").innerText = "נשלח";
        let text = await response.text(); //.json()
        console.log(text);
        alert(
            "נשלח בהצלחה!\nעותק הועבר למייל " +
            emailTo
        );
        clearStorage(false);
    } else {
        qi("send").innerText = "שליחה";
        let json = await response.json();
        console.log(json);
        alert("לא הצלחנו לשלוח - נא לנסות שוב.\nשגיאה:\n" + json.message);
    }
}

// SELECTORS
/**  document.querySelector */
function qs(s) {
    return document.querySelector(s);
}
/**  document.querySelectorAll */
function qsa(s) {
    return document.querySelectorAll(s);
}
/**  document.getElementById */
function qi(s) {
    return document.getElementById(s);
}
/**  document.getElementsByClassName(s)[0] */
function qc(s) {
    return document.getElementsByClassName(s)[0];
}
/**  document.getElementsByClassName */
function qca(s) {
    return document.getElementsByClassName(s);
}
/**
 * Select by attribute name and value
 * querySelector(`[${attributeName}="${val}"]`)
 * @param {any} attributeName
 * @param {any} val
 * @returns
 */
function qp(attributeName, val) {
    return document.querySelector(`[${attributeName}="${val}"]`);
}
/**  console.log(txt) */
function cl(txt) {
    console.log(txt);
}
/**
 * Add event listener to element, works with singal or many selectors, elements & events
 * @param {string} selector element selector/s, comma separated
 * @param {string} events event name/s, comma separated 
 * @param {any} func one function or function name to execute
 */
function action(selector, events, func) {
    qsa(selector).forEach(el => {
        events.replaceAll(" ", "").split(",").forEach(e => {
            // Check if element has custom property _eventListeners and create it if not
            if (!el.hasOwnProperty('_eventListeners')) {
                el['_eventListeners'] = {};
            }
            // Check if the event listener is already added
            if (!el['_eventListeners'][`${e}>${func.name}`]) {
                el.addEventListener(e, func);
                // Mark this event as added for this element
                el['_eventListeners'][`${e}>${func.name}`] = true;
            }
        });
    });
}

// array of month names in hebrew
const hebMonths = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר"
];
